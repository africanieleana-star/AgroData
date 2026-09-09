// -----------------------------------------------------------------------
// SINCRONIZADOR CON LA NUBE (con protección de las claves de sesión)
// -----------------------------------------------------------------------
// La app (App.jsx) sigue guardando todo con localStorage, exactamente
// igual que antes. Este archivo "espía" cada guardado y sube una copia
// completa a Firestore, asociada al uid del usuario logueado.
//
// IMPORTANTE: Firebase Auth también usa localStorage para guardar su
// propia sesión (claves que empiezan con "firebase:"). Este archivo
// NUNCA toca esas claves al subir, borrar o restaurar datos — solo
// sincroniza los datos propios de la app (fichas de animales, tareas,
// etc.). Si se llegaran a pisar esas claves, la sesión se corta sola.
// -----------------------------------------------------------------------

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);
const originalClear = localStorage.clear.bind(localStorage);

let uidActual = null;
let sincronizacionActiva = false;
let restaurando = false;
let timeoutGuardado = null;

// Hay un cambio local que todavía no se confirmó guardado en la nube.
let pendienteDeSubir = false;

// Cuántas veces reintentamos seguidas por una falla (para ir espaciando
// los reintentos y no bombardear Firestore si hay un problema persistente).
let intentosFallidos = 0;
const ESPERAS_REINTENTO = [3000, 8000, 20000, 45000]; // 3s, 8s, 20s, 45s...

// Claves que NUNCA hay que subir, borrar ni pisar: son internas de
// Firebase (por ejemplo, la sesión de Firebase Auth). Si se llegaran a
// tocar, se puede cortar la sesión del usuario sin que haga nada.
const PREFIJOS_RESERVADOS = ["firebase:", "firebaseLocalStorageDb", "firebase-heartbeat"];

function esClaveReservada(clave) {
  return PREFIJOS_RESERVADOS.some((prefijo) => clave.startsWith(prefijo));
}

// Estado actual, consultable desde la UI.
// "sincronizado" | "guardando" | "error" | "sin_conexion" | "inactivo"
let estadoActual = "inactivo";
const listeners = new Set();

function fijarEstado(nuevoEstado) {
  estadoActual = nuevoEstado;
  listeners.forEach((cb) => {
    try {
      cb(estadoActual);
    } catch (e) {
      // un listener roto no debe tirar abajo la sincronización
    }
  });
}

/** Devuelve el estado actual de sincronización (string). */
export function getEstadoSync() {
  return estadoActual;
}

/**
 * Se suscribe a los cambios de estado de sincronización. Devuelve una
 * función para des-suscribirse (usar en el cleanup de un useEffect).
 */
export function subscribeEstadoSync(callback) {
  listeners.add(callback);
  callback(estadoActual);
  return () => listeners.delete(callback);
}

// Junta todo lo que hay en localStorage en un solo objeto para subirlo
// entero, EXCLUYENDO las claves reservadas de Firebase.
function leerTodoLocalStorage() {
  const copia = {};
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    if (esClaveReservada(clave)) continue;
    copia[clave] = localStorage.getItem(clave);
  }
  return copia;
}

// Borra únicamente las claves de la app (todas menos las reservadas de
// Firebase), para no pisar la sesión que Firebase Auth acaba de escribir.
function borrarSoloDatosDeApp() {
  const claves = [];
  for (let i = 0; i < localStorage.length; i++) claves.push(localStorage.key(i));
  claves.forEach((clave) => {
    if (!esClaveReservada(clave)) originalRemoveItem(clave);
  });
}

// Intenta subir ahora mismo (sin esperar el debounce). Devuelve true/false
// según si se pudo confirmar el guardado en Firestore.
async function subirAhora() {
  if (!uidActual) return false;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    fijarEstado("sin_conexion");
    return false;
  }

  fijarEstado("guardando");
  try {
    const datos = leerTodoLocalStorage();
    await setDoc(doc(db, "usuarios", uidActual), {
      datos,
      actualizado: new Date().toISOString(),
    });
    pendienteDeSubir = false;
    intentosFallidos = 0;
    fijarEstado("sincronizado");
    return true;
  } catch (e) {
    console.error("No se pudo sincronizar con la nube:", e);
    fijarEstado("error");
    programarReintento();
    return false;
  }
}

// Si falló, reintenta solo, con esperas cada vez más largas, hasta que
// se confirme el guardado o el usuario cierre sesión / se vaya de la app.
function programarReintento() {
  if (!sincronizacionActiva || !uidActual) return;
  const espera = ESPERAS_REINTENTO[Math.min(intentosFallidos, ESPERAS_REINTENTO.length - 1)];
  intentosFallidos += 1;
  setTimeout(() => {
    if (pendienteDeSubir && sincronizacionActiva) subirAhora();
  }, espera);
}

