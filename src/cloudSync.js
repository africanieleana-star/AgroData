// -----------------------------------------------------------------------
// SINCRONIZADOR CON LA NUBE (varias personas / dispositivos, misma cuenta)
// -----------------------------------------------------------------------
// La app (App.jsx) sigue guardando todo con localStorage, exactamente
// igual que antes. Este archivo "espía" cada guardado y lo sincroniza con
// Firestore, asociado al uid del usuario logueado.
//
// Cómo funciona (resumen):
//  - Cada dispositivo (celu, PC, notebook, navegador o app instalada; cada
//    uno tiene su propio localStorage) anota QUÉ claves cambió o borró y
//    todavía no se confirmaron subidas ("cambios pendientes").
//  - Al subir, se lee lo que hay en la nube, se le aplican SOLO esos
//    cambios y se guarda. Así nunca se pisa lo que cargó otro dispositivo.
//  - Después de subir, se traen a este dispositivo las novedades de los
//    demás. También se revisa la nube al volver a la pestaña/app, al
//    recuperar conexión y cada 45 segundos mientras la pantalla está
//    visible, para ver lo que cargaron otros sin tener que recargar.
//  - Si un setItem llega con el mismo valor que ya había, se ignora (no
//    genera subida ni "guardando...").
//  - Cada animal se copia también a usuarios/{uid}/animales/{caravana},
//    pero EN LOTES (no un pedido por animal), para no saturar Firestore
//    ("Write stream exhausted maximum allowed queued writes").
//  - Backup diario en usuarios/{uid}/backups/{AAAA-MM-DD} (últimos 30 días),
//    como máximo uno cada 5 minutos.
//  - Nunca toca las claves de sesión de Firebase Auth ("firebase:...").
//  - Cada operación contra el servidor tiene un tiempo máximo de espera
//    (15 segundos) y hay un semáforo para que solo haya un guardado a la
//    vez. El pendiente sobrevive al cierre de la app (queda en el
//    dispositivo) y se sube primero al reabrir.
//  - El logout intenta subir lo pendiente, pero SIEMPRE termina cerrando
//    sesión y limpiando el dispositivo.
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
  writeBatch,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);
const originalClear = localStorage.clear.bind(localStorage);

let uidActual = null;
let sincronizacionActiva = false;
let restaurando = false;
let timeoutGuardado = null;
let ultimaVersionConocida = null; // última versión de la nube que este dispositivo conoce
let cancelarListenerNube = null; // corta la escucha en vivo al cerrar sesión

// Hay un cambio local que todavía no se confirmó guardado en la nube.
// (En memoria, para uso inmediato; la versión que sobrevive a que la
// app se cierre está en localStorage, clave "agrodata:pendienteSubir".)
let pendienteDeSubir = false;

// Semáforo: evita que dos guardados se disparen al mismo tiempo.
let subidaEnCurso = false;
let pullEnCurso = false;

let intentosFallidos = 0;
const ESPERAS_REINTENTO = [3000, 8000, 20000, 45000]; // 3s, 8s, 20s, 45s...

// --- SOLO DIAGNÓSTICO TEMPORAL: sacar después de resolver el bug del iPhone ---
let contadorProgramarSubida = 0;
export function getInfoDebug() {
  return {
    uid: uidActual ? uidActual.slice(0, 6) + "..." : "SIN UID",
    sincronizacionActiva,
    restaurando,
    pendienteDeSubir,
    vecesQueSeLlamoProgramarSubida: contadorProgramarSubida,
  };
}

const DIAS_DE_RETENCION_BACKUPS = 30;
const INTERVALO_MINIMO_BACKUP_MS = 5 * 60 * 1000; // un backup como máximo cada 5 min
const TAMANO_LOTE = 100; // documentos por lote al escribir animales

// Tiempo máximo que se espera una respuesta del servidor antes de darse
// por vencido y tratarlo como un error.
const TIEMPO_MAXIMO_ESPERA_MS = 15000; // 15 segundos

