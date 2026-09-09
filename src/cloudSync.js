// -----------------------------------------------------------------------
// SINCRONIZADOR CON LA NUBE (con protección de sesión + backups diarios)
// -----------------------------------------------------------------------
// La app (App.jsx) sigue guardando todo con localStorage, exactamente
// igual que antes. Este archivo "espía" cada guardado y sube una copia
// completa a Firestore, asociada al uid del usuario logueado.
//
// Protecciones:
//  - Nunca toca las claves de sesión de Firebase Auth ("firebase:...").
//  - Reintenta solo si falla la subida, y avisa si no se pudo confirmar.
//  - El logout espera la confirmación antes de borrar el dispositivo.
//  - Guarda una copia de cada día en usuarios/{uid}/backups/{AAAA-MM-DD},
//    para poder volver atrás si algo se corrompe o se borra por error.
//    Se conservan los últimos 30 días; los más viejos se eliminan solos.
//  - NUEVO: cada operación contra el servidor tiene un tiempo máximo de
//    espera (15 segundos). Si la red no contesta ni con éxito ni con
//    error dentro de ese tiempo (por ejemplo, por un firewall o una red
//    restringida que bloquea la conexión sin avisar), se lo trata como
//    un error y se reintenta más tarde, en vez de quedarse mostrando
//    "Guardando..." para siempre.
// -----------------------------------------------------------------------

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit as limitarConsulta,
} from "firebase/firestore";
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

let intentosFallidos = 0;
const ESPERAS_REINTENTO = [3000, 8000, 20000, 45000]; // 3s, 8s, 20s, 45s...

const DIAS_DE_RETENCION_BACKUPS = 30;

// Tiempo máximo que se espera una respuesta del servidor antes de darse
// por vencido y tratarlo como un error (para poder reintentar en vez de
// quedarse esperando para siempre).
const TIEMPO_MAXIMO_ESPERA_MS = 15000; // 15 segundos

// Envuelve cualquier operación contra Firestore para que, si no responde
// dentro del tiempo máximo, se la considere fallida (en vez de quedarse
// esperando indefinidamente). La operación original puede seguir
// resolviéndose "en segundo plano" más tarde; simplemente dejamos de
// esperarla acá.
function conTiempoLimite(promesaOriginal, ms = TIEMPO_MAXIMO_ESPERA_MS) {
  return Promise.race([
    promesaOriginal,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Tiempo de espera agotado conectando con el servidor")),
        ms
      )
    ),
  ]);
}

// Claves que NUNCA hay que subir, borrar ni pisar: son internas de
// Firebase (por ejemplo, la sesión de Firebase Auth).
const PREFIJOS_RESERVADOS = ["firebase:", "firebaseLocalStorageDb", "firebase-heartbeat"];

function esClaveReservada(clave) {
  return PREFIJOS_RESERVADOS.some((prefijo) => clave.startsWith(prefijo));
}

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

export function getEstadoSync() {
  return estadoActual;
}

export function subscribeEstadoSync(callback) {
  listeners.add(callback);
  callback(estadoActual);
  return () => listeners.delete(callback);
}

function leerTodoLocalStorage() {
  const copia = {};
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    if (esClaveReservada(clave)) continue;
    copia[clave] = localStorage.getItem(clave);
  }
  return copia;
}

function borrarSoloDatosDeApp() {
  const claves = [];
  for (let i = 0; i < localStorage.length; i++) claves.push(localStorage.key(i));
  claves.forEach((clave) => {
    if (!esClaveReservada(clave)) originalRemoveItem(clave);
  });
}

