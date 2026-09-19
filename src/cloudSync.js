// -----------------------------------------------------------------------
// SINCRONIZADOR CON LA NUBE (con protección de sesión + backups diarios +
// soporte para varias personas/dispositivos usando la misma cuenta)
// -----------------------------------------------------------------------
// La app (App.jsx) sigue guardando todo con localStorage, exactamente
// igual que antes. Este archivo "espía" cada guardado y sube una copia
// completa a Firestore, asociada al uid del usuario logueado.
//
// Protecciones:
//  - Nunca toca las claves de sesión de Firebase Auth ("firebase:...").
//  - Reintenta solo si falla la subida, y avisa si no se pudo confirmar.
//  - El logout intenta subir lo pendiente antes de cerrar, pero SIEMPRE
//    termina cerrando sesión y limpiando el dispositivo, haya podido
//    subir o no (si no pudo, ya se le avisó al usuario antes, en
//    Root.jsx).
//  - Guarda una copia de cada día en usuarios/{uid}/backups/{AAAA-MM-DD}.
//    Se conservan los últimos 30 días; los más viejos se eliminan solos.
//  - Cada operación contra el servidor tiene un tiempo máximo de espera
//    (15 segundos), para no quedarse mostrando "Guardando..." para
//    siempre si la red no contesta. La app SIEMPRE intenta guardar
//    cuando hace falta, sin confiar ciegamente en si el navegador "dice"
//    que hay o no conexión (en varios celulares esa información no se
//    actualiza bien).
//  - MULTI-DISPOSITIVO: antes de guardar, se compara la versión que hay
//    en la nube contra la última que este dispositivo conoce. Si otro
//    dispositivo guardó algo más nuevo mientras tanto, no se lo pisa:
//    se toma nota de esa versión nueva y se reintenta guardar el cambio
//    de acá enseguida (no se pierde, solo espera su turno).
//  - SEMÁFORO CONTRA CHOQUES: solo se permite un intento de guardado a
//    la vez. Antes, varios "gatillos" (volver a la pestaña, recuperar
//    el foco, el chequeo cada 20 segundos, etc.) podían disparar
//    guardados al mismo tiempo, y el dispositivo terminaba "compitiendo
//    contra sí mismo" y creyendo por error que otro dispositivo había
//    guardado algo. Con el semáforo, eso ya no puede pasar.
//  - Si el dispositivo queda con cambios sin subir porque la app se
//    cerró o se pausó sin señal (algo común en celulares), esa marca de
//    "pendiente" se guarda también en el propio dispositivo (no solo en
//    la memoria), para que al reabrir la app se suba ese cambio primero
//    en vez de traer la versión vieja de la nube y taparlo.
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
  getCountFromServer,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";

const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);
const originalClear = localStorage.clear.bind(localStorage);

let uidActual = null;
let sincronizacionActiva = false;
let restaurando = false;
let timeoutGuardado = null;
let ultimaVersionConocida = null; // cuál fue la última versión que SÉ que es la mía

// Hay un cambio local que todavía no se confirmó guardado en la nube.
// (En memoria, para uso inmediato; la versión que sobrevive a que la
// app se cierre está en localStorage, clave "agrodata:pendienteSubir".)
let pendienteDeSubir = false;

// Semáforo: evita que dos guardados se disparen al mismo tiempo. Sin
// esto, el propio dispositivo puede terminar "compitiendo contra sí
// mismo" y creyendo por error que otro dispositivo guardó algo nuevo.
let subidaEnCurso = false;

let intentosFallidos = 0;
const ESPERAS_REINTENTO = [3000, 8000, 20000, 45000]; // 3s, 8s, 20s, 45s...

const DIAS_DE_RETENCION_BACKUPS = 30;

// Tiempo máximo que se espera una respuesta del servidor antes de darse
// por vencido y tratarlo como un error (para poder reintentar en vez de
// quedarse esperando indefinidamente).
const TIEMPO_MAXIMO_ESPERA_MS = 15000; // 15 segundos

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
// Firebase o del propio mecanismo de sincronización.
const PREFIJOS_RESERVADOS = [
  "firebase:",
  "firebaseLocalStorageDb",
  "firebase-heartbeat",
  "agrodata:cuentaActual",
  "agrodata:pendienteSubir",
  "agrodata:cambiosPendientes",
];