function conTiempoLimite(promesaOriginal, ms = TIEMPO_MAXIMO_ESPERA_MS) {
  let temporizador;
  const limite = new Promise((_, reject) => {
    temporizador = setTimeout(
      () => reject(new Error("Tiempo de espera agotado conectando con el servidor")),
      ms
    );
  });
  return Promise.race([promesaOriginal, limite]).finally(() => clearTimeout(temporizador));
}

// Claves que NUNCA hay que subir, borrar ni pisar: son internas de
// Firebase o del propio mecanismo de sincronización.
const PREFIJOS_RESERVADOS = [
  "firebase:",
  "firebaseLocalStorageDb",
  "firebase-heartbeat",
  "firebase-app-check",
  // Claves internas del propio Firestore (sincronización entre pestañas:
  // firestore_clients_..., firestore_mutations_..., firestore_online_state_...).
  // Firestore las reescribe en CADA operación; si se tomaran como datos de la
  // app se generaba un bucle infinito de "guardando...". Nunca se suben.
  "firestore_",
  "@firebase",
  "_grecaptcha",
  "agrodata:cuentaActual",
  "agrodata:pendienteSubir",
  "agrodata:cambiosPendientes",
];

function esClaveReservada(clave) {
  return PREFIJOS_RESERVADOS.some((prefijo) => clave.startsWith(prefijo));
}

// "sincronizado" | "guardando" | "error" | "sin_conexion" | "conflicto_dispositivo" | "inactivo"
let estadoActual = "inactivo";
let ultimoMensajeError = ""; // texto real del último error, para verlo sin conectar un depurador
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

export function getUltimoMensajeError() {
  return ultimoMensajeError;
}

export function subscribeEstadoSync(callback) {
  listeners.add(callback);
  callback(estadoActual);
  return () => listeners.delete(callback);
}

// -----------------------------------------------------------------------
// REGISTRO DE CAMBIOS PENDIENTES
// Anota qué claves se modificaron o borraron en ESTE dispositivo y todavía
// no se confirmaron subidas. Se guarda también en localStorage para
// sobrevivir a un cierre de la app.
// -----------------------------------------------------------------------
const CLAVE_CAMBIOS_PENDIENTES = "agrodata:cambiosPendientes";
let secuenciaCambios = Date.now();
let timeoutRegistro = null;
let cambiosPendientes = cargarCambiosPendientes();

function cargarCambiosPendientes() {
  try {
    const crudo = localStorage.getItem(CLAVE_CAMBIOS_PENDIENTES);
    const registro = crudo ? JSON.parse(crudo) : {};
    // Limpia claves que versiones anteriores anotaron por error (internas de Firestore)
    Object.keys(registro).forEach((clave) => {
      if (esClaveReservada(clave)) delete registro[clave];
    });
    return registro;
  } catch (e) {
    return {};
  }
}

function guardarCambiosPendientes() {
  clearTimeout(timeoutRegistro);
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
  // Se persiste con un pequeño retraso para no reescribir el registro
  // entero en cada guardado cuando se cargan muchos animales de golpe.
  clearTimeout(timeoutRegistro);
  timeoutRegistro = setTimeout(guardarCambiosPendientes, 300);
}

function registrarCambioLocal(clave, tipo) {
  if (!uidActual) return;
  marcarCambio(clave, tipo);
}

function limpiarCambiosPendientes() {
  clearTimeout(timeoutRegistro);
  cambiosPendientes = {};
  originalRemoveItem(CLAVE_CAMBIOS_PENDIENTES);
}