function fechaDeHoyISO() {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Guarda (o actualiza) la foto del día de hoy en la colección de backups.
// No se llama en cada guardado, solo se dispara una vez confirmada la
// subida principal, así que como mucho hace una escritura extra por día.
async function actualizarBackupDeHoy(datos) {
  if (!uidActual) return;
  try {
    const fecha = fechaDeHoyISO();
    const refBackup = doc(db, "usuarios", uidActual, "backups", fecha);
    await conTiempoLimite(setDoc(refBackup, { datos, guardado: new Date().toISOString() }));
    limpiarBackupsViejos(); // no bloqueante, no hace falta esperarlo
  } catch (e) {
    console.error("No se pudo actualizar el backup del día:", e);
  }
}

// Borra los backups más viejos que los últimos N días, para no acumular
// para siempre ni gastar de más en Firestore.
async function limpiarBackupsViejos() {
  if (!uidActual) return;
  try {
    const refColeccion = collection(db, "usuarios", uidActual, "backups");
    const q = query(refColeccion, orderBy("guardado", "desc"));
    const snapshot = await conTiempoLimite(getDocs(q));
    const sobrantes = snapshot.docs.slice(DIAS_DE_RETENCION_BACKUPS);
    await Promise.all(sobrantes.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.error("No se pudo limpiar backups viejos:", e);
  }
}

async function subirAhora() {
  if (!uidActual) return false;

  fijarEstado(
    typeof navigator !== "undefined" && navigator.onLine === false
      ? "sin_conexion"
      : "guardando"
  );

  try {
    const datos = leerTodoLocalStorage();
    await conTiempoLimite(
      setDoc(doc(db, "usuarios", uidActual), {
        datos,
        actualizado: new Date().toISOString(),
      })
    );
    pendienteDeSubir = false;
    intentosFallidos = 0;
    fijarEstado("sincronizado");
    actualizarBackupDeHoy(datos); // no bloqueante: no retrasa la confirmación al usuario
    return true;
  } catch (e) {
    console.error("No se pudo sincronizar con la nube:", e);
    fijarEstado("error");
    programarReintento();
    return false;
  }
}

function programarReintento() {
  if (!sincronizacionActiva || !uidActual) return;
  const espera = ESPERAS_REINTENTO[Math.min(intentosFallidos, ESPERAS_REINTENTO.length - 1)];
  intentosFallidos += 1;
  setTimeout(() => {
    if (pendienteDeSubir && sincronizacionActiva) subirAhora();
  }, espera);
}

function programarSubida() {
  if (!sincronizacionActiva || !uidActual || restaurando) return;
  pendienteDeSubir = true;
  fijarEstado("guardando");
  clearTimeout(timeoutGuardado);
  timeoutGuardado = setTimeout(() => {
    subirAhora();
  }, 1000);
}

localStorage.setItem = function (clave, valor) {
  originalSetItem(clave, valor);
  if (!esClaveReservada(clave)) programarSubida();
};

localStorage.removeItem = function (clave) {
  originalRemoveItem(clave);
  if (!esClaveReservada(clave)) programarSubida();
};

localStorage.clear = function () {
  const reservadas = {};
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    if (esClaveReservada(clave)) reservadas[clave] = localStorage.getItem(clave);
  }
  originalClear();
  Object.keys(reservadas).forEach((clave) => originalSetItem(clave, reservadas[clave]));
  programarSubida();
};

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
  window.addEventListener("beforeunload", (e) => {
    if (sincronizacionActiva && pendienteDeSubir) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

export async function iniciarSincronizacion(uid) {
  uidActual = uid;
  restaurando = true;
  fijarEstado("guardando");
  try {
    const referencia = doc(db, "usuarios", uid);
    const snapshot = await conTiempoLimite(getDoc(referencia));

    if (snapshot.exists() && snapshot.data().datos) {
      borrarSoloDatosDeApp();
      const datosNube = snapshot.data().datos;
      Object.keys(datosNube).forEach((clave) => {
        if (!esClaveReservada(clave)) originalSetItem(clave, datosNube[clave]);
      });
    } else {
      const datosLocales = leerTodoLocalStorage();
      await conTiempoLimite(
        setDoc(referencia, {
          datos: datosLocales,
          actualizado: new Date().toISOString(),
        })
      );
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

/**
 * Devuelve la lista de backups disponibles para el usuario logueado,
 * del más reciente al más viejo. Cada uno trae { fecha, guardado }.
 */
export async function listarBackups() {
  if (!uidActual) return [];
  try {
    const refColeccion = collection(db, "usuarios", uidActual, "backups");
    const q = query(refColeccion, orderBy("guardado", "desc"), limitarConsulta(DIAS_DE_RETENCION_BACKUPS));
    const snapshot = await conTiempoLimite(getDocs(q));
    return snapshot.docs.map((d) => ({ fecha: d.id, guardado: d.data().guardado }));
  } catch (e) {
    console.error("No se pudieron listar los backups:", e);
    return [];
  }
}

/**
 * Devuelve los datos actuales de la app (los que hay ahora mismo en este
 * dispositivo), sin las claves reservadas de Firebase. Sirve para ofrecer
 * una descarga de respaldo real en la propia PC del usuario.
 */
export function obtenerDatosActuales() {
  return leerTodoLocalStorage();
}

/**
 * Devuelve los datos guardados en un backup puntual, SIN aplicarlos al
 * dispositivo (a diferencia de restaurarBackup). Sirve para poder
 * descargar cualquier copia vieja como archivo, sin tener que restaurarla
 * primero.
 */
export async function obtenerDatosDeBackup(fecha) {
  if (!uidActual) return null;
  try {
    const refBackup = doc(db, "usuarios", uidActual, "backups", fecha);
    const snapshot = await conTiempoLimite(getDoc(refBackup));
    if (!snapshot.exists()) return null;
    return snapshot.data().datos;
  } catch (e) {
    console.error("No se pudo obtener el backup para descargar:", e);
    return null;
  }
}

/**
 * Restaura el dispositivo actual a como estaban los datos en la fecha
 * indicada (formato "AAAA-MM-DD", el mismo id que devuelve listarBackups).
 * No toca la sesión de Firebase. Después de restaurar, sube esta versión
 * como el nuevo estado "vivo" (para que quede igual en todos los
 * dispositivos), y conviene recargar la página para que toda la app
 * relea los datos frescos.
 */
export async function restaurarBackup(fecha) {
  if (!uidActual) return { exito: false };
  try {
    const refBackup = doc(db, "usuarios", uidActual, "backups", fecha);
    const snapshot = await conTiempoLimite(getDoc(refBackup));
    if (!snapshot.exists()) return { exito: false };

    const datosBackup = snapshot.data().datos;
    borrarSoloDatosDeApp();
    Object.keys(datosBackup).forEach((clave) => {
      if (!esClaveReservada(clave)) originalSetItem(clave, datosBackup[clave]);
    });

    programarSubida(); // para que esta restauración se propague a la nube y otros dispositivos
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("agrodata:actualizado"));
    }
    return { exito: true };
  } catch (e) {
    console.error("No se pudo restaurar el backup:", e);
    return { exito: false };
  }
}
