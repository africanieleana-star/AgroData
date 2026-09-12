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
//  - Cada operación contra el servidor tiene un tiempo máximo de espera
//    (15 segundos), para no quedarse mostrando "Guardando..." para
//    siempre si la red no contesta.
//  - NUEVO: además de escuchar el evento "online" del navegador (que en
//    celulares no siempre se dispara al recuperar señal, sobre todo si
//    la app estuvo en segundo plano), ahora también reintenta subir:
//      1) cada vez que la app vuelve a estar visible/en primer plano
//         (visibilitychange, focus), y
//      2) con un chequeo periódico de respaldo cada 20 segundos.
//    Esto asegura que, apenas vuelva la señal en el celular, los
//    cambios cargados offline se suban solos, igual que en la PC.
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
  // Intenta subir de inmediato apenas el navegador avisa que volvió la
  // señal. Es la vía principal, pero en el celular no siempre se
  // dispara (ver los respaldos más abajo).
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

  // En el celular, cambiar de app o apagar la pantalla NO dispara
  // "beforeunload" de forma confiable. "visibilitychange" (y "pagehide"
  // como respaldo) sí se disparan siempre que la pestaña deja de estar
  // visible, así que ahí forzamos la subida pendiente sin esperar el
  // debounce de 1 segundo.
  const forzarSubidaSiHacePendiente = () => {
    if (sincronizacionActiva && pendienteDeSubir) {
      clearTimeout(timeoutGuardado);
      subirAhora();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") forzarSubidaSiHacePendiente();
  });
  window.addEventListener("pagehide", forzarSubidaSiHacePendiente);

  // ---------------------------------------------------------------
  // RESPALDOS PARA RECONEXIÓN CONFIABLE EN CELULAR
  // ---------------------------------------------------------------
  // 1) Cuando la app vuelve a estar visible (el usuario reabre la app
  //    o vuelve de otra pantalla del celular), reintentamos subir si
  //    había algo pendiente. Esto cubre el caso típico: cargaste un
  //    ternero sin señal, minimizaste la app, y cuando la volvés a
  //    abrir con wifi ya disponible, se sube solo.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendienteDeSubir && sincronizacionActiva) {
      intentosFallidos = 0;
      subirAhora();
    }
  });

  // 2) Lo mismo cuando la ventana/pestaña recupera el foco (cubre
  //    algunos navegadores/casos que "visibilitychange" no dispara).
  window.addEventListener("focus", () => {
    if (pendienteDeSubir && sincronizacionActiva) {
      intentosFallidos = 0;
      subirAhora();
    }
  });

  // 3) Chequeo periódico de respaldo: cada 20 segundos, si hay algo
  //    pendiente de subir y el navegador dice que hay conexión, se
  //    reintenta. Es la red de seguridad final para cuando ninguno de
  //    los eventos anteriores se disparó (pasa en algunos celulares
  //    con Android/iOS al volver de segundo plano).
  setInterval(() => {
    if (pendienteDeSubir && sincronizacionActiva && navigator.onLine) {
      subirAhora();
    }
  }, 20000);
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

/**
 * Recuperación de emergencia: trae las fichas guardadas en
 * usuarios/{uid}/animales (el otro sistema de sincronización, por
 * animal individual) y las carga en este dispositivo como
 * "animal:<caravana>". Se usa cuando el documento "vivo" principal
 * quedó vacío pero esta subcolección sí tiene datos.
 */
export async function recuperarAnimalesDesdeSubcoleccion() {
  if (!uidActual) return { recuperados: 0, error: "No hay sesión activa." };
  try {
    const refColeccion = collection(db, "usuarios", uidActual, "animales");
    const snapshot = await getDocs(refColeccion);
    let recuperados = 0;
    snapshot.forEach((docSnap) => {
      const animal = docSnap.data();
      const caravana = (animal && animal.caravana) || docSnap.id;
      if (caravana) {
        originalSetItem(`animal:${caravana}`, JSON.stringify(animal));
        recuperados += 1;
      }
    });
    if (recuperados > 0) programarSubida(); // para que también quede subido al documento principal
    return { recuperados };
  } catch (e) {
    console.error("No se pudo recuperar desde la subcolección de animales:", e);
    return { recuperados: 0, error: "No se pudo conectar con Firebase." };
  }
}
