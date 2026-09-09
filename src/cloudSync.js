// -----------------------------------------------------------------------
// SINCRONIZADOR CON LA NUBE (versión con protecciones anti-pérdida de datos)
// -----------------------------------------------------------------------
// La app (App.jsx) sigue guardando todo con localStorage, exactamente
// igual que antes. Este archivo "espía" cada guardado y sube una copia
// completa a Firestore, asociada al uid del usuario logueado.
//
// NOVEDADES respecto a la versión anterior:
//
//  1. Estado de sincronización visible y consultable ("guardando",
//     "sincronizado", "error", "sin conexión"), para que la app pueda
//     mostrarle al usuario si sus datos están realmente a salvo.
//
//  2. Reintentos automáticos con espera creciente si falla la subida
//     (por ejemplo, sin internet), en vez de fallar en silencio.
//
//  3. Si se pierde la conexión, se reintenta solo apenas vuelve internet
//     (evento 'online' del navegador).
//
//  4. detenerSincronizacion() ahora es asíncrona: si hay una subida
//     pendiente, ESPERA a que termine (o lo intenta con fuerza) antes
//     de limpiar el dispositivo. Devuelve si se pudo confirmar el
//     guardado o no, para que la pantalla de logout pueda avisarle al
//     usuario si hiciera falta.
//
//  5. Aviso del navegador si el usuario intenta cerrar la pestaña con
//     cambios sin confirmar en la nube (beforeunload).
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

// Junta todo lo que hay en localStorage en un solo objeto para subirlo entero.
function leerTodoLocalStorage() {
  const copia = {};
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    copia[clave] = localStorage.getItem(clave);
  }
  return copia;
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

// A partir de acá, cada vez que App.jsx llame a localStorage.setItem o
// .removeItem, además de guardar localmente, se dispara la subida a la nube.
localStorage.setItem = function (clave, valor) {
  originalSetItem(clave, valor);
  programarSubida();
};

localStorage.removeItem = function (clave) {
  originalRemoveItem(clave);
  programarSubida();
};

localStorage.clear = function () {
  originalClear();
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
 * para esa cuenta y los vuelca en el localStorage de este dispositivo.
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
      // de verdad y reemplazan lo que hubiera en este dispositivo.
      originalClear();
      const datosNube = snapshot.data().datos;
      Object.keys(datosNube).forEach((clave) => {
        originalSetItem(clave, datosNube[clave]);
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
 * Se llama al cerrar sesión. A diferencia de la versión anterior, ahora
 * ESPERA (o fuerza) a que cualquier cambio pendiente se confirme guardado
 * en la nube antes de borrar el dispositivo. Si después de varios
 * intentos no se pudo confirmar (por ejemplo, sin internet), NO borra
 * nada y devuelve { exito: false } para que la pantalla de logout pueda
 * avisarle al usuario en vez de arriesgarse a perder datos.
 *
 * Uso sugerido en App.jsx:
 *
 *   const manejarCerrarSesion = async () => {
 *     const resultado = await detenerSincronizacion();
 *     if (!resultado.exito) {
 *       const seguir = window.confirm(
 *         "No se pudo confirmar que tus últimos cambios se guardaron en " +
 *         "la nube (¿estás sin internet?). Si cerrás sesión igual, podrías " +
 *         "perder lo último que cargaste. ¿Cerrar sesión de todas formas?"
 *       );
 *       if (!seguir) return;
 *     }
 *     await signOut(auth);
 *     // ... resto del logout (redirigir a login, etc.)
 *   };
 */
export async function detenerSincronizacion() {
  let exito = true;

  if (pendienteDeSubir && uidActual) {
    // Intentamos confirmar el guardado hasta 3 veces antes de rendirnos,
    // dándole al usuario la mejor chance de no perder nada.
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
    originalClear();
    fijarEstado("inactivo");
  }

  return { exito };
}