function esClaveReservada(clave) {
  return PREFIJOS_RESERVADOS.some((prefijo) => clave.startsWith(prefijo));
}

// -----------------------------------------------------------------------
// REGISTRO DE CAMBIOS PENDIENTES
// Anota qué claves se modificaron o borraron en ESTE dispositivo y todavía
// no se confirmaron subidas. Al subir, solo se aplican esos cambios sobre
// lo que hay en la nube (en vez de pisar todo con la copia local).
// Se guarda también en localStorage para sobrevivir a un cierre de la app.
// -----------------------------------------------------------------------
const CLAVE_CAMBIOS_PENDIENTES = "agrodata:cambiosPendientes";
let secuenciaCambios = Date.now();
let cambiosPendientes = cargarCambiosPendientes();

function cargarCambiosPendientes() {
  try {
    const crudo = localStorage.getItem(CLAVE_CAMBIOS_PENDIENTES);
    return crudo ? JSON.parse(crudo) : {};
  } catch (e) {
    return {};
  }
}

function guardarCambiosPendientes() {
  try {
    if (Object.keys(cambiosPendientes).length === 0) {
      originalRemoveItem(CLAVE_CAMBIOS_PENDIENTES);
    } else {
      originalSetItem(CLAVE_CAMBIOS_PENDIENTES, JSON.stringify(cambiosPendientes));
    }
  } catch (e) {
    console.error("No se pudo guardar el registro de cambios pendientes:", e);
  }
}

function marcarCambio(clave, tipo) {
  // tipo: "set" (alta o modificación) | "del" (borrado)
  cambiosPendientes[clave] = { t: tipo, n: ++secuenciaCambios };
  guardarCambiosPendientes();
}

function registrarCambioLocal(clave, tipo) {
  if (!sincronizacionActiva || !uidActual || restaurando) return;
  marcarCambio(clave, tipo);
}

function limpiarCambiosPendientes() {
  cambiosPendientes = {};
  originalRemoveItem(CLAVE_CAMBIOS_PENDIENTES);
}

// Trae a este dispositivo lo que otros dispositivos guardaron en la nube.
// Nunca pisa una clave que tenga un cambio local pendiente.
function aplicarNovedadesDeLaNube(datosNube) {
  let huboCambios = false;
  Object.keys(datosNube || {}).forEach((clave) => {
    if (esClaveReservada(clave)) return;
    if (cambiosPendientes[clave]) return;
    if (localStorage.getItem(clave) !== datosNube[clave]) {
      originalSetItem(clave, datosNube[clave]);
      huboCambios = true;
    }
  });
  if (huboCambios && typeof window !== "undefined") {
    window.dispatchEvent(new Event("agrodata:actualizado"));
  }
  return huboCambios;
}

// "sincronizado" | "guardando" | "error" | "sin_conexion" | "conflicto_dispositivo" | "inactivo"
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

