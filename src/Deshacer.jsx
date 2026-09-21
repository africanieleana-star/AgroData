import React, { useEffect, useState } from "react";

// -----------------------------------------------------------------------
// DESHACER: botón flotante para volver atrás la última acción.
// -----------------------------------------------------------------------
// Cómo funciona (en criollo):
//  - Cada vez que la app guarda o borra algo, este archivo anota cómo
//    estaba ese dato JUSTO ANTES del cambio.
//  - Los cambios que ocurren casi juntos (por ejemplo, guardar una vaca
//    y la ficha de su cría) se agrupan y cuentan como UNA sola acción.
//  - Al tocar "Deshacer", se devuelve todo a como estaba antes de la
//    última acción. Se puede tocar varias veces para ir más atrás
//    (hasta las últimas 20 acciones).
//  - Lo que se deshace también se sincroniza con la nube, igual que
//    cualquier otro cambio.
//
// Importante: el historial de "deshacer" vive mientras la app está
// abierta. Si se recarga la página o se cierra sesión, se vacía.
// -----------------------------------------------------------------------

// Claves que NO cuentan como "acciones" de la persona (son internas).
const PREFIJOS_IGNORADOS = [
  "firebase:",
  "firebaseLocalStorageDb",
  "firebase-heartbeat",
  "agrodata:cuentaActual",
  "ultimoAvisoAlertas",
  "__", // claves de prueba internas de algunas librerías
];

const MAXIMO_PASOS = 20; // cuántas acciones se pueden ir deshaciendo
const ESPERA_CIERRE_MS = 700; // cambios dentro de este tiempo = una sola acción

let pila = []; // cada paso: { cambios: { clave: valorAnterior | null }, etiqueta }
let grupoAbierto = null;
let temporizador = null;
let restaurando = false;
const oyentes = new Set();

function esIgnorada(clave) {
  return PREFIJOS_IGNORADOS.some((prefijo) => String(clave).startsWith(prefijo));
}

function avisarCambio() {
  const etiqueta = pila.length > 0 ? pila[pila.length - 1].etiqueta : null;
  oyentes.forEach((cb) => {
    try {
      cb(etiqueta);
    } catch (e) {
      // un oyente roto no debe frenar nada
    }
  });
}

// Se llama JUSTO ANTES de cada cambio: guarda cómo estaba el dato.
function anotarAntesDeCambiar(clave, valorNuevo) {
  if (restaurando || esIgnorada(clave)) return;
  const valorPrevio = localStorage.getItem(clave); // null si no existía
  if (valorNuevo === null && valorPrevio === null) return; // borrar algo que no existe
  if (valorNuevo !== null && valorPrevio === valorNuevo) return; // no cambia nada

  if (!grupoAbierto) grupoAbierto = { cambios: {} };
  // Solo se anota el PRIMER valor de cada clave dentro de la acción
  if (!(clave in grupoAbierto.cambios)) grupoAbierto.cambios[clave] = valorPrevio;

  clearTimeout(temporizador);
  temporizador = setTimeout(cerrarGrupo, ESPERA_CIERRE_MS);
}

function armarEtiqueta(cambios) {
  const claves = Object.keys(cambios);
  const fichas = claves.filter((c) => c.startsWith("animal:"));
  const otras = claves.filter((c) => !c.startsWith("animal:"));

  if (fichas.length === 1 && otras.length === 0) {
    const clave = fichas[0];
    const numero = clave.slice("animal:".length);
    const antes = cambios[clave];
    const ahora = localStorage.getItem(clave);
    if (antes === null) return `Se creó la ficha N° ${numero}`;
    if (ahora === null) return `Se eliminó la ficha N° ${numero}`;
    return `Se modificó la ficha N° ${numero}`;
  }
  if (otras.length === 0 && fichas.length > 1) return `Cambios en ${fichas.length} fichas`;
  if (otras.some((c) => /venta/i.test(c))) return "Cambios en ventas";
  if (otras.some((c) => /tarea/i.test(c))) return "Cambios en tareas / sanidad";
  return "Último cambio";
}