// Sube el estado actual de localStorage a Firestore, con una pequeña
// espera (debounce) para no mandar un pedido por cada letra escrita.
function programarSubida() {
  if (!sincronizacionActiva || !uidActual || restaurando) return;
  pendienteDeSubir = true;
  fijarEstado("guardando");
  clearTimeout(timeoutGuardado);
  timeoutGuardado = setTimeout(() => {
    subirAhora();
  }, 1000);
}

// A partir de acá, cada vez que App.jsx (o Firebase) llame a
// localStorage.setItem / .removeItem, se guarda igual que siempre, pero
// solo se dispara la subida a la nube si la clave NO es reservada.
localStorage.setItem = function (clave, valor) {
  originalSetItem(clave, valor);
  if (!esClaveReservada(clave)) programarSubida();
};

localStorage.removeItem = function (clave) {
  originalRemoveItem(clave);
  if (!esClaveReservada(clave)) programarSubida();
};

localStorage.clear = function () {
  // Si algo llama a clear() a lo bruto, igual protegemos la sesión:
  // guardamos las claves reservadas, limpiamos todo, y las reponemos.
  const reservadas = {};
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    if (esClaveReservada(clave)) reservadas[clave] = localStorage.getItem(clave);
  }
  originalClear();
  Object.keys(reservadas).forEach((clave) => originalSetItem(clave, reservadas[clave]));
  programarSubida();
};

// Si vuelve la conexión y había algo pendiente, reintenta enseguida.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (pendienteDeSubir && sincronizacionActiva) {
      intentosFallidos = 0;
      subirAhora();
    }
  });
  window.addEventListener("offline", () => {
    if (sincronizacionActiva) fijarEstado("sin_conexion");
  });

  // Si el usuario intenta cerrar la pestaña/navegador con cambios sin
  // confirmar en la nube, el navegador le muestra una advertencia nativa.
  window.addEventListener("beforeunload", (e) => {
    if (sincronizacionActiva && pendienteDeSubir) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

/**
 * Se llama justo después de loguearse. Trae los datos guardados en la nube
 * para esa cuenta y los vuelca en el localStorage de este dispositivo, SIN
 * tocar la sesión de Firebase Auth que se acaba de escribir.
 */
export async function iniciarSincronizacion(uid) {
  uidActual = uid;
  restaurando = true;
  fijarEstado("guardando");
  try {
    const referencia = doc(db, "usuarios", uid);
    const snapshot = await getDoc(referencia);

    if (snapshot.exists() && snapshot.data().datos) {
      // Ya hay datos en la nube para esta cuenta: los usamos como fuente
      // de verdad y reemplazan lo que hubiera en este dispositivo (menos
      // la sesión de Firebase, que no se toca).
      borrarSoloDatosDeApp();
      const datosNube = snapshot.data().datos;
      Object.keys(datosNube).forEach((clave) => {
        if (!esClaveReservada(clave)) originalSetItem(clave, datosNube[clave]);
      });
    } else {
      // Primera vez que esta cuenta se loguea: subimos lo que ya hubiera
      // cargado en este dispositivo (si hubiera algo) como punto de partida.
      const datosLocales = leerTodoLocalStorage();
      await setDoc(referencia, {
        datos: datosLocales,
        actualizado: new Date().toISOString(),
      });
    }
    fijarEstado("sincronizado");
  } catch (e) {
    console.error("No se pudo traer los datos de la nube:", e);
    fijarEstado("error");
  } finally {
    restaurando = false;
    sincronizacionActiva = true;
  }
}

/**
 * Se llama al cerrar sesión. Espera (o fuerza) a que cualquier cambio
 * pendiente se confirme guardado en la nube antes de borrar el
 * dispositivo (sin tocar la sesión de Firebase, que se cierra aparte
 * con signOut). Si no se pudo confirmar el guardado, NO borra nada y
 * devuelve { exito: false } para que la pantalla de logout pueda avisar.
 */
export async function detenerSincronizacion() {
  let exito = true;

  if (pendienteDeSubir && uidActual) {
    for (let intento = 0; intento < 3 && pendienteDeSubir; intento++) {
      // eslint-disable-next-line no-await-in-loop
      exito = await subirAhora();
      if (!exito && intento < 2) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  if (exito) {
    sincronizacionActiva = false;
    uidActual = null;
    pendienteDeSubir = false;
    intentosFallidos = 0;
    borrarSoloDatosDeApp();
    fijarEstado("inactivo");
  }

  return { exito };
}