async function actualizarBackupDeHoy(datos) {
  if (!uidActual) return;
  try {
    const fecha = fechaDeHoyISO();
    const refBackup = doc(db, "usuarios", uidActual, "backups", fecha);
    await conTiempoLimite(setDoc(refBackup, { datos, guardado: new Date().toISOString() }));
    limpiarBackupsViejos();
  } catch (e) {
    console.error("No se pudo actualizar el backup del día:", e);
  }
}

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
  // Semáforo: un solo guardado a la vez.
  if (subidaEnCurso) return false;

  subidaEnCurso = true;
  fijarEstado("guardando");

  try {
    const referencia = doc(db, "usuarios", uidActual);
    const nuevaMarca = new Date().toISOString();
    // Foto de los cambios que se envían en ESTE intento. Si mientras
    // tanto se carga algo más, queda anotado para el intento siguiente.
    const cambiosEnviados = { ...cambiosPendientes };
    let datosFinales = {};

    await conTiempoLimite(
      runTransaction(db, async (transaction) => {
        const snapshotActual = await transaction.get(referencia);
        // Partimos de lo que hay en la nube (incluye lo de otros dispositivos)
        const datosNube =
          snapshotActual.exists() && snapshotActual.data().datos
            ? { ...snapshotActual.data().datos }
            : {};

        // ...y le aplicamos SOLO los cambios hechos en este dispositivo.
        Object.keys(cambiosEnviados).forEach((clave) => {
          if (esClaveReservada(clave)) return;
          if (cambiosEnviados[clave].t === "del") {
            delete datosNube[clave];
          } else {
            const valorLocal = localStorage.getItem(clave);
            if (valorLocal !== null) datosNube[clave] = valorLocal;
          }
        });

        datosFinales = datosNube;
        transaction.set(referencia, { datos: datosNube, actualizado: nuevaMarca });
      })
    );

    ultimaVersionConocida = nuevaMarca;

    // Sacamos del registro solo lo que se subió (salvo lo que se volvió
    // a modificar mientras se subía).
    Object.keys(cambiosEnviados).forEach((clave) => {
      const actual = cambiosPendientes[clave];
      if (actual && actual.n === cambiosEnviados[clave].n) delete cambiosPendientes[clave];
    });
    guardarCambiosPendientes();

    pendienteDeSubir = Object.keys(cambiosPendientes).length > 0;
    if (!pendienteDeSubir) originalRemoveItem("agrodata:pendienteSubir");
    intentosFallidos = 0;

    // Traer lo que cargaron otros dispositivos
    aplicarNovedadesDeLaNube(datosFinales);

    fijarEstado(pendienteDeSubir ? "guardando" : "sincronizado");
    actualizarBackupDeHoy(datosFinales);

    if (pendienteDeSubir) {
      setTimeout(() => {
        if (pendienteDeSubir && sincronizacionActiva) subirAhora();
      }, 1000);
    }
    return true;
  } catch (e) {
    console.error("No se pudo sincronizar con la nube:", e);
    fijarEstado("error");
    programarReintento();
    return false;
  } finally {
    subidaEnCurso = false;
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
  originalSetItem("agrodata:pendienteSubir", "1");
  fijarEstado("guardando");
  clearTimeout(timeoutGuardado);
  timeoutGuardado = setTimeout(() => {
    subirAhora();
  }, 1000);
}

// -----------------------------------------------------------------------
// Además del documento único de siempre, cada animal se sube TAMBIÉN a
// su propio documento chico en usuarios/{uid}/animales/{caravana}. No
// reemplaza nada — es una copia "en paralelo" que alimenta al botón de
// recuperación de emergencia.
// -----------------------------------------------------------------------
const timeoutsIndividuales = new Map();

function programarSubidaIndividual(caravana, datos) {
  if (!sincronizacionActiva || !uidActual || restaurando) return;
  const timeoutExistente = timeoutsIndividuales.get(caravana);
  if (timeoutExistente) clearTimeout(timeoutExistente);

  const nuevoTimeout = setTimeout(async () => {
    timeoutsIndividuales.delete(caravana);
    try {
      const ref = doc(db, "usuarios", uidActual, "animales", caravana);
      await conTiempoLimite(
        setDoc(ref, { ...datos, actualizado: new Date().toISOString() })
      );
    } catch (e) {
      console.error(`No se pudo subir el animal individual ${caravana}:`, e);
    }
  }, 1000);

  timeoutsIndividuales.set(caravana, nuevoTimeout);
}

function borrarAnimalIndividual(caravana) {
  if (!sincronizacionActiva || !uidActual) return;
  const ref = doc(db, "usuarios", uidActual, "animales", caravana);
  deleteDoc(ref).catch((e) =>
    console.error(`No se pudo borrar el animal individual ${caravana}:`, e)
  );
}

localStorage.setItem = function (clave, valor) {
  originalSetItem(clave, valor);
  if (esClaveReservada(clave)) return;

  registrarCambioLocal(clave, "set");
  programarSubida();

  if (clave.startsWith("animal:")) {
    try {
      const caravana = clave.slice("animal:".length);
      const datos = JSON.parse(valor);
      programarSubidaIndividual(caravana, datos);
    } catch (e) {
      // el valor no era JSON válido; no se sube individualmente
    }
  }
};

localStorage.removeItem = function (clave) {
  originalRemoveItem(clave);
  if (esClaveReservada(clave)) return;

  registrarCambioLocal(clave, "del");
  programarSubida();

  if (clave.startsWith("animal:")) {
    borrarAnimalIndividual(clave.slice("animal:".length));
  }
};

