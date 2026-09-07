// -----------------------------------------------------------------------
// SINCRONIZADOR CON LA NUBE
// -----------------------------------------------------------------------
// La app (App.jsx) guarda todos sus datos con localStorage, que es una
// libreta que vive solo en ese navegador/dispositivo.
//
// Este archivo NO cambia esa forma de trabajar: App.jsx sigue usando
// localStorage exactamente igual. Lo que hace es "espiar" cada vez que
// se guarda algo, y mandar una copia a Firestore (la base de datos en la
// nube), asociada a la cuenta (uid) del usuario logueado.
//
// Cuando alguien se loguea desde otro dispositivo, antes de mostrar la
// app se trae esa copia de la nube y se restaura en el localStorage local,
// para que todo aparezca igual que en el otro dispositivo.
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

// Junta todo lo que hay en localStorage en un solo objeto para subirlo entero.
function leerTodoLocalStorage() {
  const copia = {};
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    copia[clave] = localStorage.getItem(clave);
  }
  return copia;
}

// Sube el estado actual de localStorage a Firestore (con una pequeña espera
// para no mandar un pedido a la nube por cada letra que se escribe).
function programarSubida() {
  if (!sincronizacionActiva || !uidActual || restaurando) return;
  clearTimeout(timeoutGuardado);
  timeoutGuardado = setTimeout(async () => {
    try {
      const datos = leerTodoLocalStorage();
      await setDoc(doc(db, "usuarios", uidActual), {
        datos,
        actualizado: new Date().toISOString(),
      });
    } catch (e) {
      console.error("No se pudo sincronizar con la nube:", e);
    }
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

/**
 * Se llama justo después de loguearse. Trae los datos guardados en la nube
 * para esa cuenta y los vuelca en el localStorage de este dispositivo.
 */
export async function iniciarSincronizacion(uid) {
  uidActual = uid;
  restaurando = true;
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
  } finally {
    restaurando = false;
    sincronizacionActiva = true;
  }
}

/**
 * Se llama al cerrar sesión: apaga la sincronización y limpia el
 * dispositivo, para que la próxima persona que use este navegador no vea
 * los datos de la cuenta anterior.
 */
export function detenerSincronizacion() {
  sincronizacionActiva = false;
  uidActual = null;
  originalClear();
}