// Cierra la acción en curso y la guarda en la lista de "deshacer".
function cerrarGrupo() {
  clearTimeout(temporizador);
  temporizador = null;
  if (!grupoAbierto) return;

  const cambios = {};
  Object.keys(grupoAbierto.cambios).forEach((clave) => {
    const antes = grupoAbierto.cambios[clave];
    const ahora = localStorage.getItem(clave);
    if (antes !== ahora) cambios[clave] = antes; // se descartan los que terminaron igual
  });
  grupoAbierto = null;

  if (Object.keys(cambios).length === 0) return;

  pila.push({ cambios, etiqueta: armarEtiqueta(cambios) });
  if (pila.length > MAXIMO_PASOS) pila.shift();
  avisarCambio();
}

// Vacía todo el historial de "deshacer" (al entrar o salir de una sesión).
function limpiarHistorial() {
  clearTimeout(temporizador);
  temporizador = null;
  grupoAbierto = null;
  pila = [];
  avisarCambio();
}

// Se engancha a los guardados/borrados del almacenamiento del navegador.
// Se hace UNA sola vez, apenas arranca la app y ANTES de que arranque el
// sincronizador con la nube (por eso este archivo se importa primero en
// main.jsx). Así funciona igual en Chrome, Safari, Firefox, celular y PC.
function enganchar() {
  if (typeof window === "undefined" || typeof Storage === "undefined") return;
  if (window.__agroDeshacerListo) return;
  window.__agroDeshacerListo = true;

  const setDelNavegador = Storage.prototype.setItem;
  const removeDelNavegador = Storage.prototype.removeItem;

  Storage.prototype.setItem = function (clave, valor) {
    if (this === window.localStorage) anotarAntesDeCambiar(clave, String(valor));
    return setDelNavegador.call(this, clave, valor);
  };
  Storage.prototype.removeItem = function (clave) {
    if (this === window.localStorage) anotarAntesDeCambiar(clave, null);
    return removeDelNavegador.call(this, clave);
  };
}

enganchar();

// Vuelve atrás la última acción. Devuelve el texto de lo que se deshizo
// (o null si no había nada para deshacer).
export function deshacerUltimaAccion() {
  cerrarGrupo(); // por si hay una acción todavía "abierta"
  const paso = pila.pop();
  if (!paso) return null;

  restaurando = true; // para que este mismo "deshacer" no se anote como acción nueva
  try {
    // Se usan las funciones normales de la app, así el sincronizador con
    // la nube también se entera y sube lo que se deshizo.
    Object.keys(paso.cambios).forEach((clave) => {
      const valorAnterior = paso.cambios[clave];
      if (valorAnterior === null) localStorage.removeItem(clave);
      else localStorage.setItem(clave, valorAnterior);
    });
  } finally {
    restaurando = false;
  }

  avisarCambio();
  try {
    window.dispatchEvent(new Event("agrodata:actualizado")); // refresca listados abiertos
  } catch (e) {
    // no pasa nada
  }
  return paso.etiqueta;
}

// Botón flotante. Solo aparece cuando hay algo para deshacer.
export default function BotonDeshacer({ onDeshecho }) {
  const [etiqueta, setEtiqueta] = useState(null);

  useEffect(() => {
    limpiarHistorial(); // al entrar a la app se empieza con el historial vacío
    oyentes.add(setEtiqueta);
    return () => {
      oyentes.delete(setEtiqueta);
      limpiarHistorial(); // al cerrar sesión se borra, para no mezclar cuentas
    };
  }, []);

  if (!etiqueta) return null;

  const alTocar = () => {
    const texto = deshacerUltimaAccion();
    if (texto && onDeshecho) onDeshecho(texto);
  };

  return (
    <button
      type="button"
      onClick={alTocar}
      title={`Deshacer: ${etiqueta}`}
      style={{
        position: "fixed",
        bottom: 100,
        left: 16,
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "var(--crema, #FFFFFF)",
        border: "1.5px solid var(--terracota, #A8452F)",
        borderRadius: 999,
        padding: "6px 12px",
        boxShadow: "0 2px 8px rgba(59,42,29,0.12)",
        fontFamily: "'Inter', sans-serif",
        fontSize: 11.5,
        fontWeight: 700,
        color: "var(--terracota, #A8452F)",
        cursor: "pointer",
        maxWidth: "70vw",
      }}
    >
      <span style={{ flexShrink: 0 }}>↩️</span>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        Deshacer: {etiqueta}
      </span>
    </button>
  );
}