localStorage.clear = function () {
  const reservadas = {};
  const clavesDeApp = [];
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    if (esClaveReservada(clave)) reservadas[clave] = localStorage.getItem(clave);
    else clavesDeApp.push(clave);
  }
  originalClear();
  Object.keys(reservadas).forEach((clave) => originalSetItem(clave, reservadas[clave]));
  clavesDeApp.forEach((clave) => registrarCambioLocal(clave, "del"));
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

  const forzarSubidaSiHacePendiente = () => {
    if (sincronizacionActiva && pendienteDeSubir) {
      clearTimeout(timeoutGuardado);
      subirAhora();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") forzarSubidaSiHacePendiente();
    if (document.visibilityState === "visible" && pendienteDeSubir && sincronizacionActiva) {
      intentosFallidos = 0;
      subirAhora();
    }
  });
  window.addEventListener("pagehide", forzarSubidaSiHacePendiente);

  window.addEventListener("focus", () => {
    if (pendienteDeSubir && sincronizacionActiva) {
      intentosFallidos = 0;
      subirAhora();
    }
  });

  // Chequeo periódico de respaldo, sin depender de si el navegador
  // "dice" que hay conexión (en algunos celulares esa información no
  // se actualiza bien). El semáforo (subidaEnCurso) se encarga de que
  // esto nunca choque con otro intento que ya esté en curso.
  setInterval(() => {
    if (pendienteDeSubir && sincronizacionActiva) {
      subirAhora();
    }
  }, 20000);
}

export async function iniciarSincronizacion(uid) {
  const cuentaAnterior = localStorage.getItem("agrodata:cuentaActual");
  const habiaPendienteSinSubir = localStorage.getItem("agrodata:pendienteSubir") === "1";

  if (cuentaAnterior && cuentaAnterior !== uid) {
    borrarSoloDatosDeApp();
    limpiarCambiosPendientes();
    originalRemoveItem("agrodata:pendienteSubir");
  }

  uidActual = uid;
  restaurando = true;
  fijarEstado("guardando");

  try {
    if (cuentaAnterior === uid && habiaPendienteSinSubir) {
      // Hay cambios locales sin confirmar subidos: NO traemos nada de la
      // nube antes de subirlos (taparía el cambio con una versión vieja).
      // Si por una versión anterior de la app no hay registro detallado,
      // se marca todo lo local como "para subir" (nunca se borra nada de
      // la nube por esta vía).
      if (Object.keys(cambiosPendientes).length === 0) {
        Object.keys(leerTodoLocalStorage()).forEach((clave) => {
          cambiosPendientes[clave] = { t: "set", n: ++secuenciaCambios };
        });
        guardarCambiosPendientes();
      }
      pendienteDeSubir = true;
      originalSetItem("agrodata:cuentaActual", uid);
      subirAhora();
      return;
    }

    const referencia = doc(db, "usuarios", uid);
    const snapshot = await conTiempoLimite(getDoc(referencia));

    if (snapshot.exists() && snapshot.data().datos) {
      borrarSoloDatosDeApp();
      limpiarCambiosPendientes();
      const datosNube = snapshot.data().datos;
      Object.keys(datosNube).forEach((clave) => {
        if (!esClaveReservada(clave)) originalSetItem(clave, datosNube[clave]);
      });
      ultimaVersionConocida = snapshot.data().actualizado || null;
    } else if (!cuentaAnterior || cuentaAnterior === uid) {
      const datosLocales = leerTodoLocalStorage();
      const marcaInicial = new Date().toISOString();
      await conTiempoLimite(
        setDoc(referencia, {
          datos: datosLocales,
          actualizado: marcaInicial,
        })
      );
      ultimaVersionConocida = marcaInicial;
    }

    originalSetItem("agrodata:cuentaActual", uid);
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

  // Pase lo que pase con la subida, cerramos sesión y borramos el
  // dispositivo. Si algún usuario distinto entra después en el mismo
  // dispositivo, no debe encontrar datos de la cuenta anterior.
  sincronizacionActiva = false;
  uidActual = null;
  ultimaVersionConocida = null;
  pendienteDeSubir = false;
  subidaEnCurso = false;
  intentosFallidos = 0;
  borrarSoloDatosDeApp();
  originalRemoveItem("agrodata:pendienteSubir");
  limpiarCambiosPendientes();
  fijarEstado("inactivo");
  return { exito };
}

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

export function obtenerDatosActuales() {
  return leerTodoLocalStorage();
}

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

export async function restaurarBackup(fecha) {
  if (!uidActual) return { exito: false };
  try {
    const refBackup = doc(db, "usuarios", uidActual, "backups", fecha);
    const snapshot = await conTiempoLimite(getDoc(refBackup));
    if (!snapshot.exists()) return { exito: false };

    const datosBackup = snapshot.data().datos;

    // Lo que hay hoy y no está en el backup se marca como borrado; lo del
    // backup como para subir. Así la nube queda igual al backup.
    const clavesActuales = Object.keys(leerTodoLocalStorage());
    borrarSoloDatosDeApp();
    limpiarCambiosPendientes();
    clavesActuales.forEach((clave) => marcarCambio(clave, "del"));
    Object.keys(datosBackup).forEach((clave) => {
      if (!esClaveReservada(clave)) {
        originalSetItem(clave, datosBackup[clave]);
        marcarCambio(clave, "set");
      }
    });

    programarSubida();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("agrodata:actualizado"));
    }
    return { exito: true };
  } catch (e) {
    console.error("No se pudo restaurar el backup:", e);
    return { exito: false };
  }
}

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
        marcarCambio(`animal:${caravana}`, "set");
        recuperados += 1;
      }
    });
    if (recuperados > 0) programarSubida();
    return { recuperados };
  } catch (e) {
    console.error("No se pudo recuperar desde la subcolección de animales:", e);
    return { recuperados: 0, error: "No se pudo conectar con Firebase." };
  }
}