// Trae a este dispositivo lo que otros dispositivos guardaron en la nube.
// Nunca pisa una clave que tenga un cambio local pendiente y nunca borra
// nada del dispositivo (solo agrega o actualiza).
function aplicarNovedadesDeLaNube(datosNube) {
  const datos = datosNube || {};
  let huboCambios = false;

  // 1. Agrega o actualiza lo que cambió o es nuevo en otro dispositivo.
  Object.keys(datos).forEach((clave) => {
    if (esClaveReservada(clave)) return;
    if (cambiosPendientes[clave]) return;
    if (localStorage.getItem(clave) !== datos[clave]) {
      originalSetItem(clave, datos[clave]);
      huboCambios = true;
    }
  });

  // 2. Borra en este dispositivo lo que otro dispositivo eliminó. Como
  // "datos" es la foto COMPLETA de la cuenta (no un parche), cualquier
  // clave que exista acá y ya no esté ahí fue borrada en otro lado —
  // salvo que este dispositivo tenga un cambio propio sin confirmar
  // sobre esa misma clave (para no pisarse con algo que se está
  // subiendo justo ahora).
  const clavesLocales = [];
  for (let i = 0; i < localStorage.length; i++) clavesLocales.push(localStorage.key(i));
  clavesLocales.forEach((clave) => {
    if (esClaveReservada(clave)) return;
    if (cambiosPendientes[clave]) return;
    if (!(clave in datos) && localStorage.getItem(clave) !== null) {
      originalRemoveItem(clave);
      huboCambios = true;
    }
  });

  if (huboCambios && typeof window !== "undefined") {
    window.dispatchEvent(new Event("agrodata:actualizado"));
  }
  return huboCambios;
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

// -----------------------------------------------------------------------
// BACKUPS DIARIOS
// -----------------------------------------------------------------------
let ultimoBackupMs = 0;
let ultimaFechaLimpieza = null;

async function actualizarBackupDeHoy(datos) {
  if (!uidActual) return;
  if (Date.now() - ultimoBackupMs < INTERVALO_MINIMO_BACKUP_MS) return;
  ultimoBackupMs = Date.now();
  try {
    const fecha = fechaDeHoyISO();
    const refBackup = doc(db, "usuarios", uidActual, "backups", fecha);
    await conTiempoLimite(setDoc(refBackup, { datos, guardado: new Date().toISOString() }));
    if (ultimaFechaLimpieza !== fecha) {
      ultimaFechaLimpieza = fecha;
      limpiarBackupsViejos();
    }
  } catch (e) {
    ultimoBackupMs = 0;
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

// -----------------------------------------------------------------------
// SUBIDA PRINCIPAL (documento único del usuario, con merge por clave)
// -----------------------------------------------------------------------
async function subirAhora() {
  if (!uidActual) return false;
  if (restaurando) {
    setTimeout(() => {
      if (pendienteDeSubir && sincronizacionActiva) subirAhora();
    }, 500);
    return false;
  }
  // Semáforo: si ya hay un guardado en curso, no arrancamos otro.
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

        // Limpieza: claves internas que versiones anteriores subieron por error
        Object.keys(datosNube).forEach((clave) => {
          if (esClaveReservada(clave)) delete datosNube[clave];
        });

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
    ultimoMensajeError = e && e.code ? `${e.code}: ${e.message}` : String((e && e.message) || e);
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
  contadorProgramarSubida += 1;
  if (!uidActual) return;
  pendienteDeSubir = true;
  originalSetItem("agrodata:pendienteSubir", "1");
  fijarEstado("guardando");
  clearTimeout(timeoutGuardado);
  timeoutGuardado = setTimeout(() => {
    subirAhora();
  }, 1000);
}

// -----------------------------------------------------------------------
// TRAER NOVEDADES (lectura de rutina, sin escribir nada)
// Sirve para ver lo que cargaron otros dispositivos sin tener que
// recargar. Solo corre si este dispositivo no tiene nada pendiente (si lo
// tiene, la subida ya trae las novedades al terminar).
// -----------------------------------------------------------------------
async function traerNovedadesDeLaNube() {
  if (!uidActual || !sincronizacionActiva || restaurando) return;
  if (pendienteDeSubir || subidaEnCurso || pullEnCurso) return;

  pullEnCurso = true;
  const uid = uidActual;
  try {
    const snapshot = await conTiempoLimite(getDoc(doc(db, "usuarios", uid)));
    if (uid !== uidActual || !sincronizacionActiva) return;
    if (pendienteDeSubir || subidaEnCurso) return; // algo cambió mientras esperábamos
    // Una respuesta que sale de la caché puede ser vieja: se ignora.
    if (snapshot.metadata && snapshot.metadata.fromCache) return;
    if (!snapshot.exists()) return;

    const version = snapshot.data().actualizado || null;
    if (version && version === ultimaVersionConocida) return; // nada nuevo

    aplicarNovedadesDeLaNube(snapshot.data().datos);
    if (version) ultimaVersionConocida = version;
  } catch (e) {
    // Chequeo de rutina: si no hay red, se reintenta en el próximo.
    console.warn("No se pudo revisar novedades en la nube:", e);
  } finally {
    pullEnCurso = false;
  }
}

// Para el botón de "Actualizar" manual: fuerza una revisión inmediata,
// sin esperar al próximo tick del chequeo periódico.
export async function revisarNovedadesAhora() {
  return traerNovedadesDeLaNube();
}

// -----------------------------------------------------------------------
// ESCUCHA EN VIVO: Firestore avisa apenas otro dispositivo guarda algo,
// sin depender de timers. Esto es clave para la PWA: cuando el celular la
// manda a segundo plano, el sistema operativo pausa los setInterval de
// JS, así que el chequeo periódico de arriba puede no correr durante un
// buen rato. onSnapshot no depende de eso — apenas la app vuelve a
// primer plano, la conexión se reactiva sola y trae lo último.
// -----------------------------------------------------------------------
function iniciarEscuchaEnVivo(uid) {
  detenerEscuchaEnVivo();
  const referencia = doc(db, "usuarios", uid);
  cancelarListenerNube = onSnapshot(
    referencia,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (uid !== uidActual || !sincronizacionActiva) return;
      // Es el eco de algo que acabamos de escribir nosotros mismos
      // (todavía no confirmado por el servidor, o ya aplicado al subir):
      // se ignora para no pisarse ni generar trabajo de más.
      if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
      if (!snapshot.exists()) return;

      const version = snapshot.data().actualizado || null;
      if (version && version === ultimaVersionConocida) return; // ya lo tenemos

      aplicarNovedadesDeLaNube(snapshot.data().datos);
      if (version) ultimaVersionConocida = version;
    },
    (error) => {
      console.warn("Se cortó la escucha en vivo de la nube:", error);
    }
  );
}

function detenerEscuchaEnVivo() {
  if (cancelarListenerNube) {
    cancelarListenerNube();
    cancelarListenerNube = null;
  }
}

// -----------------------------------------------------------------------
// COPIA INDIVIDUAL DE CADA ANIMAL (usuarios/{uid}/animales/{caravana})
// No reemplaza nada: es una copia "en paralelo" que alimenta al botón de
// recuperación de emergencia. Se escribe EN LOTES (hasta 100 animales por
// pedido, un lote a la vez) y solo si el animal realmente cambió.
// -----------------------------------------------------------------------
const animalesPendientes = new Map(); // caravana -> datos (objeto) | null (borrar)
const ultimoSubidoPorAnimal = new Map(); // caravana -> JSON de lo último subido
let timeoutLoteAnimales = null;
let loteAnimalesEnCurso = false;
let fallosLoteAnimales = 0;

function programarLoteAnimales(espera = 2000) {
  clearTimeout(timeoutLoteAnimales);
  timeoutLoteAnimales = setTimeout(subirLoteAnimales, espera);
}

function programarSubidaIndividual(caravana, datos) {
  if (!uidActual) return;
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return;
  animalesPendientes.set(caravana, datos);
  programarLoteAnimales();
}

function borrarAnimalIndividual(caravana) {
  if (!sincronizacionActiva || !uidActual) return;
  animalesPendientes.set(caravana, null);
  programarLoteAnimales();
}

async function subirLoteAnimales() {
  if (!sincronizacionActiva || !uidActual) return;
  if (animalesPendientes.size === 0) return;
  if (loteAnimalesEnCurso) {
    programarLoteAnimales(2000);
    return;
  }

  loteAnimalesEnCurso = true;
  const uid = uidActual;
  try {
    const entradas = Array.from(animalesPendientes.entries()).slice(0, TAMANO_LOTE);
    const batch = writeBatch(db);
    const marca = new Date().toISOString();
    const invalidas = [];
    let operaciones = 0;

    entradas.forEach(([caravana, datos]) => {
      let ref;
      try {
        ref = doc(db, "usuarios", uid, "animales", caravana);
      } catch (e) {
        // Caravana con caracteres que Firestore no admite en un ID (por
        // ejemplo "/"): se descarta para que no trabe al resto.
        console.warn(`Caravana no válida para copia individual: ${caravana}`, e);
        invalidas.push(caravana);
        return;
      }
      if (datos === null) {
        batch.delete(ref);
        operaciones += 1;
        return;
      }
      if (ultimoSubidoPorAnimal.get(caravana) === JSON.stringify(datos)) return; // sin cambios
      batch.set(ref, { ...datos, actualizado: marca });
      operaciones += 1;
    });

    if (operaciones > 0) await conTiempoLimite(batch.commit());

    entradas.forEach(([caravana, datos]) => {
      // Solo se saca de la cola si no volvió a cambiar mientras se subía
      if (animalesPendientes.get(caravana) === datos) animalesPendientes.delete(caravana);
      if (invalidas.includes(caravana)) return;
      if (datos === null) ultimoSubidoPorAnimal.delete(caravana);
      else ultimoSubidoPorAnimal.set(caravana, JSON.stringify(datos));
    });
    fallosLoteAnimales = 0;
  } catch (e) {
    fallosLoteAnimales += 1;
    console.error("No se pudo subir el lote de animales:", e);
  } finally {
    loteAnimalesEnCurso = false;
    if (animalesPendientes.size > 0 && sincronizacionActiva) {
      const espera =
        fallosLoteAnimales > 0
          ? ESPERAS_REINTENTO[Math.min(fallosLoteAnimales - 1, ESPERAS_REINTENTO.length - 1)]
          : 500;
      programarLoteAnimales(espera);
    }
  }
}

// -----------------------------------------------------------------------
// ESPÍA DE localStorage
// -----------------------------------------------------------------------
// Se sobreescribe en Storage.prototype (no en la instancia localStorage
// directamente) porque en Safari/WebKit (y por lo tanto en TODOS los
// navegadores de iPhone, incluido Chrome, que ahí corre sobre WebKit)
// sobreescribir "localStorage.setItem" a veces no toma efecto: el
// navegador sigue usando el método nativo por dentro, en silencio, sin
// avisar ningún error. Pisando el prototipo en vez de la instancia, sí
// funciona de forma confiable en todos los navegadores.
Storage.prototype.setItem = function (clave, valor) {
  const valorNuevo = String(valor);
  const valorAnterior = localStorage.getItem(clave);
  originalSetItem(clave, valorNuevo);
  if (esClaveReservada(clave)) return;

  // Si el valor es idéntico al que ya había, no cambió nada: no se sube.
  // (Evita miles de guardados inútiles cuando la app vuelve a guardar
  // todos los animales sin haber modificado nada.)
  if (valorAnterior === valorNuevo) return;

  registrarCambioLocal(clave, "set");
  programarSubida();

  if (clave.startsWith("animal:")) {
    try {
      const caravana = clave.slice("animal:".length);
      const datos = JSON.parse(valorNuevo);
      programarSubidaIndividual(caravana, datos);
    } catch (e) {
      // el valor no era JSON válido; no se sube individualmente
    }
  }
};

Storage.prototype.removeItem = function (clave) {
  const existia = localStorage.getItem(clave) !== null;
  originalRemoveItem(clave);
  if (esClaveReservada(clave)) return;
  if (!existia) return;

  registrarCambioLocal(clave, "del");
  programarSubida();

  if (clave.startsWith("animal:")) {
    borrarAnimalIndividual(clave.slice("animal:".length));
  }
};

Storage.prototype.clear = function () {
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

// -----------------------------------------------------------------------
// GATILLOS (conexión, pantalla, foco, chequeos periódicos)
// -----------------------------------------------------------------------
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (!sincronizacionActiva) return;
    if (pendienteDeSubir) {
      intentosFallidos = 0;
      subirAhora();
    } else {
      fijarEstado("sincronizado");
      traerNovedadesDeLaNube();
    }
    if (animalesPendientes.size > 0) programarLoteAnimales(500);
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

  // Al ocultar la pantalla / cerrar la app: se deja el registro de
  // pendientes guardado en el dispositivo y se intenta subir.
  const forzarSubidaSiHacePendiente = () => {
    if (!sincronizacionActiva) return;
    guardarCambiosPendientes();
    if (pendienteDeSubir) {
      clearTimeout(timeoutGuardado);
      subirAhora();
    }
  };

  // Al volver a la pantalla / recuperar el foco: si hay algo pendiente
  // se sube; si no, se revisa si otros dispositivos cargaron novedades.
  const alVolverAVer = () => {
    if (!sincronizacionActiva) return;
    if (pendienteDeSubir) {
      intentosFallidos = 0;
      subirAhora();
    } else {
      traerNovedadesDeLaNube();
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") forzarSubidaSiHacePendiente();
    if (document.visibilityState === "visible") alVolverAVer();
  });
  window.addEventListener("pagehide", forzarSubidaSiHacePendiente);
  window.addEventListener("focus", alVolverAVer);

  // Chequeo periódico de respaldo para reintentar subidas pendientes, sin
  // depender de si el navegador "dice" que hay conexión (en algunos
  // celulares esa información no se actualiza bien). El semáforo
  // (subidaEnCurso) evita que choque con otro intento en curso.
  setInterval(() => {
    if (pendienteDeSubir && sincronizacionActiva) {
      subirAhora();
    }
  }, 20000);

  // Revisión de novedades de otros dispositivos mientras la pantalla se ve.
  setInterval(() => {
    if (document.visibilityState === "visible") traerNovedadesDeLaNube();
  }, 45000);
}

// -----------------------------------------------------------------------
// INICIO / CIERRE DE SESIÓN
// -----------------------------------------------------------------------
export async function iniciarSincronizacion(uid) {
  const cuentaAnterior = localStorage.getItem("agrodata:cuentaActual");

  // ¿Quedaron cambios de una sesión anterior en ESTE dispositivo que
  // todavía no se habían confirmado como subidos? (por ejemplo, se
  // cargó algo sin señal y la app se cerró o se pausó antes de que
  // volviera la conexión).
  const habiaPendienteSinSubir = localStorage.getItem("agrodata:pendienteSubir") === "1";

  if (cuentaAnterior && cuentaAnterior !== uid) {
    borrarSoloDatosDeApp();
    limpiarCambiosPendientes();
    originalRemoveItem("agrodata:pendienteSubir");
  }

  uidActual = uid;
  sincronizacionActiva = true;
  restaurando = true;
  animalesPendientes.clear();
  ultimoSubidoPorAnimal.clear();
  fijarEstado("guardando");
  iniciarEscuchaEnVivo(uid);
  
  try {
    if (cuentaAnterior === uid && habiaPendienteSinSubir) {
      // Hay cambios locales de la misma cuenta sin confirmar subidos.
      // NO traemos nada de la nube antes de subirlos (taparía el cambio
      // con una versión vieja). La subida hace el merge con la nube.
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
  detenerEscuchaEnVivo();
  sincronizacionActiva = false;
  uidActual = null;
  ultimaVersionConocida = null;
  pendienteDeSubir = false;
  subidaEnCurso = false;
  pullEnCurso = false;
  intentosFallidos = 0;
  clearTimeout(timeoutGuardado);
  clearTimeout(timeoutLoteAnimales);
  animalesPendientes.clear();
  ultimoSubidoPorAnimal.clear();
  loteAnimalesEnCurso = false;
  fallosLoteAnimales = 0;
  ultimoBackupMs = 0;
  ultimaFechaLimpieza = null;
  borrarSoloDatosDeApp();
  limpiarCambiosPendientes();
  originalRemoveItem("agrodata:pendienteSubir");
  fijarEstado("inactivo");

  return { exito };
}

// -----------------------------------------------------------------------
// BACKUPS: listar / descargar / restaurar
// -----------------------------------------------------------------------
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
    // backup, como para subir. Así la nube queda igual al backup.
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

// -----------------------------------------------------------------------
// RECUPERACIÓN DE EMERGENCIA Y MANTENIMIENTO DE LA SUBCOLECCIÓN "animales"
// -----------------------------------------------------------------------
export async function recuperarAnimalesDesdeSubcoleccion() {
  if (!uidActual) return { recuperados: 0, error: "No hay sesión activa." };
  try {
    const refColeccion = collection(db, "usuarios", uidActual, "animales");
    const snapshot = await conTiempoLimite(getDocs(refColeccion));
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
    const uid = uidActual;
    const claves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave && clave.startsWith("animal:")) claves.push(clave);
    }

    const marca = new Date().toISOString();
    const pendientes = [];
    for (const clave of claves) {
      let datos;
      try {
        datos = JSON.parse(localStorage.getItem(clave));
      } catch (e) {
        continue;
      }
      if (!datos || typeof datos !== "object" || Array.isArray(datos)) continue;

      const caravana = clave.slice("animal:".length);
      let ref;
      try {
        ref = doc(db, "usuarios", uid, "animales", caravana);
      } catch (e) {
        console.warn(`Caravana no válida para copia individual: ${caravana}`, e);
        continue;
      }
      pendientes.push({ caravana, datos, ref });
    }

    // En lotes: un pedido por cada TAMANO_LOTE animales, no uno por animal.
    let subidos = 0;
    for (let i = 0; i < pendientes.length; i += TAMANO_LOTE) {
      const lote = pendientes.slice(i, i + TAMANO_LOTE);
      try {
        const batch = writeBatch(db);
        lote.forEach(({ datos, ref }) => batch.set(ref, { ...datos, actualizado: marca }));
        // eslint-disable-next-line no-await-in-loop
        await conTiempoLimite(batch.commit());
        lote.forEach(({ caravana, datos }) => ultimoSubidoPorAnimal.set(caravana, JSON.stringify(datos)));
        subidos += lote.length;
      } catch (e) {
        console.error("No se pudo subir un lote de animales:", e);
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
  // Seguridad: esta función borra de Firebase lo que ESTE dispositivo no
  // tiene. Si hay cambios sin subir, la lista local puede estar desactualizada.
  if (pendienteDeSubir) {
    return { eliminados: 0, error: "Hay cambios sin subir. Esperá a que diga 'sincronizado' y volvé a intentar." };
  }
  try {
    const caravanasLocales = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave && clave.startsWith("animal:")) {
        caravanasLocales.add(clave.slice("animal:".length));
      }
    }

    const refColeccion = collection(db, "usuarios", uidActual, "animales");
    const snapshot = await conTiempoLimite(getDocs(refColeccion));
    const huerfanos = snapshot.docs.filter((d) => !caravanasLocales.has(d.id));

    let eliminados = 0;
    for (let i = 0; i < huerfanos.length; i += TAMANO_LOTE) {
      const lote = huerfanos.slice(i, i + TAMANO_LOTE);
      const batch = writeBatch(db);
      lote.forEach((d) => batch.delete(d.ref));
      // eslint-disable-next-line no-await-in-loop
      await conTiempoLimite(batch.commit());
      eliminados += lote.length;
    }

    return { eliminados };
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