export async function migrarTodosLosAnimalesAhora() {
  if (!uidActual) return { subidos: 0, total: 0, error: "No hay sesión activa." };
  try {
    const claves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave && clave.startsWith("animal:")) claves.push(clave);
    }

    let subidos = 0;
    for (const clave of claves) {
      let datos;
      try {
        datos = JSON.parse(localStorage.getItem(clave));
      } catch (e) {
        continue;
      }
      if (!datos) continue;

      const caravana = clave.slice("animal:".length);
      try {
        const ref = doc(db, "usuarios", uidActual, "animales", caravana);
        // eslint-disable-next-line no-await-in-loop
        await conTiempoLimite(
          setDoc(ref, { ...datos, actualizado: new Date().toISOString() })
        );
        subidos += 1;
      } catch (e) {
        console.error(`No se pudo subir el animal ${caravana}:`, e);
      }
    }

    return { subidos, total: claves.length };
  } catch (e) {
    console.error("No se pudo migrar los animales:", e);
    return { subidos: 0, total: 0, error: "No se pudo conectar con Firebase." };
  }
}

export async function limpiarAnimalesHuerfanos() {
  if (!uidActual) return { eliminados: 0, error: "No hay sesión activa." };
  try {
    const caravanasLocales = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave && clave.startsWith("animal:")) {
        caravanasLocales.add(clave.slice("animal:".length));
      }
    }

    const refColeccion = collection(db, "usuarios", uidActual, "animales");
    const snapshot = await getDocs(refColeccion);
    const huerfanos = snapshot.docs.filter((d) => !caravanasLocales.has(d.id));

    await Promise.all(huerfanos.map((d) => deleteDoc(d.ref)));

    return { eliminados: huerfanos.length };
  } catch (e) {
    console.error("No se pudo limpiar animales huérfanos:", e);
    return { eliminados: 0, error: "No se pudo conectar con Firebase." };
  }
}

export async function contarAnimalesEnFirebase() {
  if (!uidActual) return { cantidad: null, error: "No hay sesión activa." };
  try {
    const refColeccion = collection(db, "usuarios", uidActual, "animales");
    const snapshot = await conTiempoLimite(getCountFromServer(refColeccion));
    return { cantidad: snapshot.data().count };
  } catch (e) {
    console.error("No se pudo contar los animales:", e);
    return { cantidad: null, error: "No se pudo conectar con Firebase." };
  }
}
