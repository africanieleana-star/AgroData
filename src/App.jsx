import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Tag,
  Check,
  AlertTriangle,
  Loader2,
  CalendarClock,
  Search,
  ArrowLeft,
  List,
  X,
  Menu,
  Home,
  GitFork,
  Syringe,
  PlusCircle,
  MessageCircle,
  Send,
  Mic,
  Volume2
} from "lucide-react";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

const TIPOS = [
  { valor: "Vaca" },
  { valor: "Vaquillona" },
  { valor: "Toro", },
  { valor: "Novillo" },
  { valor: "Ternera" },
  { valor: "Ternero" },
];

const APLICA_SERVICIO = ["Vaca", "Vaquillona", "Ternera"];

// Plan sanitario de referencia, usado tanto por la pantalla de Sanidad
// como por el chatbot para responder preguntas sobre vacunas y fechas.
const PLANES_SANITARIOS = {
  Terneros: [
    { meses: "Marzo - Abril", tarea: "Antiparasitario (según H.P.G.)" },
    { meses: "Marzo", tarea: "Vacuna Brucelosis" },
    { meses: "Marzo - Abril", tarea: "Vacuna Aftosa" },
    { meses: "Mayo", tarea: "Refuerzo de Cobre" },
    { meses: "Septiembre - Octubre", tarea: "Vacuna Neumonía" },
    { meses: "Septiembre - Octubre", tarea: "Vacuna Mancha" },
    { meses: "Septiembre - Octubre", tarea: "Vacuna Querato-conjuntivitis" },
    { meses: "Noviembre", tarea: "Antiparasitario" },
  ],
  Vaquillonas: [
    { meses: "Marzo", tarea: "Vacuna Carbunclo" },
    { meses: "Marzo", tarea: "Antiparasitario" },
    { meses: "Marzo", tarea: "Vacuna Aftosa" },
    { meses: "Marzo - Abril", tarea: "Refuerzo de Cobre" },
    { meses: "Mayo - Junio", tarea: "Vacuna Diarrea-Neonatal" },
    { meses: "Abril - Mayo", tarea: "Vacunas Reproductivas" },
    { meses: "Agosto - Septiembre", tarea: "Refuerzo Cobre / Reproductivas" },
    { meses: "Septiembre", tarea: "Antiparasitario" },
  ],
  Vacas: [
    { meses: "Marzo", tarea: "Vacunas Reproductivas" },
    { meses: "Marzo", tarea: "Vacuna Carbunclo" },
    { meses: "Marzo", tarea: "Refuerzo de Cobre" },
    { meses: "Marzo", tarea: "Vacuna Aftosa" },
    { meses: "Junio", tarea: "Vacuna Diarrea-Neonatal" },
    { meses: "Junio", tarea: "Refuerzo de Cobre" },
    { meses: "Septiembre", tarea: "Vacunas Reproductivas" },
    { meses: "Septiembre", tarea: "Antiparasitario" },
    { meses: "Octubre", tarea: "Refuerzo de Cobre" },
  ],
  Toros: [
    { meses: "Marzo", tarea: "Vacuna Carbunclo" },
    { meses: "Mayo - Junio", tarea: "Vacunas Reproductivas" },
    { meses: "Mayo - Junio", tarea: "Antiparasitario" },
    { meses: "Mayo - Junio", tarea: "Control de Toros (Raspado venéreo)" },
    { meses: "Mayo - Junio", tarea: "Refuerzo de Cobre" },
    { meses: "Septiembre", tarea: "Vacunas Reproductivas" },
    { meses: "Septiembre", tarea: "Refuerzo de Cobre" },
  ],
};

// Lee los registros de sanidad ya cargados desde la pantalla "Sanidad"
// (se guardan bajo la clave "tareas_manuales", con el texto que empieza
// con "💉 Sanidad:").
function leerRegistrosSanidad() {
  try {
    const guardadas = JSON.parse(localStorage.getItem("tareas_manuales") || "[]");
    return guardadas.filter((t) => t.texto && t.texto.includes("💉 Sanidad:"));
  } catch (e) {
    return [];
  }
}

function sumarDiasISO(fechaISO, dias) {
  if (!fechaISO) return null;
  const partes = fechaISO.split("-");
  if (partes.length !== 3) return null;
  const [anio, mes, dia] = partes.map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  if (isNaN(fecha.getTime())) return null;
  fecha.setDate(fecha.getDate() + dias);
  return fecha;
}

function formatearFechaDDMMYYYY(date) {
  if (!date) return null;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// 🌟 PEGAR AQUÍ LA CALCULADORA AUTOMÁTICA DE PADRE Y ORIGEN
const determinarPadreYOrigen = (historialServicios, fechaNacimientoStr) => {
  if (!historialServicios || !Array.isArray(historialServicios) || !fechaNacimientoStr) {
    return { padre: "Sin registrar", origen: "Sin registrar" };
  }

  const fechaParto = new Date(fechaNacimientoStr + "T00:00:00");

  for (let serv of [...historialServicios].reverse()) {
    // 1. Inseminación Artificial
    if (serv.inseminacion && serv.inseminacion.fecha) {
      const fechaIA = new Date(serv.inseminacion.fecha + "T00:00:00");
      const diferenciaDias = Math.round((fechaParto - fechaIA) / (1000 * 60 * 60 * 24));

      // 🎯 Entre 260 y 300 días -> Inseminación Artificial
      if (diferenciaDias >= 260 && diferenciaDias <= 300) {
        return {
          padre: serv.inseminacion.nombre || "Toro IA (Sin Nombre)",
          origen: "Inseminación Artificial"
        };
      }

      // 🎯 Más de 300 días -> Pasó a Repaso con Toro (si existía un toro cargado)
      if (diferenciaDias > 300 && serv.toro) {
        return {
          padre: serv.toro.nombre || "Toro Repaso (Sin Nombre)",
          origen: "Repaso con Toro"
        };
      }
    }

    // 2. Servicio Directo con Toro (sin IA)
    if (serv.toro && serv.toro.fecha && !serv.inseminacion) {
      const fechaToro = new Date(serv.toro.fecha + "T00:00:00");
      const diferenciaDias = Math.round((fechaParto - fechaToro) / (1000 * 60 * 60 * 24));

      if (diferenciaDias >= 260 && diferenciaDias <= 310) {
        return {
          padre: serv.toro.nombre || "Toro (Sin Nombre)",
          origen: serv.toro.esRepasoToro ? "Repaso con Toro" : "Servicio Natural"
        };
      }
    }
  }

  return { padre: "Sin registrar", origen: "Sin registrar" };
};


// Solo se calculan si hay fecha de inseminación cargada (no se estima nada sin ese dato)
function calcularFechasInseminacion(fechaISO) {
  if (!fechaISO) return null;
  const repaso = sumarDiasISO(fechaISO, 21);
  const partoDesde = sumarDiasISO(fechaISO, 260);
  const partoHasta = sumarDiasISO(fechaISO, 300);
  const partoRepasoDesde = sumarDiasISO(fechaISO, 300);
  if (!repaso || !partoDesde || !partoHasta || !partoRepasoDesde) return null;
  return {
    repasoSugerido: formatearFechaDDMMYYYY(repaso),
    partoInseminacionDesde: formatearFechaDDMMYYYY(partoDesde),
    partoInseminacionHasta: formatearFechaDDMMYYYY(partoHasta),
    partoRepasoDesde: formatearFechaDDMMYYYY(partoRepasoDesde),
  };
}

// Solo se calcula si hay fecha de parición cargada
function calcularProximoServicio(fechaISO) {
  if (!fechaISO) return null;
  const proximo = sumarDiasISO(fechaISO, 40);
  if (!proximo) return null;
  return formatearFechaDDMMYYYY(proximo);
}

function parseISO(fechaISO) {
  if (!fechaISO) return null;
  const partes = fechaISO.split("-");
  if (partes.length !== 3) return null;
  const [anio, mes, dia] = partes.map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return isNaN(fecha.getTime()) ? null : fecha;
}

// Compara la fecha real de nacimiento contra los rangos probables de parto
// para determinar si la cría fue concebida por inseminación o por repaso con toro.
// Ambos servicios pueden estar cargados a la vez (no son excluyentes); se decide
// según en qué rango de días cae la fecha real de nacimiento.
// Devuelve null si no hay datos suficientes para calcularlo (nunca se inventa).
function determinarOrigenCria(fechaInseminacionISO, fechaToroISO, fechaNacimientoISO) {
  if (!fechaNacimientoISO) return null;
  const nacimiento = parseISO(fechaNacimientoISO);
  if (!nacimiento) return null;

  if (fechaInseminacionISO) {
    const inseminacion = parseISO(fechaInseminacionISO);
    if (inseminacion) {
      const diffDias = Math.round((nacimiento - inseminacion) / 86400000);
      if (diffDias >= 260 && diffDias <= 300) return "Inseminacion";
      if (diffDias > 300) return "Toro"; // pasados los 300 días, se atribuye al repaso
      if (!fechaToroISO) return "Indeterminado"; // no cae dentro de los rangos calculados
    }
  }

  if (fechaToroISO) {
    return "Toro";
  }

  return null;
}

function etiquetaOrigenCria(origen) {
  if (origen === "Inseminacion") return "Inseminación";
  if (origen === "Toro") return "Toro";
  if (origen === "Indeterminado") return "No coincide con las fechas calculadas";
  return null;
}

const ESTILOS_GLOBALES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    @font-face {
    font-family: 'PP Neue Montreal Bold';
    src: url('/fonts/ppneuemontreal-bold.woff') format('woff');
    font-weight: 700;
    font-style: normal;
  }
  :root {
    --verde-monte: #3E4E2F;
    --verde-monte-oscuro: #2E3B22;
    --verde-salvia: #8A9A6B;
    --marron-cuero: #8B5A2B;
    --marron-cuero-oscuro: #714823;
    --marron-oscuro: #3B2A1D;
    --arena: #F5F3EE;;
    --crema: #FFFFFF;
    --borde: #E2DCCB;
    --terracota: #A8452F;
    --verde-exito: #4F6B3A;
  }
  html, body, #root {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    min-height: 100vh !important;
    background-color: var(--arena) !important;
  }
  .tipo-btn { transition: all 0.15s ease; }
  .seccion-desplegable { cursor: pointer; } 
  .seccion-desplegable::-webkit-details-marker { display: none; } 
  .seccion-desplegable::after { content: '▾'; float: right; transition: transform 0.2s ease; } details[open] > 
  .seccion-desplegable::after { transform: rotate(180deg); }
  .tipo-btn:active { transform: scale(0.97); }
  .btn-principal:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-principal:not(:disabled):active { transform: scale(0.98); }
  input:focus-visible, textarea:focus-visible, .tipo-btn:focus-visible, .btn-principal:focus-visible {
    outline: 3px solid var(--verde-monte);
    outline-offset: 2px;
  }
  
  /* Grilla adaptable */
  .grilla-formulario {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }

  @media (min-width: 640px) {
    .grilla-formulario {
      grid-template-columns: 1fr 1fr;
    }
    .columna-completa {
      grid-column: span 2;
    }
  }

  /* Resaltado de la opción activa en el menú lateral */
  .opcion-menu-activa {
    background: var(--verde-monte) !important;
    color: #FBF7ED !important;
  }

  /* ======================================================== */
  /* 1. ESTILOS PARA CELULARES (Menú flotante / Oculto 100%)  */
  /* ======================================================== */

  .menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
    z-index: 200;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  .menu-overlay.activo {
    opacity: 1;
    pointer-events: auto;
  }

  .menu-lateral {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    max-width: 82vw;
    height: 100vh;
    background: var(--crema);
    border-right: 1px solid var(--borde);
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.15);
    z-index: 201;
    padding: 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    
    /* 🔴 Oculta el menú totalmente a la izquierda en celulares */
    transform: translateX(-100%);
    visibility: hidden;
    transition: transform 0.3s ease-in-out, visibility 0.3s ease-in-out;
  }

  /* 🟢 Se muestra solo cuando presionas las tres rayitas y se activa "abierto" */
  .menu-lateral.abierto {
    transform: translateX(0);
    visibility: visible;
  }

  .menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .menu-titulo {
    margin: 0;
    font-size: 17px;
    font-family: 'PP Neue Montreal Bold';
    font-weight: 700;
    color: var(--marron-oscuro);
  }

  .menu-btn-cerrar {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--marron-cuero-oscuro);
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .menu-opcion {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    border-radius: 10px;
    border: none;
    background: #FFFDF8;
    color: var(--marron-oscuro);
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    transition: background 0.2s ease;
  }

  .menu-opcion:hover {
    background: var(--arena);
  }

  /* ======================================================== */
  /* 2. ESTILOS PARA NOTEBOOKS Y TABLETS (Pantallas > 768px)  */
  /* ======================================================== */
    @media (min-width: 768px) {
    .menu-overlay {
      display: none !important;
    }

    .app-container {
      display: flex;
      min-height: 100vh;
      width: 100%;
      align-items: stretch;
    }

    .contenido-principal {
      flex: 1;
      width: 100%;
      box-sizing: border-box;
    }

    .app-header {
  position: sticky !important;
  top: 0 !important;
  z-index: 50 !important;
}

    .menu-lateral {
      position: sticky;
      top: 10;
      left: 0;
      transform: none !important;
      margin-left: 0;
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
      z-index: 1;
    }

        .menu-lateral.cerrado {
      width: 72px;
      min-width: 72px;
      padding: 20px 10px;
      overflow: hidden;
      transition: width 0.35s ease-in-out, padding 0.35s ease-in-out;
    }

    .menu-lateral.cerrado .menu-titulo,
    .menu-lateral.cerrado .menu-opcion span,
    .menu-lateral.cerrado .menu-pie-texto {
      display: none;
    }

    .menu-lateral.cerrado .menu-header-marca {
      justify-content: center;
      width: 100%;
    }

    .menu-lateral.cerrado .menu-opcion {
      justify-content: center;
      padding: 12px 0;
    }

    .menu-btn-cerrar {
      display: none;
    }
  }
`;

export default function RodeoInteligente() {
  const [pantalla, setPantalla] = useState("inicio"); // "inicio" | "buscar" | "formulario" | "guardado" | "listado" | "resumen" | "alertas"
  // Estado para la fecha y hora actual
  const [fechaHora, setFechaHora] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setFechaHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [fichaEnResumen, setFichaEnResumen] = useState(null);
  const [origenResumen, setOrigenResumen] = useState("listado"); // a dónde volver desde el resumen
  const [menuAbierto, setMenuAbierto] = useState(false);

  // --- Búsqueda ---
  const [caravanaBusqueda, setCaravanaBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null); // null | "existe" | "no_existe"
  const [fichaEncontrada, setFichaEncontrada] = useState(null);

  // --- Ficha en edición / alta ---
  const [caravana, setCaravana] = useState("");
  const [modo, setModo] = useState("nuevo"); // "nuevo" | "edicion"
  const [fichaOriginal, setFichaOriginal] = useState(null);
  const [tipo, setTipo] = useState(null);
  const [raza, setRaza] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [caravanaMadreManual, setCaravanaMadreManual] = useState("");
  const [nombrePadreManual, setNombrePadreManual] = useState("");
  const [observacionesAnimal, setObservacionesAnimal] = useState("");

  // Datos de Inseminación
  const [fechaInseminacion, setFechaInseminacion] = useState("");
  const [nombreInseminacion, setNombreInseminacion] = useState("");

  // Datos de Toro / Repaso
  const [fechaToro, setFechaToro] = useState("");
  const [esRepasoToro, setEsRepasoToro] = useState(false);
  const [nombreToro, setNombreToro] = useState("");
  const [observacionesToro, setObservacionesToro] = useState("");

  const [fechaTacto, setFechaTacto] = useState("");
  const [resultadoTacto, setResultadoTacto] = useState(null); // "Preniada" | "Vacia" | null
  const [observaciones, setObservaciones] = useState("");

  const [fechaParicion, setFechaParicion] = useState("");
  const [tipoCria, setTipoCria] = useState(null); // "Hembra" | "Macho" | null
  const [pesoNacer, setPesoNacer] = useState("");
  const [caravanaCria, setCaravanaCria] = useState("");
  const [observacionesParicion, setObservacionesParicion] = useState("");

  // ❌ Función para eliminar una cría del historial y del localStorage
  const eliminarCria = (caravanaCriaABorrar) => {
    if (!window.confirm(`¿Estás segura de eliminar la cría N° ${caravanaCriaABorrar} del historial?`)) return;

    try {
      const historialFiltrado = historialCrias.filter((cria) => cria.caravana !== caravanaCriaABorrar);

      if (typeof setHistorialCrias === "function") {
        setHistorialCrias(historialFiltrado);
      }

      const claveMadre = `animal:${caravana}`;
      const rawMadre = localStorage.getItem(claveMadre);
      if (rawMadre) {
        const fichaMadre = JSON.parse(rawMadre);
        fichaMadre.historialCrias = historialFiltrado;
        localStorage.setItem(claveMadre, JSON.stringify(fichaMadre));
      }

      localStorage.removeItem(`animal:${caravanaCriaABorrar}`);

      mostrarToast(`✅ Cría N° ${caravanaCriaABorrar} eliminada correctamente.`);
    } catch (e) {
      console.error(e);
      mostrarToast("No se pudo eliminar la cría.", "error");
    }
  };

  const [observacionesCria, setObservacionesCria] = useState("");
  const [resultadoCria, setResultadoCria] = useState(null); // null | "creada" | "actualizada" | "conflicto"

  const [versionHistorial, setVersionHistorial] = useState(0);
  const [historialServicios, setHistorialServicios] = useState([]);
  const [historialCrias, setHistorialCrias] = useState([]);

  const [estado, setEstado] = useState("idle"); // idle | guardando | conflicto | error
  const [toast, setToast] = useState(null); // { tipo: "exito" | "error", mensaje: string } | null

  const muestraServicio = true;
  const listoParaGuardar = (caravana || "").length > 0 && tipo !== null;  const enEdicion = modo === "edicion";

  const mostrarToast = (mensaje, tipo = "exito") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  };

    // Aviso automático: cuando se abre la app, si hay pendientes para hoy,
  // se lo muestra sin que el productor tenga que preguntar. Se avisa una
  // sola vez por día para no ser repetitivo.
  useEffect(() => {
    const hoyISO = fechaAISO(new Date());
    const ultimoAviso = localStorage.getItem("ultimoAvisoAlertas");
    if (ultimoAviso === hoyISO) return;

    const animales = leerTodosLosAnimalesGuardados();
    const hoy = new Date();
    let totalAlertas = 0;
    animales.forEach((f) => (totalAlertas += obtenerAlertasDe(f, hoy).length));
    totalAlertas += leerTareasManuales().filter((t) => !t.completada && t.fecha === hoyISO).length;

    if (totalAlertas > 0) {
      mostrarToast(`🔔 Tenés ${totalAlertas} pendiente(s) para hoy. Andá a "Tareas para hoy" para verlos.`);
      if (window.Notification && Notification.permission === "granted") {
        new Notification("AgroData", { body: `Tenés ${totalAlertas} pendiente(s) para hoy.` });
      }
    }
    localStorage.setItem("ultimoAvisoAlertas", hoyISO);
  }, []);

  // Cálculo automático al cargar o modificar la fecha de inseminación
  const calculos = useMemo(() => {
    if (!fechaInseminacion) return null;
    if (typeof calcularFechasInseminacion === "function") {
      return calcularFechasInseminacion(fechaInseminacion.trim());
    }
    try {
      const fechaBase = new Date(fechaInseminacion);
      if (isNaN(fechaBase.getTime())) return null;

      const fechaRepaso = new Date(fechaBase);
      fechaRepaso.setDate(fechaRepaso.getDate() + 21);

      const fechaParicionIA = new Date(fechaBase);
      fechaParicionIA.setDate(fechaParicionIA.getDate() + 283);

      const fechaParicionToro = new Date(fechaBase);
      fechaParicionToro.setDate(fechaParicionToro.getDate() + 304);

      const fFormat = (d) => d.toISOString().slice(0, 10);

      return {
        fechaRepaso: fFormat(fechaRepaso),
        fechaParicionIA: fFormat(fechaParicionIA),
        fechaParicionToro: fFormat(fechaParicionToro),
      };
    } catch (e) {
      return null;
    }
  }, [fechaInseminacion]);

  const proximoServicioSugerido = typeof calcularProximoServicio === "function"
    ? calcularProximoServicio(fechaParicion.trim())
    : null;

  // Servicio "pendiente": lo que está tipeado en el formulario ahora mismo,
  // por si todavía no se apretó el botón "Agregar al historial".
  const servicioPendiente = useMemo(() => {
    const hayInseminacion = fechaInseminacion.trim();
    const hayToro = fechaToro.trim();
    if (!hayInseminacion && !hayToro) return null;
    return {
      inseminacion: hayInseminacion
        ? { fecha: fechaInseminacion.trim(), nombre: nombreInseminacion.trim() }
        : null,
      toro: hayToro
        ? { fecha: fechaToro.trim(), nombre: nombreToro.trim(), esRepasoToro }
        : null,
    };
  }, [fechaInseminacion, nombreInseminacion, fechaToro, nombreToro, esRepasoToro]);

  // Combina el historial ya guardado con lo que está tipeado sin guardar aún.
  const historialCompleto = useMemo(() => {
    return servicioPendiente ? [...historialServicios, servicioPendiente] : historialServicios;
  }, [historialServicios, servicioPendiente]);

  const padreYOrigen = useMemo(() => {
    if (!fechaParicion.trim()) return { padre: "Sin registrar", origen: "Sin registrar" };
    return determinarPadreYOrigen(historialCompleto, fechaParicion.trim());
  }, [historialCompleto, fechaParicion]);

  const origenCria =
    padreYOrigen.origen === "Inseminación Artificial"
      ? "Inseminacion"
      : padreYOrigen.origen === "Repaso con Toro" || padreYOrigen.origen === "Servicio Natural"
        ? "Toro"
        : null;

  const nombrePadreActual = padreYOrigen.padre === "Sin registrar" ? "" : padreYOrigen.padre;

  const seleccionarTacto = (valor) => {
    setResultadoTacto((actual) => (actual === valor ? null : valor));
  };

  const seleccionarTipoCria = (valor) => {
    setTipoCria((actual) => (actual === valor ? null : valor));
  };

  const limpiarFormulario = () => {
    setCaravana("");
    setModo("nuevo");
    setFichaOriginal(null);
    setTipo(null);
    setRaza("");
    setFechaNacimiento("");
    setCaravanaMadreManual("");
    setNombrePadreManual("");
    setObservacionesAnimal("");
    setFechaInseminacion("");
    setNombreInseminacion("");
    setFechaToro("");
    setEsRepasoToro(false);
    setNombreToro("");
    setObservacionesToro("");
    setHistorialServicios([]);
    setHistorialCrias([]);
    setFechaTacto("");
    setResultadoTacto(null);
    setObservaciones("");
    setFechaParicion("");
    setTipoCria(null);
    setPesoNacer("");
    setCaravanaCria("");
    setObservacionesParicion("");
    setObservacionesCria("");
    setResultadoCria(null);
    setEstado("idle");
  };

  const buscar = useCallback(async () => {
    const numero = caravanaBusqueda.trim();
    if (!numero) return;
    setBuscando(true);
    setResultadoBusqueda(null);
    setFichaEncontrada(null);
    try {
      let existente = null;
      try {
        // Leemos directo del almacenamiento local de tu PC
        const res = localStorage.getItem(`animal:${numero}`);
        existente = res ? JSON.parse(res) : null;
      } catch (e) {
        existente = null;
      }
      if (existente) {
        setFichaEncontrada(existente);
        setResultadoBusqueda("existe");
      } else {
        setResultadoBusqueda("no_existe");
      }
    } finally {
      setBuscando(false);
    }
  }, [caravanaBusqueda]);

  const irAEditarFicha = async (f) => {
    if (!f) return;
    setCaravana(f.caravana);
    setModo("edicion");
    setFichaOriginal(f);
    setTipo(f.tipo || null);
    setRaza(f.raza || "");
    setFechaNacimiento(f.fechaNacimiento || f.cria?.fechaNacimiento || "");
    setCaravanaMadreManual(f.caravanaMadre || f.cria?.caravanaMadre || "");
    setNombrePadreManual(f.nombrePadre || f.cria?.nombrePadre || "");
    setObservacionesAnimal(f.observacionesAnimal || "");

    // 🌟 SERVICIO REPRODUCTIVO VACÍO (El historial previo se lee automáticamente arriba en el cuadro amarillo)
    setFechaInseminacion("");
    setNombreInseminacion("");
    setFechaToro("");
    setEsRepasoToro(false);
    setNombreToro("");
    setObservacionesToro("");
    setHistorialServicios(Array.isArray(f.historialServicios) ? f.historialServicios : []);
    setHistorialCrias(Array.isArray(f.historialCrias) ? f.historialCrias : []);

    if (f.tacto) {
      setFechaTacto(f.tacto.fecha || "");
      setResultadoTacto(f.tacto.resultado || null);
      setObservaciones(f.tacto.observaciones || "");
    } else {
      setFechaTacto("");
      setResultadoTacto(null);
      setObservaciones("");
    }

    if (f.paricion) {
      setFechaParicion(f.paricion.fecha || "");
      setTipoCria(f.paricion.tipoCria || null);
      setCaravanaCria(f.paricion.caravanaCria || "");
      setObservacionesParicion(f.paricion.observaciones || "");
    } else {
      setFechaParicion("");
      setTipoCria(null);
      setCaravanaCria("");
      setObservacionesParicion("");
    }

    // Recupera observaciones de la cría desde localStorage
    setObservacionesCria("");
    if (f.paricion && f.paricion.caravanaCria) {
      try {
        const r = localStorage.getItem(`animal:${f.paricion.caravanaCria}`);
        const criaExistente = r ? JSON.parse(r) : null;
        if (criaExistente && criaExistente.esCria && criaExistente.cria) {
          setObservacionesCria(criaExistente.cria.observaciones || "");
        }
      } catch (e) {
        // no había ficha de cría todavía, se deja vacío
      }
    }

    setResultadoCria(null);
    setEstado("idle");
    setPantalla("formulario");
  };

  const irAEditar = async () => {
    await irAEditarFicha(fichaEncontrada);
  };

  const irAListado = () => {
    setPantalla("listado");
  };

  const volverDesdeListado = () => {
    setPantalla("buscar");
  };

  const irAAlertas = () => {
    setPantalla("alertas");
  };

  const volverDesdeAlertas = () => {
    setPantalla("buscar");
  };

  // Navegación desde el menú lateral. Cada destino sabe cómo dejar todo
  // limpio antes de mostrarse (sin arrastrar datos de una ficha anterior).
  const navegarA = (destino) => {
    if (destino === "buscar") {
      volverABuscar();
    } else if (destino === "listado") {
      irAListado();
    } else if (destino === "alertas") {
      irAAlertas();
    } else {
      setPantalla(destino);
    }
  };

  // Al tocar un animal (desde el listado o desde las alertas), primero se
  // muestra el resumen (solo lectura). "origen" indica a qué pantalla
  // volver desde ahí, para no perder el contexto de dónde venía.
  const irAVerResumen = (f, origen = "listado") => {
    setFichaEnResumen(f);
    setOrigenResumen(origen);
    setPantalla("resumen");
  };

  const volverDesdeResumen = () => {
    setFichaEnResumen(null);
    setPantalla(origenResumen);
  };

  // Desde el resumen, el botón "Editar ficha" lleva al formulario completo
  const irAEditarDesdeResumen = async () => {
    await irAEditarFicha(fichaEnResumen);
    setFichaEnResumen(null);
  };

  const irAIngresar = () => {
    const numero = caravanaBusqueda.trim();
    setCaravana(numero);
    setModo("nuevo");
    setFichaOriginal(null);
    setTipo(null);
    setRaza("");
    setFechaNacimiento("");
    setObservacionesAnimal("");
    setFechaInseminacion("");
    setNombreInseminacion("");
    setFechaToro("");
    setEsRepasoToro(false);
    setNombreToro("");
    setObservacionesToro("");
    setHistorialServicios([]);
    setHistorialCrias([]);
    setFechaTacto("");
    setResultadoTacto(null);
    setObservaciones("");
    setFechaParicion("");
    setTipoCria(null);
    setCaravanaCria("");
    setObservacionesParicion("");
    setObservacionesCria("");
    setResultadoCria(null);
    setEstado("idle");
    setPantalla("formulario");
  };

  const volverABuscar = () => {
    setCaravanaBusqueda("");
    setResultadoBusqueda(null);
    setFichaEncontrada(null);
    limpiarFormulario();
    setPantalla("buscar");
  };

  const guardar = useCallback(async () => {
    if (!listoParaGuardar) return;
    setEstado("guardando");
    try {
      const clave = `animal:${caravana}`;

      if (modo === "nuevo") {
        let existente = null;
        try {
          const res = localStorage.getItem(clave);
          existente = res ? JSON.parse(res) : null;
        } catch (e) {
          existente = null;
        }
        // Si el registro existente ya tiene "caravana" cargada, es una ficha real
        // (de otra persona o de una carga anterior). Si no la tiene, es un guardado
        // parcial hecho por los botones "Agregar al historial" de esta misma ficha
        // nueva, y no cuenta como conflicto.
        if (existente && existente.caravana) {
          setEstado("conflicto");
          return;
        }
      }

      // 1. Armamos los datos del servicio que está escrito en el formulario actualmente
      const servicioInseminacion = fechaInseminacion.trim() || nombreInseminacion.trim() ? {
        fecha: fechaInseminacion.trim() || null,
        nombre: nombreInseminacion.trim() || null,
        calculos: calculos || null,
      } : null;

      const servicioToro = fechaToro.trim() || nombreToro.trim() || observacionesToro.trim() ? {
        fecha: fechaToro.trim() || null,
        nombre: nombreToro.trim() || null,
        esRepasoToro: Boolean(esRepasoToro),
        observaciones: observacionesToro.trim() || null,
      } : null;

      const servicioActual = (servicioInseminacion || servicioToro) ? {
        inseminacion: servicioInseminacion,
        toro: servicioToro,
      } : null;

      // 2. RECUPERAR HISTORIAL EXISTENTE DEL LOCALSTORAGE PARA NO PERDER NADA
      let historialAnterior = [];
      try {
        const fichaGuardada = localStorage.getItem(clave);
        if (fichaGuardada) {
          const parsed = JSON.parse(fichaGuardada);
          if (parsed.historialServicios && Array.isArray(parsed.historialServicios)) {
            historialAnterior = parsed.historialServicios;
          } else if (parsed.servicio) {
            historialAnterior = [parsed.servicio];
          }
        }
      } catch (e) {
        historialAnterior = [];
      }

      // 3. COMBINAR EL HISTORIAL VIEJO CON EL NUEVO (Evitando duplicados de la misma fecha)
      let historialServicios = [...historialAnterior];

      if (servicioActual) {
        const existeMismaFecha = historialServicios.some(s =>
          (s.inseminacion?.fecha && s.inseminacion?.fecha === servicioInseminacion?.fecha) ||
          (s.toro?.fecha && s.toro?.fecha === servicioToro?.fecha)
        );

        if (!existeMismaFecha) {
          historialServicios.push(servicioActual);
        } else {
          // Si es la misma fecha, lo actualiza
          historialServicios = historialServicios.map(s => {
            const coincideIA = s.inseminacion?.fecha && s.inseminacion?.fecha === servicioInseminacion?.fecha;
            const coincideToro = s.toro?.fecha && s.toro?.fecha === servicioToro?.fecha;
            return (coincideIA || coincideToro) ? servicioActual : s;
          });
        }
      }

      // 4. TACTO: Se crea SOLO si el usuario ingresó fecha, resultado u observación de tacto
      const tieneDatosTacto = Boolean(
        fechaTacto.trim() ||
        resultadoTacto ||
        observaciones.trim()
      );

      const tacto = tieneDatosTacto ? {
        fecha: fechaTacto.trim() || null,
        resultado: resultadoTacto || null,
        observaciones: observaciones.trim() || null,
      } : null;

      // 5. PARICIÓN: Se crea SOLO si el usuario ingresó fecha, tipo de cría, caravana u observación
      const tieneDatosParicion = Boolean(
        fechaParicion.trim() ||
        tipoCria ||
        caravanaCria.trim() ||
        observacionesParicion.trim()
      );

      const paricion = tieneDatosParicion ? {
        fecha: fechaParicion.trim() || null,
        tipoCria: tipoCria || null,
        caravanaCria: caravanaCria.trim() || null,
        proximoServicioSugerido: fechaParicion.trim() ? proximoServicioSugerido : null,
        observaciones: observacionesParicion.trim() || null,
      } : null;


      // 🐄 Actualizamos el historial de crías de esta madre (una fila por cada
      // caravana de cría registrada, sin duplicar si ya existía esa caravana).
      let historialCriasActualizado = [...historialCrias];
      if (paricion && paricion.caravanaCria && paricion.caravanaCria !== caravana) {
        const nuevaCria = {
          caravana: caravanaCria.trim(),
          fechaNacimiento: fechaParicion,
          sexo: tipoCria,
          pesoNacer: pesoNacer ? `${pesoNacer} kg` : null,
          nombrePadre: nombrePadreActual || "Sin registrar",   // ✅
          origen: padreYOrigen.origen || "Sin registrar",       // ✅
        };
        const yaExiste = historialCriasActualizado.some((c) => c.caravana === paricion.caravanaCria);
        historialCriasActualizado = yaExiste
          ? historialCriasActualizado.map((c) => (c.caravana === paricion.caravanaCria ? nuevaCria : c))
          : [...historialCriasActualizado, nuevaCria];
      }

      const ficha = {
        caravana,
        tipo,
        raza: raza.trim() || null,
        fechaNacimiento: fechaNacimiento || null,
        caravanaMadre: caravanaMadreManual.trim() || null,
        nombrePadre: nombrePadreManual.trim() || null,
        observacionesAnimal: observacionesAnimal.trim() || null,
        fechaAlta: new Date().toISOString().slice(0, 10),
        fechaModificacion: enEdicion ? new Date().toISOString().slice(0, 10) : null,
        servicio: servicioActual,
        historialServicios, // 👈 ¡ACÁ GUARDAMOS LA LISTA COMPLETA!
        historialCrias: historialCriasActualizado, // 🐄 ¡ACÁ GUARDAMOS TODAS LAS CRÍAS!
        tacto,
        paricion,
      };

      localStorage.setItem(clave, JSON.stringify(ficha));

      // Creación automática de la ficha de la cría
      let resCria = null;
      if (paricion && paricion.caravanaCria) {
        if (paricion.caravanaCria === caravana) {
          resCria = "conflicto";
        } else {
          const claveCria = `animal:${paricion.caravanaCria}`;
          let existenteCria = null;
          try {
            const r = localStorage.getItem(claveCria);
            existenteCria = r ? JSON.parse(r) : null;
          } catch (e) {
            existenteCria = null;
          }

          const puedeEscribir =
            !existenteCria || (existenteCria.esCria && existenteCria.cria?.caravanaMadre === caravana);

          if (puedeEscribir) {
            let padreCalculado = null;
            let origenCalculado = "Sin registrar";

            try {
              // 1. Leemos la ficha guardada de la madre
              const rawMadre = localStorage.getItem(`animal:${caravana}`);
              if (rawMadre) {
                const fichaMadre = JSON.parse(rawMadre);
                const fechaPartoStr = paricion.fecha; // 'YYYY-MM-DD'

                if (fechaPartoStr) {
                  const fParto = new Date(fechaPartoStr + "T00:00:00");
                  const historial = fichaMadre.historialServicios || [];

                  // Recorremos el historial desde el servicio más reciente al más antiguo
                  for (let i = historial.length - 1; i >= 0; i--) {
                    const s = historial[i];

                    // A) Evaluar Inseminación Artificial dentro de la nueva estructura
                    if (s.inseminacion && s.inseminacion.fecha) {
                      const fIA = new Date(s.inseminacion.fecha + "T00:00:00");
                      const diasIA = Math.round((fParto - fIA) / (1000 * 60 * 60 * 24));

                      // Ventana exacta de gestación por IA: 250 a 305 días (269 días entra perfecto acá)
                      if (diasIA >= 250 && diasIA <= 305) {
                        padreCalculado = s.inseminacion.nombre || "Toro IA (Sin Nombre)";
                        origenCalculado = "Inseminación Artificial";
                        break;
                      }

                      // Si nació después de los 305 días de la IA y en ese servicio había Toro de Repaso
                      if (diasIA > 305 && s.toro && s.toro.nombre) {
                        padreCalculado = s.toro.nombre;
                        origenCalculado = "Repaso con Toro";
                        break;
                      }
                    }

                    // B) Evaluar Servicio de Toro Directo / Repaso (si no hubo IA en ese registro)
                    if (s.toro && s.toro.fecha && !padreCalculado) {
                      const fToro = new Date(s.toro.fecha + "T00:00:00");
                      const diasToro = Math.round((fParto - fToro) / (1000 * 60 * 60 * 24));

                      if (diasToro >= 250 && diasToro <= 310) {
                        padreCalculado = s.toro.nombre || "Toro (Sin Nombre)";
                        origenCalculado = "Repaso con Toro";
                        break;
                      }
                    }
                  }

                  // 2. Respaldo por si los datos están en variables del formulario actual
                  if (!padreCalculado) {
                    if (typeof nombreInseminacion !== "undefined" && nombreInseminacion) {
                      padreCalculado = nombreInseminacion;
                      origenCalculado = "Inseminación Artificial";
                    } else if (typeof nombreToro !== "undefined" && nombreToro) {
                      padreCalculado = nombreToro;
                      origenCalculado = "Repaso con Toro";
                    }
                  }
                }
              }
            } catch (e) {
              console.error("Error buscando el padre de la cría:", e);
            }

            // 3. Creación de la ficha de la cría con los datos correctos
            const fichaCria = {
              caravana: paricion.caravanaCria,
              tipo: paricion.tipoCria === "Macho" ? "Ternero" : paricion.tipoCria === "Hembra" ? "Ternera" : null,
              raza: raza.trim() || null,
              fechaNacimiento: fechaNacimiento || null,
              observacionesAnimal: observacionesAnimal.trim() || null,
              esCria: true,
              fechaAlta: existenteCria?.fechaAlta || new Date().toISOString().slice(0, 10),
              fechaModificacion: existenteCria ? new Date().toISOString().slice(0, 10) : null,
              servicio: null,
              tacto: null,
              paricion: null,
              cria: {
                fechaNacimiento: paricion.fecha,
                sexo: paricion.tipoCria,
                pesoNacer: pesoNacer ? `${pesoNacer} kg` : null,
                caravanaMadre: caravana,
                nombrePadre: padreCalculado || "Sin registrar",
                origenServicio: origenCalculado,
                observaciones: observacionesCria.trim() || null,
              },
            };

            localStorage.setItem(claveCria, JSON.stringify(fichaCria));
            resCria = existenteCria ? "actualizada" : "creada";
          } else {
            resCria = "conflicto";
          }
        }
      }
      setResultadoCria(resCria);
      setHistorialCrias(historialCriasActualizado);

      setPantalla("guardado");
      setEstado("idle");
    } catch (e) {
      console.error("Error al guardar:", e);
      setEstado("error");
    }
  }, [
    listoParaGuardar,
    caravana,
    modo,
    tipo,
    raza,
    fechaNacimiento,
    caravanaMadreManual,
    nombrePadreManual,
    observacionesAnimal,
    muestraServicio,
    fechaInseminacion,
    nombreInseminacion,
    fechaToro,
    esRepasoToro,
    nombreToro,
    observacionesToro,
    calculos,
    fechaTacto,
    resultadoTacto,
    observaciones,
    fechaParicion,
    tipoCria,
    caravanaCria,
    observacionesParicion,
    observacionesCria,
    origenCria,
    nombrePadreActual,
    historialCrias,
    historialServicios,
    proximoServicioSugerido,
    fichaOriginal,
    enEdicion,
  ]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        boxSizing: "border-box",
        background: "var(--arena)",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "var(--marron-oscuro)",
      }}
    >
      <style>{ESTILOS_GLOBALES}</style>
      <Toast toast={toast} />
      <ChatBot />

      <div className="app-container">
        <MenuLateral
          abierto={menuAbierto}
          onAbrir={() => setMenuAbierto(true)}
          onCerrar={() => setMenuAbierto(false)}
          navegarA={(destino) => setPantalla(destino)}
          pantallaActual={pantalla}
        />

        <div
          className="contenido-principal"
          style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
        >
          {/* Header */}
          <div
            className="app-header"
            style={{
              background: "var(--verde-monte)",
              padding: "10px 16px 8px",
              borderBottom: "3px solid var(--marron-cuero)",
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            {/* Fila superior: Menú + Logo + Fecha y Hora */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

              {/* Botón 1: Solo las 3 rayitas para abrir/cerrar menú */}
              <button
                type="button"
                onClick={() => setMenuAbierto((abierto) => !abierto)}
                title="Abrir / Cerrar Menú"
                aria-label="Abrir menú de navegación"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "#FBF7ED",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <Menu size={20} />
              </button>

              {/* Botón 2: El Logo + Nombre AgroData para ir a INICIO */}
              <button
                type="button"
                onClick={() => setPantalla("inicio")}
                title="Ir a Inicio"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "#FBF7ED",
                  textAlign: "left",
                }}
              >
                <img
                  src="/hojalogo.png"
                  alt="AgroData"
                  style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                />
                <h1
                  style={{
                    fontFamily: "'PP Neue Montreal Bold', serif",
                    fontWeight: 700,
                    fontSize: 20,
                    color: "#FBF7ED",
                    margin: 0,
                    letterSpacing: 0.2,
                  }}
                >
                  AgroData
                </h1>
              </button>

              {/* LÍNEA SEPARADORA Y FECHA/HORA A LA IZQUIERDA */}
              <div style={{ width: "1px", height: "22px", background: "rgba(251, 247, 237, 0.3)", margin: "0 2px" }} />

              <div style={{ color: "#FBF7ED", fontSize: 11, lineHeight: 1.1, fontWeight: 500 }}>
                <div style={{ textTransform: "capitalize" }}>
                  {fechaHora.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" })}
                </div>
                <div style={{ opacity: 0.85, fontSize: 10 }}>
                  {fechaHora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs
                </div>
              </div>
            </div>

            {/* Fila inferior: Título dinámico de la pantalla actual */}
            <p style={{ margin: "2px 0 0 28px", color: "var(--crema)", fontSize: 15, fontWeight: 500 }}>
              {pantalla === "inicio" && "INICIO"}
              {pantalla === "buscar" && "BUSCAR ANIMAL"}
              {pantalla === "formulario" && (enEdicion ? "Editar ficha" : "Nueva ficha")}
              {pantalla === "guardado" && "Confirmación"}
              {pantalla === "listado" && "TODOS MIS ANIMALES"}
              {pantalla === "resumen" && "Ficha del animal"}
              {pantalla === "alertas" && "TAREAS PARA HOY"}
            </p>
          </div>

          {/* Contenido Principal */}
          <div
            style={{
              flex: 1,
              padding: "22px 16px 40px",
              maxWidth: 1000,
              width: "100%",
              margin: "0 auto",
              boxSizing: "border-box",
            }}
          >
            {pantalla === "inicio" && (
              <PantallaInicio onNavegar={(destino) => setPantalla(destino)} />
            )}
            {pantalla === "buscar" && (
              <PantallaBuscar
                caravanaBusqueda={caravanaBusqueda}
                setCaravanaBusqueda={(v) => {
                  setCaravanaBusqueda(v);
                  setResultadoBusqueda(null);
                  setFichaEncontrada(null);
                }}
                buscando={buscando}
                resultadoBusqueda={resultadoBusqueda}
                fichaEncontrada={fichaEncontrada}
                onBuscar={buscar}
                onEditar={irAEditar}
                onIngresar={irAIngresar}
                onVerTodos={irAListado}
              />
            )}

            {pantalla === "listado" && (
              <PantallaListado onVolver={volverDesdeListado} onVerFicha={irAVerResumen} />
            )}

            {pantalla === "resumen" && fichaEnResumen && (
              <PantallaResumen
                ficha={fichaEnResumen}
                onVolver={volverDesdeResumen}
                onEditar={irAEditarDesdeResumen}
              />
            )}

            {pantalla === "alertas" && (
              <PantallaAlertas
                onVolver={volverDesdeAlertas}
                onVerFicha={(f) => irAVerResumen(f, "alertas")}
              />
            )}

            {pantalla === "genealogia" && (
              <PantallaGenealogia
                onVolver={() => setPantalla("inicio")}
                onVerFicha={(f) => irAVerResumen(f, "genealogia")}
              />
            )}

            {pantalla === "sanidad" && (
              <PantallaSanidad />
            )}

            {pantalla === "estadisticas" && (
              <PantallaEstadisticas onVolver={() => setPantalla("inicio")} />
            )}

            {pantalla === "formulario" && (
              <PantallaFormulario
                caravana={caravana}
                modo={modo}
                historialServicios={historialServicios}
                setHistorialServicios={setHistorialServicios}
                historialCrias={historialCrias}
                setHistorialCrias={setHistorialCrias}
                onVolver={volverABuscar}
                tipo={tipo}
                raza={raza}
                setRaza={setRaza}
                fechaNacimiento={fechaNacimiento}
                setFechaNacimiento={setFechaNacimiento}
                caravanaMadreManual={caravanaMadreManual}
                setCaravanaMadreManual={setCaravanaMadreManual}
                nombrePadreManual={nombrePadreManual}
                setNombrePadreManual={setNombrePadreManual}
                observacionesAnimal={observacionesAnimal}
                setObservacionesAnimal={setObservacionesAnimal}
                setTipo={setTipo}
                muestraServicio={muestraServicio}
                fechaInseminacion={fechaInseminacion}
                setFechaInseminacion={setFechaInseminacion}
                nombreInseminacion={nombreInseminacion}
                setNombreInseminacion={setNombreInseminacion}
                fechaToro={fechaToro}
                setFechaToro={setFechaToro}
                esRepasoToro={esRepasoToro}
                setEsRepasoToro={setEsRepasoToro}
                nombreToro={nombreToro}
                setNombreToro={setNombreToro}
                observacionesToro={observacionesToro}
                setObservacionesToro={setObservacionesToro}
                calculos={calculos}
                nombrePadreActual={nombrePadreActual}
                fechaTacto={fechaTacto}
                setFechaTacto={setFechaTacto}
                resultadoTacto={resultadoTacto}
                seleccionarTacto={seleccionarTacto}
                observaciones={observaciones}
                setObservaciones={setObservaciones}
                fechaParicion={fechaParicion}
                setFechaParicion={setFechaParicion}
                tipoCria={tipoCria}
                pesoNacer={pesoNacer}
                setPesoNacer={setPesoNacer}
                seleccionarTipoCria={seleccionarTipoCria}
                caravanaCria={caravanaCria}
                setCaravanaCria={setCaravanaCria}
                observacionesParicion={observacionesParicion}
                setObservacionesParicion={setObservacionesParicion}
                proximoServicioSugerido={proximoServicioSugerido}
                observacionesCria={observacionesCria}
                setObservacionesCria={setObservacionesCria}
                origenCria={origenCria}
                estado={estado}
                listoParaGuardar={listoParaGuardar}
                onGuardar={guardar}
              />
            )}


            {pantalla === "guardado" && (
              <FichaGuardada
                caravana={caravana}
                tipo={tipo}
                modo={modo}
                servicio={
                  muestraServicio
                    ? {
                      inseminacion:
                        fechaInseminacion.trim() || nombreInseminacion.trim()
                          ? {
                            fecha: fechaInseminacion.trim() || null,
                            nombre: nombreInseminacion.trim() || null,
                            calculos,
                          }
                          : null,
                      toro:
                        fechaToro.trim() || nombreToro.trim() || observacionesToro.trim()
                          ? {
                            fecha: fechaToro.trim() || null,
                            nombre: nombreToro.trim() || null,
                            esRepasoToro,
                            observaciones: observacionesToro.trim() || null,
                          }
                          : null,
                    }
                    : null
                }
                tacto={
                  muestraServicio && (fechaTacto.trim() || resultadoTacto || observaciones.trim())
                    ? {
                      fecha: fechaTacto.trim() || null,
                      resultado: resultadoTacto,
                      observaciones: observaciones.trim() || null,
                    }
                    : null
                }
                paricion={
                  muestraServicio &&
                    (fechaParicion.trim() || tipoCria || caravanaCria.trim() || observacionesParicion.trim())
                    ? {
                      fecha: fechaParicion.trim() || null,
                      tipoCria,
                      caravanaCria: caravanaCria.trim() || null,
                      pesoNacer: pesoNacer ? `${pesoNacer} kg` : null,
                      proximoServicioSugerido: fechaParicion.trim() ? proximoServicioSugerido : null,
                      observaciones: observacionesParicion.trim() || null,
                      nombrePadre: nombrePadreActual.trim() || null,
                      origenCria,
                    }
                    : null
                }
                resultadoCria={resultadoCria}
                onBuscarOtra={volverABuscar}
              />
            )}

            {pantalla !== "guardado" && (
              <p style={{ fontSize: 11.5, color: "#8A7A63", textAlign: "center", marginTop: 18 }}>
                Los datos se guardan tal como los cargás. Nada se completa automáticamente.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Pantalla 0: Inicio (dashboard con KPIs)                           */
/* ---------------------------------------------------------------- */

function PantallaInicio({ onNavegar }) {
  const [animales, setAnimales] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setAnimales(leerTodosLosAnimalesGuardados());
    setCargando(false);
    const recargar = () => setAnimales(leerTodosLosAnimalesGuardados());
    window.addEventListener("agrodata:actualizado", recargar);
    return () => window.removeEventListener("agrodata:actualizado", recargar);
  }, []);

  // Conteo por estado reproductivo (Preñada / Vacía / Parida)
  const conteoEstados = useMemo(() => {
    const conteo = { Preñada: 0, Vacía: 0, Parida: 0 };
    animales.forEach((a) => {
      const estado = estadoReproductivoDe(a);
      if (estado && conteo[estado.texto] !== undefined) {
        conteo[estado.texto] += 1;
      }
    });
    return conteo;
  }, [animales]);

  // Cálculo de Próximos Partos estimados en los próximos 30 días
  const proximosPartosCount = useMemo(() => {
    const hoy = new Date();
    const dentroDe30Dias = new Date();
    dentroDe30Dias.setDate(hoy.getDate() + 30);

    return animales.filter((a) => {
      if (!a.fechaInseminacion) return false;
      const fechaBase = parseISO(a.fechaInseminacion);
      if (!fechaBase) return false;

      // Estimación estándar a 280 días
      const fechaPartoEstimada = new Date(fechaBase);
      fechaPartoEstimada.setDate(fechaPartoEstimada.getDate() + 280);

      return fechaPartoEstimada >= hoy && fechaPartoEstimada <= dentroDe30Dias;
    }).length;
  }, [animales]);

  // Conteo por categoría (Vaca, Toro, etc.)
  const conteoPorCategoria = useMemo(() => {
    const conteo = {};
    animales.forEach((a) => {
      if (!a.tipo) return;
      conteo[a.tipo] = (conteo[a.tipo] || 0) + 1;
    });
    return conteo;
  }, [animales]);

  // Total de alertas pendientes
  const totalAlertas = useMemo(() => {
    const hoy = new Date();
    let total = 0;
    animales.forEach((ficha) => {
      total += obtenerAlertasDe(ficha, hoy).length;
    });
    total += leerTareasManuales().filter((t) => !t.completada).length;
    return total;
  }, [animales]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      

            {window.Notification && Notification.permission === "default" && (
        <button
          type="button"
          onClick={() => Notification.requestPermission()}
          style={{
            textAlign: "left",
            background: "#FFFDF8",
            border: "1px dashed var(--verde-salvia)",
            borderRadius: 12,
            padding: "12px 14px",
            cursor: "pointer",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--verde-monte)",
          }}
        >
          🔔 Activar avisos en el celular
        </button>
      )}

      {/* 1. Tarjeta grande de alertas */}
      <button
        type="button"
        onClick={() => onNavegar("alertas")}
        style={{
          textAlign: "left",
          background: totalAlertas > 0 ? "var(--terracota)" : "var(--verde-exito)",
          border: "none",
          borderRadius: 16,
          padding: "20px 18px",
          cursor: "pointer",
          color: "#FBF7ED",
          boxShadow: "0 2px 10px rgba(59,42,29,0.10)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CalendarClock size={26} />
          <div>
            <div style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontWeight: 700, fontSize: 26 }}>
              {cargando ? "..." : totalAlertas}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.95 }}>
              {totalAlertas === 0 ? "Todo al día, no hay pendientes" : "Animales necesitan atención hoy"}
            </div>
          </div>
        </div>
      </button>

      {/* 2. KPIs de estado reproductivo y de rodeo */}
      <div
        style={{
          background: "var(--crema)",
          border: "1px solid var(--borde)",
          borderRadius: 16,
          padding: "18px",
          boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
        }}
      >
        <h3
          style={{
            fontFamily: "'PP Neue Montreal Bold', serif",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--marron-oscuro)",
            margin: "0 0 12px",
          }}
        >
          Estado del rodeo
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <TarjetaKPI numero={cargando ? "..." : animales.length} etiqueta="Total rodeo" color="var(--verde-monte)" />
          <TarjetaKPI numero={cargando ? "..." : conteoEstados.Preñada} etiqueta="Preñadas" color="var(--verde-exito)" />
          <TarjetaKPI numero={cargando ? "..." : conteoEstados.Vacía} etiqueta="Vacías" color="var(--terracota)" />
          <TarjetaKPI numero={cargando ? "..." : proximosPartosCount} etiqueta="Partos (30d)" color="var(--marron-cuero)" />
        </div>
      </div>

      {/* 3. Categorías */}
      {Object.keys(conteoPorCategoria).length > 0 && (
        <div
          style={{
            background: "var(--crema)",
            border: "1px solid var(--borde)",
            borderRadius: 16,
            padding: "18px",
            boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
          }}
        >
          <h3
            style={{
              fontFamily: "'PP Neue Montreal Bold', serif",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--marron-oscuro)",
              margin: "0 0 12px",
            }}
          >
            Por categoría
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {TIPOS.map((t) => {
              const cantidad = conteoPorCategoria[t.valor] || 0;
              if (cantidad === 0) return null;
              return (
                <span
                  key={t.valor}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 999,
                    background: "#F5F2EC",
                    color: "var(--marron-oscuro)",
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {t.valor}: {cantidad}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Accesos rápidos de Acción Directa */}
      <div
        style={{
          background: "var(--crema)",
          border: "1px solid var(--borde)",
          borderRadius: 16,
          padding: "18px",
          boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <h3
          style={{
            fontFamily: "'PP Neue Montreal Bold', serif",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--marron-oscuro)",
            margin: "0 0 4px",
          }}
        >
          Acciones rápidas
        </h3>

        {/* Botón principal adaptado a "Cargar animal/Evento" */}
        <button
          type="button"
          onClick={() => onNavegar("buscar")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            width: "100%",
            padding: "14px 16px",
            borderRadius: 12,
            border: "none",
            background: "var(--verde-monte)",
            color: "#FBF7ED",
            fontFamily: "'PP Neue Montreal Bold', serif",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(62,78,47,0.25)",
          }}
        >
          <PlusCircle size={20} />
          Cargar animal - Evento
        </button>

        {/* Reemplazado "Buscar animal" por "Sanidad" */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <BotonAcceso texto="Sanidad" icono={<Syringe size={17} />} onClick={() => onNavegar("sanidad")} />
          <BotonAcceso texto="Mis animales" icono={<List size={17} />} onClick={() => onNavegar("listado")} />
        </div>
      </div>

      {/* 5. Módulo de Sanidad (Placeholder) */}
      <div
        style={{
          background: "#F5F2EC",
          border: "1px dashed var(--borde)",
          borderRadius: 16,
          padding: "18px",
          opacity: 0.85,
        }}
      >
        <h3
          style={{
            fontFamily: "'PP Neue Montreal Bold', serif",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--marron-oscuro)",
            margin: "0 0 4px",
          }}
        >
          🩺 Sanidad y Vacunación
        </h3>
        <p style={{ fontSize: 12.5, color: "#8A7A63", margin: 0 }}>
          Próximamente vas a ver acá las vacunas y tratamientos pendientes del mes.
        </p>
      </div>

    </div>
  );
}

function PantallaEstadisticas({ onVolver }) {
  const [animales, setAnimales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [anioSel, setAnioSel] = useState(null);

  useEffect(() => {
    const lista = leerTodosLosAnimalesGuardados();
    setAnimales(lista);
    const anios = obtenerAniosConDatos(lista);
    setAnioSel(anios[0] || String(new Date().getFullYear()));
    setCargando(false);
  }, []);

  const aniosDisponibles = useMemo(() => obtenerAniosConDatos(animales), [animales]);
  const stats = useMemo(() => calcularEstadisticasReproductivas(animales, anioSel), [animales, anioSel]);

  const COLORES = ["#3E4E2F", "#8B5A2B", "#8A9A6B", "#A8452F", "#714823", "#4F6B3A"];

  return (
    <div style={{ background: "var(--crema)", border: "1px solid var(--borde)", borderRadius: 16, padding: "22px 18px", boxShadow: "0 2px 10px rgba(59,42,29,0.06)" }}>
      <button type="button" onClick={onVolver} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "var(--marron-cuero-oscuro)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={14} /> Volver
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontSize: 18, fontWeight: 600, color: "var(--marron-oscuro)", margin: 0 }}>
          Resumen reproductivo
        </h2>
        {aniosDisponibles.length > 0 && (
          <select
            value={anioSel || ""}
            onChange={(e) => setAnioSel(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 10, border: "2px solid var(--borde)", background: "#FFFDF8", fontSize: 13.5, fontWeight: 600, color: "var(--marron-oscuro)" }}
          >
            {aniosDisponibles.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}
      </div>

      {cargando ? (
        <p style={{ fontSize: 13, color: "#8A7A63", textAlign: "center" }}>Cargando...</p>
      ) : animales.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "#8A7A63", textAlign: "center" }}>
          Todavía no hay animales cargados para mostrar estadísticas.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 24 }}>
            <TarjetaKPI numero={stats.totalHembras} etiqueta="Hembras en servicio" color="var(--verde-monte)" />
            <TarjetaKPI numero={stats.preñadas} etiqueta="Preñadas" color="var(--verde-exito)" />
            <TarjetaKPI numero={stats.vacias} etiqueta="Vacías" color="var(--terracota)" />
            <TarjetaKPI numero={stats.totalNacimientos} etiqueta={`Nacimientos ${anioSel || ""}`} color="var(--marron-cuero)" />
          </div>

          <div style={{ background: "#FFFDF8", border: "1px solid var(--borde)", borderRadius: 14, padding: 16, marginBottom: 18 }}>
            <h3 style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontSize: 14.5, fontWeight: 600, color: "var(--marron-oscuro)", margin: "0 0 12px" }}>
              Nacimientos por mes {anioSel ? `(${anioSel})` : ""}
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.nacimientosPorMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DCCB" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="cantidad" stroke="#3E4E2F" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grilla-formulario" style={{ gap: 16 }}>
            <div style={{ background: "#FFFDF8", border: "1px solid var(--borde)", borderRadius: 14, padding: 16 }}>
              <h3 style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontSize: 14.5, fontWeight: 600, color: "var(--marron-oscuro)", margin: "0 0 12px" }}>
                Crías por sexo
              </h3>
              {stats.porSexo.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "#8A7A63", fontStyle: "italic" }}>Sin datos para este año.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={stats.porSexo} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                      {stats.porSexo.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORES[index % COLORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ background: "#FFFDF8", border: "1px solid var(--borde)", borderRadius: 14, padding: 16 }}>
              <h3 style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontSize: 14.5, fontWeight: 600, color: "var(--marron-oscuro)", margin: "0 0 12px" }}>
                Crías por padre / servicio
              </h3>
              {stats.porServicio.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "#8A7A63", fontStyle: "italic" }}>Sin datos para este año.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.porServicio} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2DCCB" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="cantidad" fill="#8B5A2B" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TarjetaKPI({ numero, etiqueta, color }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        textAlign: "center",
        padding: "16px 6px",
        background: "#F5F3EE",
        borderRadius: 12,
        border: "1px solid var(--borde)",
        borderTop: `3px solid ${color}`,
      }}
    >
      <div style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontWeight: 700, fontSize: 22, color, lineHeight: 1 }}>
        {numero}
      </div>
      <div style={{ fontSize: 10, color: "#8A7A63", fontWeight: 600, lineHeight: 1.2 }}>{etiqueta}</div>
    </div>
  );
}

function BotonAcceso({ texto, icono, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "14px 16px",
        borderRadius: 12,
        border: "2px solid var(--verde-monte)",
        background: "var(--crema)",
        color: "var(--verde-monte)",
        fontFamily: "'PP Neue Montreal Bold', serif",
        fontWeight: 600,
        fontSize: 14.5,
        cursor: "pointer",
      }}
    >
      {icono}
      {texto}
    </button>
  );
}

/* ---------------------------------------------------------------- */
/* Pantalla 1: Buscar caravana                                       */
/* ---------------------------------------------------------------- */

function PantallaBuscar({
  caravanaBusqueda,
  setCaravanaBusqueda,
  buscando,
  resultadoBusqueda,
  fichaEncontrada,
  onBuscar,
  onEditar,
  onIngresar,
  onVerTodos,
}) {
  return (
    <div
      style={{
        background: "var(--crema)",
        border: "1px solid var(--borde)",
        borderRadius: 16,
        padding: "22px 18px",
        boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
      }}
    >
      <label
        htmlFor="caravana-busqueda"
        style={{
          display: "block",
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontWeight: 600,
          fontSize: 16,
          marginBottom: 8,
          color: "var(--marron-oscuro)",
        }}
      >
        Número de caravana
      </label>

      <div style={{ position: "relative", marginBottom: 14 }}>
        <div
          style={{
            position: "absolute",
            top: -8,
            left: 20,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "var(--arena)",
            border: "2px solid var(--borde)",
            zIndex: 2,
          }}
        />
        <input
          id="caravana-busqueda"
          type="text"
          autoComplete="off"
          placeholder="Ej: M102"
          value={caravanaBusqueda}
          onChange={(e) => setCaravanaBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onBuscar();
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: "'PP Neue Montreal Bold', serif",
            fontSize: 28,
            fontWeight: 600,
            padding: "18px 16px",
            borderRadius: 12,
            border: "2px solid var(--borde)",
            background: "#FFFDF8",
            color: "var(--marron-oscuro)",
            textAlign: "center",
            letterSpacing: 1,
          }}
        />

        {/* Mensaje de advertencia para el usuario */}
        <p style={{
          fontSize: "13px",
          color: "#8B5A2B",
          marginTop: "6px",
          fontWeight: "bold"
        }}>
          ⚠️ Importante: El sistema respeta mayúsculas y minúsculas. (No es lo mismo A016 que a016).
        </p>
      </div>

      <button
        type="button"
        className="btn-principal"
        disabled={caravanaBusqueda.trim().length === 0 || buscando}
        onClick={onBuscar}
        style={{
          width: "100%",
          padding: "15px",
          borderRadius: 12,
          border: "none",
          background: "var(--verde-monte)",
          color: "#FBF7ED",
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontWeight: 600,
          fontSize: 16,
          cursor: caravanaBusqueda.trim().length ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {buscando ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Buscando...
          </>
        ) : (
          <>
            <Search size={17} />
            Buscar
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onVerTodos}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "13px",
          borderRadius: 12,
          border: "2px solid var(--verde-monte)",
          background: "transparent",
          color: "var(--verde-monte)",
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontWeight: 600,
          fontSize: 15,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <List size={17} />
        Ver todos los animales
      </button>

      {resultadoBusqueda === "existe" && fichaEncontrada && (
        <div
          style={{
            marginTop: 18,
            background: "#EFEBDD",
            border: "1px solid var(--verde-salvia)",
            borderRadius: 12,
            padding: "16px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 12px", fontSize: 16, fontWeight: "bold", color: "var(--marron-oscuro)" }}>
            ✅ Caravana registrada: N° {fichaEncontrada.caravana} · {fichaEncontrada.tipo}
          </p>

          <button
            type="button"
            onClick={onEditar}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 10,
              border: "none",
              background: "var(--verde-monte)",
              color: "#FBF7ED",
              fontFamily: "'PP Neue Montreal Bold', serif",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Ver / Editar Ficha
          </button>
        </div>
      )}


      {resultadoBusqueda === "no_existe" && (
        <div
          style={{
            marginTop: 18,
            background: "#F6EFE0",
            border: "1px solid var(--marron-cuero)",
            borderRadius: 12,
            padding: "16px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--marron-oscuro)", lineHeight: 1.4 }}>
            No hay ninguna ficha con la caravana <strong>{caravanaBusqueda.trim()}</strong>.
          </p>
          <button
            type="button"
            onClick={onIngresar}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 10,
              border: "none",
              background: "var(--marron-cuero)",
              color: "#FBF7ED",
              fontFamily: "'PP Neue Montreal Bold', serif",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Ingresar ficha
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Pantalla "Listado": todos los animales guardados                  */
/* ---------------------------------------------------------------- */

// Recorre localStorage y arma la lista de todas las fichas guardadas
// bajo la clave "animal:<caravana>". Si una ficha está corrupta, se
// ignora en vez de romper el listado completo.
function leerTodosLosAnimalesGuardados() {
  const animales = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (!clave || !clave.startsWith("animal:")) continue;
      try {
        const raw = localStorage.getItem(clave);
        const ficha = raw ? JSON.parse(raw) : null;
        if (ficha && ficha.caravana) {
          animales.push(ficha);
        }
      } catch (e) {
        // ficha corrupta: se omite
      }
    }
  } catch (e) {
    // localStorage no disponible
  }
  return animales;
}

// Devuelve { texto, color, colorTexto } para la etiqueta de estado
// reproductivo de un animal, en base a su último tacto registrado.
function estadoReproductivoDe(ficha) {
  if (ficha.esCria) return null; // las crías no tienen estado reproductivo propio
  if (!APLICA_SERVICIO.includes(ficha.tipo)) return null; // solo aplica a hembras en servicio

  // Ya parió: o tiene el campo "parición" cargado, o ya tiene al menos
  // una cría en su historial (el botón rápido de "agregar cría" no
  // siempre actualiza el campo "parición" de la madre, así que se
  // chequean las dos fuentes para no perder el dato).
  const yaParida =
    (ficha.paricion && ficha.paricion.fecha) ||
    (Array.isArray(ficha.historialCrias) && ficha.historialCrias.length > 0);

  if (yaParida) {
    return { texto: "Parida", fondo: "var(--marron-cuero)", color: "#FBF7ED" };
  }

  if (ficha.tacto && ficha.tacto.resultado === "Preniada") {
    return { texto: "Preñada", fondo: "var(--verde-exito)", color: "#FBF7ED" };
  }
  if (ficha.tacto && ficha.tacto.resultado === "Vacia") {
    return { texto: "Vacía", fondo: "var(--terracota)", color: "#FBF7ED" };
  }
  return { texto: "Vacía", fondo: "var(--terracota)", color: "#FBF7ED" };
}


const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Recorre todos los animales guardados y arma los datos agregados para el
// dashboard. Solo usa datos que ya están cargados (historialCrias, tacto),
// nunca estima ni inventa. Si se pasa un año, filtra las crías de ese año;
// si no, toma todas.
function calcularEstadisticasReproductivas(animales, anioFiltro) {
  const nacimientosPorMes = MESES_CORTOS.map((mes) => ({ mes, cantidad: 0 }));
  const conteoSexo = { Macho: 0, Hembra: 0 };
  const conteoPorPadre = {};
  let totalNacimientos = 0;

  animales.forEach((ficha) => {
    if (!Array.isArray(ficha.historialCrias)) return;
    ficha.historialCrias.forEach((cria) => {
      if (!cria.fechaNacimiento) return;
      const partes = cria.fechaNacimiento.split("-");
      if (partes.length !== 3) return;
      const [anio, mes] = partes;
      if (anioFiltro && anio !== String(anioFiltro)) return;

      const mesIndice = Number(mes) - 1;
      if (mesIndice >= 0 && mesIndice < 12) {
        nacimientosPorMes[mesIndice].cantidad += 1;
      }
      totalNacimientos += 1;

      if (cria.sexo === "Macho") conteoSexo.Macho += 1;
      else if (cria.sexo === "Hembra") conteoSexo.Hembra += 1;

      const padre = cria.nombrePadre && cria.nombrePadre !== "Sin registrar" ? cria.nombrePadre : null;
      if (padre) conteoPorPadre[padre] = (conteoPorPadre[padre] || 0) + 1;
    });
  });

  const porSexo = [
    { name: "Macho", value: conteoSexo.Macho },
    { name: "Hembra", value: conteoSexo.Hembra },
  ].filter((s) => s.value > 0);

  const porServicio = Object.entries(conteoPorPadre)
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 6);

  // Estado reproductivo actual del rodeo (foto de hoy, no depende del año filtrado)
  let preñadas = 0, vacias = 0, paridas = 0, totalHembras = 0;
  animales.forEach((ficha) => {
    const estado = estadoReproductivoDe(ficha);
    if (!estado) return;
    totalHembras += 1;
    if (estado.texto === "Preñada") preñadas += 1;
    else if (estado.texto === "Vacía") vacias += 1;
    else if (estado.texto === "Parida") paridas += 1;
  });

  return { totalHembras, preñadas, vacias, paridas, totalNacimientos, nacimientosPorMes, porSexo, porServicio };
}

// Junta todos los años que aparecen en las fechas de nacimiento de crías,
// para armar el selector de año del dashboard.
function obtenerAniosConDatos(animales) {
  const anios = new Set();
  animales.forEach((ficha) => {
    if (!Array.isArray(ficha.historialCrias)) return;
    ficha.historialCrias.forEach((c) => {
      if (c.fechaNacimiento) {
        const anio = c.fechaNacimiento.split("-")[0];
        if (anio) anios.add(anio);
      }
    });
  });
  return Array.from(anios).sort((a, b) => b.localeCompare(a));
}

// Lee una ficha guardada por su número de caravana. Devuelve null si no existe
// o si el dato está corrupto, sin romper el resto de la pantalla.
function leerAnimalPorCaravana(caravana) {
  if (!caravana) return null;
  try {
    const raw = localStorage.getItem(`animal:${caravana}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Arma el árbol genealógico subiendo por el lado de la madre (porque es el
// único dato que permite encadenar una ficha con otra). El padre se muestra
// como dato final de cada generación, tal cual está cargado, sin inventar
// ni buscar una ficha propia para él.
// "visitados" evita loops infinitos si alguna ficha quedó mal cargada
// apuntando en círculo a sí misma.
function construirArbolGenealogico(caravanaInicial, profundidadMax = 4, visitados = new Set()) {
  if (!caravanaInicial || visitados.has(caravanaInicial)) return null;
  visitados.add(caravanaInicial);

  const ficha = leerAnimalPorCaravana(caravanaInicial);
  if (!ficha) {
    return { caravana: caravanaInicial, encontrada: false };
  }

  const caravanaMadre = ficha.caravanaMadre || ficha.cria?.caravanaMadre || null;
  const nombrePadre = ficha.nombrePadre || ficha.cria?.nombrePadre || null;
  const crias = Array.isArray(ficha.historialCrias) ? ficha.historialCrias : [];

  const nodoMadre =
    caravanaMadre && profundidadMax > 0
      ? construirArbolGenealogico(caravanaMadre, profundidadMax - 1, visitados)
      : null;

  return {
    caravana: ficha.caravana,
    tipo: ficha.tipo || null,
    encontrada: true,
    nombrePadre,
    madre: nodoMadre,
    crias,
  };
}

// Convierte la cadena de madres (nodo que apunta a "madre" una y otra vez)
// en una lista plana, ordenada del ancestro más lejano al animal buscado.
// Sirve para dibujarla como una fila horizontal tipo cuadro de ascendencia.
function aplanarAscendencia(nodo) {
  const cadena = [];
  let actual = nodo;
  while (actual) {
    cadena.push({
      caravana: actual.caravana,
      tipo: actual.tipo,
      encontrada: actual.encontrada,
      nombrePadre: actual.nombrePadre,
    });
    actual = actual.madre;
  }
  return cadena.reverse();
}

// Etiqueta de parentesco según la distancia a la caravana buscada
// (0 = la buscada, 1 = madre, 2 = abuela, 3 = bisabuela...)
function etiquetaGeneracion(distancia) {
  if (distancia === 0) return "Buscado";
  if (distancia === 1) return "Madre";
  if (distancia === 2) return "Abuela";
  if (distancia === 3) return "Bisabuela";
  return `Ancestro (${distancia}ª gen.)`;
}

// Diferencia en días entre una fecha (objeto Date) y hoy.
// Positivo = la fecha es futura. Negativo = la fecha ya pasó.
function diasEntre(fecha, hoy) {
  if (!fecha) return null;
  const base = hoy || new Date();
  const soloHoy = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const soloFecha = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return Math.round((soloFecha - soloHoy) / 86400000);
}

// Tareas cargadas a mano por el usuario (no las calcula la app).
// Se guardan todas juntas bajo una sola clave en el almacenamiento local.
const CLAVE_TAREAS_MANUALES = "tareasManuales";

// Función para leer las tareas guardadas
function leerTareasManuales() {
  try {
    const data = localStorage.getItem("agrodata_tareas_manuales");
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

// Función para guardar una nueva tarea
function guardarTareaManual(nuevaTarea) {
  try {
    const actuales = leerTareasManuales();
    const actualizadas = [...actuales, nuevaTarea];
    localStorage.setItem("agrodata_tareas_manuales", JSON.stringify(actualizadas));
  } catch (e) {
    console.error("Error al guardar la tarea:", e);
  }
}

// Convierte un objeto Date de JavaScript a texto "YYYY-MM-DD",
// para poder comparar fechas del calendario con fechas guardadas.
function fechaAISO(date) {
  if (!date) return null;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Arma la lista de alertas de un animal (parto próximo, tacto pendiente,
// servicio sugerido). Todo se calcula a partir de fechas que ya están
// cargadas en la ficha — no se inventa ningún dato nuevo, solo se hace
// la misma cuenta de días que ya usa el resto de la app (260-300 días
// de gestación, 40 días para el próximo servicio).
function obtenerAlertasDe(ficha, hoy) {
  const alertas = [];
  if (ficha.esCria) return alertas;
  if (!APLICA_SERVICIO.includes(ficha.tipo)) return alertas;

  const yaParida =
    (ficha.paricion && ficha.paricion.fecha) ||
    (Array.isArray(ficha.historialCrias) && ficha.historialCrias.length > 0);

  const ultimoServicio =
    Array.isArray(ficha.historialServicios) && ficha.historialServicios.length > 0
      ? ficha.historialServicios[ficha.historialServicios.length - 1]
      : ficha.servicio || null;

  const fechaUltimoServicio =
    ultimoServicio?.inseminacion?.fecha || ultimoServicio?.toro?.fecha || null;

  if (!yaParida && fechaUltimoServicio) {
    // Parto próximo: la ventana de 260 a 300 días desde el servicio
    // arranca dentro de los próximos 21 días.
    const inicioVentana = sumarDiasISO(fechaUltimoServicio, 260);
    const finVentana = sumarDiasISO(fechaUltimoServicio, 300);
    const diasHastaInicio = diasEntre(inicioVentana, hoy);
    const diasHastaFin = diasEntre(finVentana, hoy);

    if (diasHastaInicio !== null && diasHastaFin !== null && diasHastaInicio <= 21 && diasHastaFin >= -15) {
      alertas.push({
        tipo: "parto",
        etiqueta: diasHastaInicio <= 0 ? "Puede parir en cualquier momento" : `Parto probable en ~${diasHastaInicio} días`,
        orden: diasHastaInicio,
        fecha: inicioVentana,
      });
    }

    // Tacto pendiente: el último servicio fue hace 30 días o más y
    // todavía no hay un tacto cargado posterior a esa fecha.
    const diasDesdeServicio = -diasEntre(parseISO(fechaUltimoServicio), hoy);
    const tactoEsPosterior = ficha.tacto?.fecha && ficha.tacto.fecha >= fechaUltimoServicio;
    if (diasDesdeServicio !== null && diasDesdeServicio >= 30 && !tactoEsPosterior) {
      alertas.push({
        tipo: "tacto",
        etiqueta: `Servicio hace ${diasDesdeServicio} días, sin tacto registrado`,
        orden: -diasDesdeServicio,
        fecha: hoy,
      });
    }
  }

  if (yaParida && ficha.paricion?.fecha) {
    // Próximo servicio sugerido: 40 días después del parto, si ya
    // llegó o está por llegar y todavía no hay un servicio más nuevo.
    const fechaSugerida = sumarDiasISO(ficha.paricion.fecha, 40);
    const diasHastaServicio = diasEntre(fechaSugerida, hoy);
    const yaTieneServicioNuevo = fechaUltimoServicio && fechaUltimoServicio > ficha.paricion.fecha;
    if (!yaTieneServicioNuevo && diasHastaServicio !== null && diasHastaServicio <= 14) {
      alertas.push({
        tipo: "servicio",
        etiqueta: diasHastaServicio <= 0 ? "Servicio sugerido: ya está en fecha" : `Servicio sugerido en ~${diasHastaServicio} días`,
        orden: diasHastaServicio,
        fecha: fechaSugerida,
      });
    }
  }

  return alertas;
}

function EtiquetaEstado({ estado }) {
  if (!estado) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "4px 9px",
        borderRadius: 999,
        background: estado.fondo,
        color: estado.color,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {estado.texto}
    </span>
  );
}

function PantallaListado({ onVolver, onVerFicha }) {
  const [animales, setAnimales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState(null);

    useEffect(() => {
    setAnimales(leerTodosLosAnimalesGuardados());
    setCargando(false);
    const recargar = () => setAnimales(leerTodosLosAnimalesGuardados());
    window.addEventListener("agrodata:actualizado", recargar);
    return () => window.removeEventListener("agrodata:actualizado", recargar);
  }, []);

  const categoriasPresentes = useMemo(() => {
    const presentes = new Set(animales.map((a) => a.tipo).filter(Boolean));
    return TIPOS.map((t) => t.valor).filter((v) => presentes.has(v));
  }, [animales]);

  const conteoPorCategoria = useMemo(() => {
    const conteo = {};
    animales.forEach((a) => {
      if (!a.tipo) return;
      conteo[a.tipo] = (conteo[a.tipo] || 0) + 1;
    });
    return conteo;
  }, [animales]);

  const animalesFiltrados = useMemo(() => {
    let lista = animales;
    if (categoriaFiltro) {
      lista = lista.filter((a) => a.tipo === categoriaFiltro);
    }
    const texto = busqueda.trim().toLowerCase();
    if (texto) {
      lista = lista.filter((a) => (a.caravana || "").toLowerCase().includes(texto));
    }
    return [...lista].sort((a, b) => (a.caravana || "").localeCompare(b.caravana || ""));
  }, [animales, busqueda, categoriaFiltro]);

  const eliminarAnimalDelListado = (caravanaABorrar) => {
    if (!window.confirm(`¿Estás segura de eliminar la ficha N° ${caravanaABorrar}? Esta acción no se puede deshacer.`)) return;

    try {
      localStorage.removeItem(`animal:${caravanaABorrar}`);
      setAnimales((prev) => prev.filter((a) => a.caravana !== caravanaABorrar));
    } catch (e) {
      alert("No se pudo eliminar la ficha.");
    }
  };

  return (
    <div
      style={{
        background: "var(--crema)",
        border: "1px solid var(--borde)",
        borderRadius: 16,
        padding: "22px 18px",
        boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
      }}
    >
      <button
        type="button"
        onClick={onVolver}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          color: "var(--marron-cuero-oscuro)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} /> Volver a buscar
      </button>

      <h2
        style={{
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontSize: 18,
          fontWeight: 600,
          color: "var(--marron-oscuro)",
          margin: "0 0 14px",
        }}
      >
        Todos los animales {animales.length > 0 && `(${animales.length})`}
      </h2>

      {/* Buscador por caravana */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Filtrar por número de caravana"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            padding: "12px 38px 12px 14px",
            borderRadius: 10,
            border: "2px solid var(--borde)",
            background: "#FFFDF8",
            color: "var(--marron-oscuro)",
          }}
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda("")}
            aria-label="Limpiar búsqueda"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "#8A7A63",
              cursor: "pointer",
              padding: 4,
              display: "flex",
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filtros por categoría */}
      {categoriasPresentes.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setCategoriaFiltro(null)}
            style={{
              padding: "7px 12px",
              borderRadius: 999,
              border: categoriaFiltro === null ? "2px solid var(--verde-monte)" : "2px solid var(--borde)",
              background: categoriaFiltro === null ? "var(--verde-monte)" : "#FFFDF8",
              color: categoriaFiltro === null ? "#FBF7ED" : "var(--marron-oscuroº)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Todas ({animales.length})
          </button>
          {categoriasPresentes.map((cat) => {
            const activo = categoriaFiltro === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoriaFiltro(activo ? null : cat)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 999,
                  border: activo ? "2px solid var(--verde-monte)" : "2px solid var(--borde)",
                  background: activo ? "var(--verde-monte)" : "#FFFDF8",
                  color: activo ? "#FBF7ED" : "var(--marron-oscuro)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {cat} ({conteoPorCategoria[cat] || 0})
              </button>
            );
          })}
        </div>
      )}

      {/* Lista de animales */}
      {cargando ? (
        <p style={{ fontSize: 13, color: "#8A7A63", textAlign: "center" }}>Cargando...</p>
      ) : animales.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "#8A7A63", textAlign: "center", lineHeight: 1.5 }}>
          Todavía no hay ningún animal guardado. Las fichas que registres van a aparecer acá.
        </p>
      ) : animalesFiltrados.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "#8A7A63", textAlign: "center", lineHeight: 1.5 }}>
          Ningún animal coincide con ese filtro.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {animalesFiltrados.map((a) => {
            const estado = estadoReproductivoDe(a);
            return (
              <div
                key={a.caravana}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  borderRadius: 10,
                  border: "1px solid var(--borde)",
                  background: "#FFFDF8",
                }}
              >
                <button
                  type="button"
                  onClick={() => onVerFicha(a)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flex: 1,
                    textAlign: "left",
                    padding: "12px 14px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontWeight: 700, fontSize: 15.5, color: "var(--marron-oscuro)" }}>
                      N° {a.caravana}
                    </div>
                    <div style={{ fontSize: 12, color: "#8A7A63", fontWeight: 500, marginTop: 2 }}>
                      {a.tipo || "Sin categoría"}
                    </div>
                  </div>
                  <EtiquetaEstado estado={estado} />
                </button>

                <button
                  type="button"
                  onClick={() => eliminarAnimalDelListado(a.caravana)}
                  title="Eliminar ficha"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#C62828",
                    cursor: "pointer",
                    fontSize: 16,
                    padding: "0 12px",
                    flexShrink: 0,
                  }}
                >
                  ❌
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Pantalla "Resumen": vista de solo lectura de un animal            */
/* ---------------------------------------------------------------- */

// Arma un texto corto de "próxima acción" en base a los datos ya
// calculados y guardados en la ficha. No inventa fechas nuevas: solo
// muestra lo que ya se calculó al cargar el servicio o la parición.
function obtenerProximaAccion(ficha) {
  if (ficha.paricion && ficha.paricion.proximoServicioSugerido) {
    return `Próximo servicio sugerido: ${ficha.paricion.proximoServicioSugerido}`;
  }

  const ultimoServicio =
    Array.isArray(ficha.historialServicios) && ficha.historialServicios.length > 0
      ? ficha.historialServicios[ficha.historialServicios.length - 1]
      : ficha.servicio || null;

  const calculos = ultimoServicio?.inseminacion?.calculos;
  if (calculos) {
    const desde = calculos.partoInseminacionDesde || calculos.partoIaDesde;
    const hasta = calculos.partoInseminacionHasta || calculos.partoIaHasta;
    if (desde && hasta) {
      return `Parto probable: ${desde} — ${hasta}`;
    }
  }

  return null;
}

function PantallaResumen({ ficha, onVolver, onEditar }) {
  const estado = estadoReproductivoDe(ficha);
  const proximaAccion = obtenerProximaAccion(ficha);

  const ultimoServicio =
    Array.isArray(ficha.historialServicios) && ficha.historialServicios.length > 0
      ? ficha.historialServicios[ficha.historialServicios.length - 1]
      : ficha.servicio || null;

  const cantidadCrias = Array.isArray(ficha.historialCrias) ? ficha.historialCrias.length : 0;

  return (
    <div
      style={{
        background: "var(--crema)",
        border: "1px solid var(--borde)",
        borderRadius: 16,
        padding: "22px 18px",
        boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
      }}
    >
      <button
        type="button"
        onClick={onVolver}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          color: "var(--marron-cuero-oscuro)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} /> Volver al listado
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontWeight: 700, fontSize: 28, color: "var(--marron-oscuro)" }}>
            N° {ficha.caravana}
          </div>
          <div style={{ fontSize: 13, color: "#8A7A63", fontWeight: 600, marginTop: 4 }}>
            {ficha.tipo || "Sin categoría"}
            {ficha.raza ? ` · ${ficha.raza}` : ""}
          </div>
        </div>
        <EtiquetaEstado estado={estado} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, background: "#F5F2EC", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#8A7A63", fontWeight: 600 }}>Nacimiento</div>
          <div style={{ fontSize: 13.5, color: "var(--marron-oscuro)", fontWeight: 700, marginTop: 2 }}>
            {ficha.fechaNacimiento ? formatearFechaDDMMYYYY(parseISO(ficha.fechaNacimiento)) : "Sin registrar"}
          </div>
        </div>
        <div style={{ flex: 1, background: "#F5F2EC", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#8A7A63", fontWeight: 600 }}>Madre</div>
          <div style={{ fontSize: 13.5, color: "var(--marron-oscuro)", fontWeight: 700, marginTop: 2 }}>
            {ficha.caravanaMadre || "Sin registrar"}
          </div>
        </div>
      </div>

      {proximaAccion && (
        <div
          style={{
            background: "#EFEBDD",
            border: "1px dashed var(--verde-salvia)",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <CalendarClock size={15} color="var(--verde-monte)" />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--verde-monte)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Próxima acción
            </span>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--marron-oscuro)", fontWeight: 600 }}>{proximaAccion}</div>
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--verde-salvia)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
        Historial reciente
      </div>

      <div style={{ marginBottom: 16 }}>
        {ultimoServicio?.inseminacion && (
          <FilaDato
            etiqueta={`Inseminación (${formatearFechaDDMMYYYY(parseISO(ultimoServicio.inseminacion.fecha))})`}
            valor={ultimoServicio.inseminacion.nombre}
          />
        )}
        {ultimoServicio?.toro && (
          <FilaDato
            etiqueta={`${ultimoServicio.toro.esRepasoToro ? "Repaso con Toro" : "Servicio Toro"} (${formatearFechaDDMMYYYY(parseISO(ultimoServicio.toro.fecha))})`}
            valor={ultimoServicio.toro.nombre}
          />
        )}
        {ficha.tacto && (
          <FilaDato
            etiqueta={`Tacto (${ficha.tacto.fecha ? formatearFechaDDMMYYYY(parseISO(ficha.tacto.fecha)) : "sin fecha"})`}
            valor={ficha.tacto.resultado === "Preniada" ? "Preñada" : ficha.tacto.resultado === "Vacia" ? "Vacía" : null}
          />
        )}
        <FilaDato etiqueta="Crías registradas" valor={cantidadCrias > 0 ? String(cantidadCrias) : null} />
        {!ultimoServicio && !ficha.tacto && cantidadCrias === 0 && (
          <p style={{ fontSize: 12.5, color: "#8A7A63", fontStyle: "italic", margin: "4px 0 0" }}>
            Todavía no hay servicios, tactos ni crías registradas.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onEditar}
        style={{
          width: "100%",
          padding: "15px",
          borderRadius: 12,
          border: "none",
          background: "var(--marron-cuero)",
          color: "#FBF7ED",
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontWeight: 600,
          fontSize: 16,
          cursor: "pointer",
        }}
      >
        Editar ficha
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Calendario anual (se usa dentro de la pantalla de Tareas)         */
/* ---------------------------------------------------------------- */

const NOMBRES_MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function CalendarioAnual({ year, eventosPorFecha, diaSeleccionado, onSeleccionarDia }) {
  const hoyISO = fechaAISO(new Date());

  return (
    <div
      style={{
        background: "#FFFDF8",
        border: "1px solid var(--borde)",
        borderRadius: 14,
        padding: "16px",
        marginBottom: 20,
      }}
    >
      <h3
        style={{
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontSize: 15,
          fontWeight: 600,
          color: "var(--marron-oscuro)",
          margin: "0 0 12px",
          textAlign: "center",
        }}
      >
        Calendario {year}
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {NOMBRES_MESES.map((nombreMes, indiceMes) => (
          <MiniMes
            key={indiceMes}
            year={year}
            mes={indiceMes}
            nombreMes={nombreMes}
            hoyISO={hoyISO}
            eventosPorFecha={eventosPorFecha}
            diaSeleccionado={diaSeleccionado}
            onSeleccionarDia={onSeleccionarDia}
          />
        ))}
      </div>
    </div>
  );
}

function MiniMes({ year, mes, nombreMes, hoyISO, eventosPorFecha, diaSeleccionado, onSeleccionarDia }) {
  const primerDiaSemana = new Date(year, mes, 1).getDay(); // 0 = domingo
  const diasEnMes = new Date(year, mes + 1, 0).getDate();

  const celdas = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d);

  return (
    <div style={{ background: "var(--crema)", borderRadius: 10, border: "1px solid var(--borde)", padding: 8 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--verde-monte)", textAlign: "center", marginBottom: 6 }}>
        {nombreMes}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {["D", "L", "M", "M", "J", "V", "S"].map((letra, i) => (
          <div key={i} style={{ fontSize: 8.5, color: "#8A7A63", textAlign: "center", fontWeight: 600 }}>
            {letra}
          </div>
        ))}
        {celdas.map((dia, idx) => {
          if (dia === null) return <div key={idx} />;
          const mm = String(mes + 1).padStart(2, "0");
          const dd = String(dia).padStart(2, "0");
          const fechaISO = `${year}-${mm}-${dd}`;
          const tieneEvento = Boolean(eventosPorFecha[fechaISO]);
          const esHoy = fechaISO === hoyISO;
          const esSeleccionado = fechaISO === diaSeleccionado;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSeleccionarDia(fechaISO)}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1",
                fontSize: 9.5,
                border: "none",
                borderRadius: 4,
                background: esSeleccionado ? "var(--verde-monte)" : esHoy ? "#EFEBDD" : "transparent",
                color: esSeleccionado ? "#FBF7ED" : "var(--marron-oscuro)",
                fontWeight: esHoy || esSeleccionado ? 700 : 400,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {dia}
              {tieneEvento && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 1,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: esSeleccionado ? "#FBF7ED" : "var(--terracota)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/*/* ---------------------------------------------------------------- */
/* Pantalla "Alertas": qué animales necesitan atención hoy           */
/* ---------------------------------------------------------------- */

function PantallaAlertas({ onVolver, onVerFicha }) {
  const [animales, setAnimales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tareasManuales, setTareasManuales] = useState([]);
  const [mostrarFormularioTarea, setMostrarFormularioTarea] = useState(false);
  const [nuevaFechaTarea, setNuevaFechaTarea] = useState("");
  const [nuevoTextoTarea, setNuevoTextoTarea] = useState("");
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);

  useEffect(() => {
    setAnimales(leerTodosLosAnimalesGuardados());
    setTareasManuales(leerTareasManuales());
    setCargando(false);
    const recargar = () => {
      setAnimales(leerTodosLosAnimalesGuardados());
      setTareasManuales(leerTareasManuales());
    };
    window.addEventListener("agrodata:actualizado", recargar);
    return () => window.removeEventListener("agrodata:actualizado", recargar);
  }, []);

  const grupos = useMemo(() => {
    const hoy = new Date();
    const partos = [];
    const tactos = [];
    const servicios = [];

    animales.forEach((ficha) => {
      obtenerAlertasDe(ficha, hoy).forEach((alerta) => {
        const item = { ficha, alerta };
        if (alerta.tipo === "parto") partos.push(item);
        else if (alerta.tipo === "tacto") tactos.push(item);
        else if (alerta.tipo === "servicio") servicios.push(item);
      });
    });

    partos.sort((a, b) => a.alerta.orden - b.alerta.orden);
    tactos.sort((a, b) => a.alerta.orden - b.alerta.orden);
    servicios.sort((a, b) => a.alerta.orden - b.alerta.orden);

    return { partos, tactos, servicios };
  }, [animales]);

  const tareasManualesPendientes = tareasManuales.filter((t) => !t.completada);
  const totalAlertas =
    grupos.partos.length + grupos.tactos.length + grupos.servicios.length + tareasManualesPendientes.length;

  // Mapa "fecha -> cantidad de eventos", para pintar los puntitos del calendario
  const eventosPorFecha = useMemo(() => {
    const mapa = {};
    [...grupos.partos, ...grupos.tactos, ...grupos.servicios].forEach(({ alerta }) => {
      const iso = fechaAISO(alerta.fecha);
      if (iso) mapa[iso] = (mapa[iso] || 0) + 1;
    });
    tareasManuales.forEach((t) => {
      if (t.fecha) mapa[t.fecha] = (mapa[t.fecha] || 0) + 1;
    });
    return mapa;
  }, [grupos, tareasManuales]);

  // Qué hay agendado para el día que se tocó en el calendario
  const eventosDelDiaSeleccionado = useMemo(() => {
    if (!diaSeleccionado) return { alertas: [], tareas: [] };
    
    // Normalizamos la fecha seleccionada a YYYY-MM-DD para comparar sin errores
    const fechaSelISO = diaSeleccionado.includes("T") 
      ? diaSeleccionado.split("T")[0] 
      : diaSeleccionado;

    const alertasDelDia = [...grupos.partos, ...grupos.tactos, ...grupos.servicios].filter(
      ({ alerta }) => fechaAISO(alerta.fecha) === fechaSelISO
    );

    // Compara correctamente las tareas guardadas desde Sanidad o Manuales
    const tareasDelDia = tareasManuales.filter((t) => {
      if (!t.fecha) return false;
      const fechaTareaISO = t.fecha.includes("T") ? t.fecha.split("T")[0] : t.fecha;
      return fechaTareaISO === fechaSelISO;
    });

    return { alertas: alertasDelDia, tareas: tareasDelDia };
  }, [diaSeleccionado, grupos, tareasManuales]);

  const agregarTareaManual = () => {
    const fecha = nuevaFechaTarea.trim();
    const texto = nuevoTextoTarea.trim();
    if (!fecha || !texto) {
      alert("Completá la fecha y la descripción de la tarea.");
      return;
    }
    const nueva = { id: `${Date.now()}`, fecha, texto, completada: false };
    const actualizado = [...tareasManuales, nueva];
    guardarTareasManuales(actualizado);
    setTareasManuales(actualizado);
    setNuevaFechaTarea("");
    setNuevoTextoTarea("");
    setMostrarFormularioTarea(false);
  };

  const alternarCompletadaTarea = (id) => {
    const actualizado = tareasManuales.map((t) => (t.id === id ? { ...t, completada: !t.completada } : t));
    guardarTareasManuales(actualizado);
    setTareasManuales(actualizado);
  };

  const eliminarTareaManual = (id) => {
    if (!window.confirm("¿Eliminar esta tarea?")) return;
    const actualizado = tareasManuales.filter((t) => t.id !== id);
    guardarTareasManuales(actualizado);
    setTareasManuales(actualizado);
  };

  return (
    <div
      style={{
        background: "var(--crema)",
        border: "1px solid var(--borde)",
        borderRadius: 16,
        padding: "22px 18px",
        boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
      }}
    >
      <button
        type="button"
        onClick={onVolver}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          color: "var(--marron-cuero-oscuro)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} /> Volver
      </button>

      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div
          style={{
            fontFamily: "'PP Neue Montreal Bold', serif",
            fontWeight: 700,
            fontSize: 40,
            color: totalAlertas > 0 ? "var(--terracota)" : "var(--verde-exito)",
            lineHeight: 1,
          }}
        >
          {totalAlertas}
        </div>
        <div style={{ fontSize: 13, color: "#8A7A63", fontWeight: 600, marginTop: 4 }}>
          {totalAlertas === 0 ? "Todo al día, no hay pendientes" : totalAlertas === 1 ? "pendiente" : "pendientes"}
        </div>
      </div>

      {cargando ? (
        <p style={{ fontSize: 13, color: "#8A7A63", textAlign: "center" }}>Cargando...</p>
      ) : (
        <>
          <CalendarioAnual
            year={new Date().getFullYear()}
            eventosPorFecha={eventosPorFecha}
            diaSeleccionado={diaSeleccionado}
            onSeleccionarDia={(fecha) => setDiaSeleccionado((actual) => (actual === fecha ? null : fecha))}
          />

          {diaSeleccionado && (
            <div
              style={{
                background: "#EFEBDD",
                border: "1px dashed var(--verde-salvia)",
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--verde-monte)" }}>
                  📅 {diaSeleccionado}
                </span>
                <button
                  type="button"
                  onClick={() => setDiaSeleccionado(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#8A7A63" }}
                >
                  <X size={16} />
                </button>
              </div>
              
              {eventosDelDiaSeleccionado.alertas.length === 0 && eventosDelDiaSeleccionado.tareas.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "#8A7A63", fontStyle: "italic", margin: 0 }}>
                  No hay nada agendado este día.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {eventosDelDiaSeleccionado.alertas.map(({ ficha, alerta }) => (
                    <button
                      key={ficha.caravana + alerta.tipo}
                      type="button"
                      onClick={() => onVerFicha(ficha)}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: "#FFFDF8",
                        fontSize: 12.5,
                        cursor: "pointer",
                        color: "var(--marron-oscuro)",
                      }}
                    >
                      N° {ficha.caravana} — {alerta.etiqueta}
                    </button>
                  ))}
                  {eventosDelDiaSeleccionado.tareas.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "#FFFDF8",
                        fontSize: 12.5,
                        color: t.completada ? "#8A7A63" : "var(--marron-oscuro)",
                        textDecoration: t.completada ? "line-through" : "none",
                      }}
                    >
                      {t.texto}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <GrupoAlertas titulo="Partos próximos" items={grupos.partos} onVerFicha={onVerFicha} color="var(--terracota)" />
          <GrupoAlertas titulo="Tactos pendientes" items={grupos.tactos} onVerFicha={onVerFicha} color="var(--marron-cuero)" />
          <GrupoAlertas titulo="Servicios sugeridos" items={grupos.servicios} onVerFicha={onVerFicha} color="var(--verde-monte)" />

          {/* Tareas agregadas a mano */}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--marron-cuero-oscuro)",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                Mis tareas ({tareasManuales.length})
              </span>
              <button
                type="button"
                onClick={() => setMostrarFormularioTarea((v) => !v)}
                style={{
                  background: "var(--verde-monte)",
                  color: "#FBF7ED",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {mostrarFormularioTarea ? "Cancelar" : "➕ Agregar tarea"}
              </button>
            </div>

            {mostrarFormularioTarea && (
              <div style={{ background: "#FFFDF8", border: "1px solid var(--borde)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <CampoTexto
                  id="fecha-tarea-manual"
                  etiqueta="Fecha"
                  tipo="date"
                  valor={nuevaFechaTarea}
                  onChange={setNuevaFechaTarea}
                />
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="texto-tarea-manual"
                    style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--marron-oscuro)", marginBottom: 5 }}
                  >
                    Descripción
                  </label>
                  <input
                    id="texto-tarea-manual"
                    type="text"
                    placeholder="Ej: Llamar al veterinario"
                    value={nuevoTextoTarea}
                    onChange={(e) => setNuevoTextoTarea(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 14,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "2px solid var(--borde)",
                      background: "#FFFDF8",
                      color: "var(--marron-oscuro)",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={agregarTareaManual}
                  style={{
                    width: "100%",
                    background: "var(--marron-cuero)",
                    color: "#FBF7ED",
                    border: "none",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Guardar tarea
                </button>
              </div>
            )}

            {tareasManuales.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "#8A7A63", fontStyle: "italic", margin: 0 }}>
                Todavía no agregaste ninguna tarea manual.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...tareasManuales]
                  .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
                  .map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--borde)",
                        background: "#FFFDF8",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => alternarCompletadaTarea(t.id)}
                        title={t.completada ? "Marcar como pendiente" : "Marcar como hecha"}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          border: "2px solid var(--verde-monte)",
                          background: t.completada ? "var(--verde-monte)" : "transparent",
                          color: "#FBF7ED",
                          cursor: "pointer",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          padding: 0,
                        }}
                      >
                        {t.completada ? "✓" : ""}
                      </button>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: t.completada ? "#8A7A63" : "var(--marron-oscuro)",
                            textDecoration: t.completada ? "line-through" : "none",
                          }}
                        >
                          {t.texto}
                        </div>
                        <div style={{ fontSize: 11, color: "#8A7A63", marginTop: 2 }}>
                          {t.fecha ? t.fecha : "Sin fecha"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => eliminarTareaManual(t.id)}
                        title="Eliminar tarea"
                        style={{ background: "none", border: "none", color: "#C62828", cursor: "pointer", fontSize: 15, flexShrink: 0 }}
                      >
                        ❌
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GrupoAlertas({ titulo, items, onVerFicha, color }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 8,
        }}
      >
        {titulo} ({items.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(({ ficha, alerta }) => (
          <button
            key={ficha.caravana + alerta.tipo}
            type="button"
            onClick={() => onVerFicha(ficha)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              width: "100%",
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--borde)",
              background: "#FFFDF8",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontWeight: 700, fontSize: 15, color: "var(--marron-oscuro)" }}>
                N° {ficha.caravana}
              </div>
              <div style={{ fontSize: 12, color: "#8A7A63", marginTop: 2 }}>{alerta.etiqueta}</div>
            </div>
            <ArrowLeft size={14} style={{ transform: "rotate(180deg)", color: "#8A7A63", flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------- */
/* Pantalla "Genealogía": Árbol Visual Vertical (Madre, Padre, Cría) */
/* ---------------------------------------------------------------- */

function PantallaGenealogia({ onVolver, onVerFicha }) {
  const [caravanaBusqueda, setCaravanaBusqueda] = useState("");
  const [animalPrincipal, setAnimalPrincipal] = useState(null);
  const [buscado, setBuscado] = useState(false);

  const buscar = () => {
    const numero = caravanaBusqueda.trim();
    if (!numero) return;
    const ficha = leerAnimalPorCaravana(numero);
    setAnimalPrincipal(ficha || null);
    setBuscado(true);
  };

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid var(--borde)",
        borderRadius: 16,
        padding: "22px 18px",
        boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
      }}
    >
      <button
        type="button"
        onClick={onVolver}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          color: "var(--marron-cuero-oscuro)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} /> Volver
      </button>

      <h2
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          fontWeight: 800,
          color: "#8A94A6",
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          margin: "0 0 18px",
        }}
      >
        Árbol Genealógico
      </h2>

      {/* Buscador */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Número de caravana"
          value={caravanaBusqueda}
          onChange={(e) => setCaravanaBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") buscar();
          }}
          style={{
            flex: 1,
            boxSizing: "border-box",
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            padding: "12px 14px",
            borderRadius: 10,
            border: "2px solid var(--borde)",
            background: "#FFFDF8",
            color: "var(--marron-oscuro)",
          }}
        />
        <button
          type="button"
          onClick={buscar}
          style={{
            padding: "0 18px",
            borderRadius: 10,
            border: "none",
            background: "var(--verde-monte)",
            color: "#FBF7ED",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Search size={16} /> Buscar
        </button>
      </div>

      {buscado && !animalPrincipal && (
        <p style={{ fontSize: 13.5, color: "#8A7A63", textAlign: "center", margin: "20px 0" }}>
          No hay ninguna ficha con la caravana N° {caravanaBusqueda.trim()}.
        </p>
      )}

      {buscado && animalPrincipal && (
        <ArbolGraficoPedigree animal={animalPrincipal} onVerFicha={onVerFicha} />
      )}
    </div>
  );
}

function ArbolGraficoPedigree({ animal, onVerFicha }) {
  const caravanaMadre = animal.caravanaMadre || animal.cria?.caravanaMadre || null;
  const nombrePadreAnimal = animal.nombrePadre || animal.cria?.nombrePadre || null;
  const fechaNacimientoAnimal = animal.fechaNacimiento || animal.cria?.fechaNacimiento || null;
  const madreFicha = caravanaMadre ? leerAnimalPorCaravana(caravanaMadre) : null;
  const crias = animal.historialCrias || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", margin: "20px 0" }}>

      {/* 1. NIVEL SUPERIOR: MADRE Y PADRE */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", width: "100%", maxWidth: 420 }}>

        {/* CAJA MADRE */}
        <div
          onClick={() => madreFicha && onVerFicha && onVerFicha(madreFicha)}
          style={{
            flex: 1,
            padding: "14px 10px",
            borderRadius: 12,
            border: caravanaMadre ? "1.5px solid #0277BD" : "1.5px dashed #C4CDD5",
            background: caravanaMadre ? "#E1F5FE" : "#F8FAFC",
            textAlign: "center",
            cursor: madreFicha ? "pointer" : "default",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#919EAB", textTransform: "uppercase", marginBottom: 4 }}>
            ♀ MADRE
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: caravanaMadre ? "#0277BD" : "#B0B9C2" }}>
            {caravanaMadre ? `N° ${caravanaMadre}` : "Agregar"}
          </div>
        </div>

        {/* CAJA PADRE */}
        <div
          style={{
            flex: 1,
            padding: "14px 10px",
            borderRadius: 12,
            border: nombrePadreAnimal ? "1.5px solid #0277BD" : "1.5px dashed #C4CDD5",
            background: nombrePadreAnimal ? "#E1F5FE" : "#F8FAFC",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#919EAB", textTransform: "uppercase", marginBottom: 4 }}>
            ♂ PADRE
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: nombrePadreAnimal ? "#0277BD" : "#B0B9C2" }}>
            {nombrePadreAnimal ? nombrePadreAnimal : "Agregar"}
          </div>
        </div>

      </div>

      {/* LÍNEAS CONECTORAS DE PADRES A ANIMAL PRINCIPAL */}
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "50%", height: 12, borderBottom: "1.5px solid #C4CDD5" }}></div>
        <div style={{ width: 1.5, height: 16, background: "#C4CDD5" }}></div>
      </div>

      {/* 2. NIVEL CENTRAL: ANIMAL PRINCIPAL */}
      <div
        onClick={() => onVerFicha && onVerFicha(animal)}
        style={{
          width: "100%",
          maxWidth: 220,
          padding: "12px 16px",
          borderRadius: 12,
          border: "2px solid #0277BD",
          background: "#E1F5FE",
          textAlign: "center",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(2, 119, 189, 0.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Tag size={16} color="#0277BD" />
          <span style={{ fontSize: 16, fontWeight: 800, color: "#0277BD" }}>
            {animal.caravana}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#637381", marginTop: 4 }}>
          📅 {fechaNacimientoAnimal ? formatearFechaDDMMYYYY(parseISO(fechaNacimientoAnimal)) : "Sin registrar"}
        </div>
      </div>

      {/* LÍNEA CONECTORA A CRÍAS */}
      <div style={{ width: 1.5, height: 16, background: "#C4CDD5" }}></div>

      {/* 3. NIVEL INFERIOR: CRÍAS */}
      <div style={{ width: "100%", maxWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
        {crias.length > 0 ? (
          crias.map((cria, idx) => {
            const fichaCria = leerAnimalPorCaravana(cria.caravana);
            // Obtenemos el nombre del padre desde la ficha individual de la cría o desde su registro directo
            const padreCria = fichaCria?.nombrePadre || cria.padre || cria.nombrePadre;

            return (
              <div
                key={idx}
                onClick={() => fichaCria && onVerFicha && onVerFicha(fichaCria)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1.5px dashed #C4CDD5",
                  background: "#F8FAFC",
                  textAlign: "center",
                  cursor: fichaCria ? "pointer" : "default",
                }}
              >
                {/* Caravana de la Cría */}
                <div style={{ fontSize: 13, fontWeight: 700, color: "#637381" }}>
                  🐄 N° {cria.caravana || "Sin caravana"}
                </div>

                {/* Nombre del Padre de la Cría */}
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "#0277BD", marginTop: 3 }}>
                  🐂 Padre: {padreCria ? padreCria : "Sin registrar"}
                </div>

                {/* Fecha de Nacimiento */}
                {cria.fechaNacimiento && (
                  <div style={{ fontSize: 10.5, color: "#919EAB", marginTop: 2 }}>
                    📅 Nac: {cria.fechaNacimiento}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div
            style={{
              padding: "14px 10px",
              borderRadius: 12,
              border: "1.5px dashed #C4CDD5",
              background: "#F8FAFC",
              textAlign: "center",
              color: "#B0B9C2",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 2 }}>+</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.5px" }}>
              SIN CRÍAS
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
/* ---------------------------------------------------------------- */
/* Pantalla 2: Formulario (alta o edición)                           */
/* ---------------------------------------------------------------- */

function PantallaFormulario({
  caravana,
  modo,
  historialServicios,
  setHistorialServicios,
  historialCrias,
  setHistorialCrias,
  onVolver,
  tipo,
  setTipo,
  raza,
  setRaza,
  fechaNacimiento,
  setFechaNacimiento,
  caravanaMadreManual,
  setCaravanaMadreManual,
  nombrePadreManual,
  setNombrePadreManual,
  observacionesAnimal,
  setObservacionesAnimal,
  muestraServicio,
  fechaInseminacion,
  setFechaInseminacion,
  nombreInseminacion,
  setNombreInseminacion,
  fechaToro,
  setFechaToro,
  esRepasoToro,
  setEsRepasoToro,
  nombreToro,
  setNombreToro,
  observacionesToro,
  setObservacionesToro,
  calculos,
  nombrePadreActual,
  fechaTacto,
  setFechaTacto,
  resultadoTacto,
  seleccionarTacto,
  observaciones,
  setObservaciones,
  fechaParicion,
  setFechaParicion,
  tipoCria,
  pesoNacer,
  setPesoNacer,
  seleccionarTipoCria,
  caravanaCria,
  setCaravanaCria,
  observacionesParicion,
  setObservacionesParicion,
  proximoServicioSugerido,
  observacionesCria,
  setObservacionesCria,
  origenCria,
  estado,
  listoParaGuardar,
  onGuardar,
}) {
  const enEdicion = modo === "edicion";


  return (
    <div
      style={{
        background: "var(--crema)",
        border: "1px solid var(--borde)",
        borderRadius: 16,
        padding: "22px 18px",
        boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
      }}
    >
      {/* Volver a buscar */}
      <button
        type="button"
        onClick={onVolver}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          color: "var(--marron-cuero-oscuro)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} /> Volver a buscar
      </button>

      {/* Caravana (fija, ya confirmada por la búsqueda) */}
      <div style={{ position: "relative", display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <div
          style={{
            position: "absolute",
            top: -8,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "var(--arena)",
            border: "2px solid var(--borde)",
          }}
        />
        <div
          style={{
            background: enEdicion ? "var(--verde-salvia)" : "var(--marron-cuero)",
            borderRadius: 12,
            padding: "12px 26px",
            textAlign: "center",
            minWidth: 160,
          }}
        >
          <div style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontSize: 24, fontWeight: 700, color: "#FBF7ED" }}>
            N° {caravana}
          </div>
          <div style={{ fontSize: 11, color: "#FBF7ED", opacity: 0.9, fontWeight: 600 }}>
            {enEdicion ? "Editando ficha" : "Ficha nueva"}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: "#8A7A63", textAlign: "center", margin: "0 0 22px" }}>
        Para cambiar el número, volvé a buscar.
      </p>

      {/* Tipo de animal */}
      <h3
        style={{
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontSize: 16,
          fontWeight: 600,
          color: "#FBF7ED",
          background: "var(--verde-monte)",
          padding: "8px 12px",
          borderRadius: 8,
          margin: "15px 0 10px 0"
        }}
      >
        Categoría <span style={{ color: "var(--terracota)" }}>*</span>
      </h3>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}
        role="radiogroup"
        aria-label="Tipo de animal"
      >
        {TIPOS.map((t) => {
          const activo = tipo === t.valor;
          return (
            <button
              key={t.valor}
              type="button"
              role="radio"
              aria-checked={activo}
              className="tipo-btn"
              onClick={() => setTipo(t.valor)}
              style={{
                padding: "14px 10px",
                borderRadius: 12,
                border: activo ? "2px solid var(--verde-monte)" : "2px solid var(--borde)",
                background: activo ? "var(--verde-monte)" : "#FFFDF8",
                color: activo ? "#FBF7ED" : "var(--marron-oscuro)",
                cursor: "pointer",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontWeight: 600, fontSize: 16 }}>{t.valor}</span>
            </button>
          );
        })}
      </div>

      {/* Sección de Datos Básicos del Animal en Grilla */}
      <div className="grilla-formulario">
        <CampoTexto
          id="raza"
          etiqueta="Raza"
          tipo="text"
          placeholder="Ej: Angus"
          valor={raza}
          onChange={setRaza}
        />

        <CampoTexto
          id="fecha-nacimiento"
          etiqueta="Fecha de nacimiento"
          tipo="date"
          valor={fechaNacimiento}
          onChange={setFechaNacimiento}
        />

        <CampoTexto
          id="caravana-madre"
          etiqueta="Caravana de la madre"
          tipo="text"
          placeholder="Ej: M102 (opcional)"
          valor={caravanaMadreManual}
          onChange={setCaravanaMadreManual}
        />

        <CampoTexto
          id="nombre-padre"
          etiqueta="Nombre del padre"
          tipo="text"
          placeholder="Ej: La Joya (opcional)"
          valor={nombrePadreManual}
          onChange={setNombrePadreManual}
        />
      </div>

      {/* Observaciones a ancho completo */}
      <div className="grilla-formulario" style={{ marginTop: 16, marginBottom: 24 }}>
        <div className="columna-completa">
          <label
            htmlFor="observaciones-animal"
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--marron-oscuro)",
              marginBottom: 5,
            }}
          >
            Observaciones
          </label>
          <textarea
            id="observaciones-animal"
            rows={3}
            placeholder="Notas adicionales (opcional)"
            value={observacionesAnimal}
            onChange={(e) => setObservacionesAnimal(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              padding: "12px 14px",
              borderRadius: 10,
              border: "2px solid var(--borde)",
              background: "#FFFDF8",
              color: "var(--marron-oscuro)",
              resize: "vertical",
            }}
          />
        </div>
      </div>

      {/* Servicio reproductivo */}
      {muestraServicio && (
        <details className="seccion-desplegable" style={{ borderTop: "1px dashed var(--borde)", paddingTop: 18, marginBottom: 20 }}>
          <summary
            style={{
              fontFamily: "'PP Neue Montreal Bold', serif",
              fontSize: 18,
              fontWeight: 600,
              color: "#FBF7ED",
              background: "var(--verde-monte)",
              padding: "12px 16px",
              borderRadius: 8,
              margin: "10px 0 14px 0",
              cursor: "pointer",
              userSelect: "none",
              boxSizing: "border-box",
            }}
          >
            Servicio reproductivo
          </summary>
          <p style={{ fontSize: 12, color: "#8A7A63", margin: "0 0 12px" }}>
            Completa una o ambas opciones según corresponda.
          </p>

          {/* BLOQUE 1: INSEMINACIÓN ARTIFICIAL */}
          <div
            style={{
              background: "#FFFDF8",
              border: "1px solid var(--borde)",
              borderRadius: 12,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                display: "block",
                fontFamily: "'PP Neue Montreal Bold', serif",
                fontWeight: 600,
                fontSize: 14.5,
                color: "var(--verde-monte)",
                marginBottom: 10,
              }}
            >
              💉 Inseminación Artificial
            </span>

            <CampoTexto
              id="fecha-inseminacion"
              etiqueta="Fecha de inseminación"
              tipo="date"
              valor={fechaInseminacion}
              onChange={setFechaInseminacion}
            />

            {calculos && <PanelCalculos calculos={calculos} />}

            <CampoTexto
              id="pajuela-padre"
              etiqueta="Nombre de pajuela / padre"
              tipo="text"
              placeholder="Ej: SEMEX 4410"
              valor={nombreInseminacion}
              onChange={setNombreInseminacion}
            />
            {/* ➕ BOTÓN PARA AGREGAR LA INSEMINACIÓN AL HISTORIAL CON CÁLCULOS DENTRO */}
            <div style={{ marginTop: "15px", textAlign: "right" }}>
              <button
                type="button"
                onClick={() => {
                  const hayInseminacion = typeof fechaInseminacion !== "undefined" && fechaInseminacion;
                  const hayToro = typeof fechaToro !== "undefined" && fechaToro;

                  if (!hayInseminacion && !hayToro) {
                    alert("Por favor, ingresa al menos una fecha de inseminación para agregar al historial.");
                    return;
                  }

                  try {
                    const clave = `animal:${caravana}`;
                    const raw = localStorage.getItem(clave) || "{}";
                    const ficha = JSON.parse(raw);

                    if (!ficha.historialServicios || !Array.isArray(ficha.historialServicios)) {
                      ficha.historialServicios = [];
                    }

                    // Función auxiliar para sumar días exactos a una fecha en formato es-AR
                    const sumarDias = (fechaStr, dias) => {
                      const f = new Date(fechaStr + "T00:00:00");
                      f.setDate(f.getDate() + dias);
                      return f.toLocaleDateString("es-AR");
                    };

                    const nuevoRegistro = {};

                    if (hayInseminacion) {
                      nuevoRegistro.inseminacion = {
                        fecha: fechaInseminacion,
                        nombre: typeof nombreInseminacion !== "undefined" ? nombreInseminacion : "",
                        // 🌟 CÁLCULOS EXACTOS (260 a 300 DÍAS)
                        calculos: {
                          repasoSugerido: sumarDias(fechaInseminacion, 15),
                          partoIaDesde: sumarDias(fechaInseminacion, 260),
                          partoIaHasta: sumarDias(fechaInseminacion, 300),
                          partoRepasoDesde: sumarDias(fechaInseminacion, 300),
                        }
                      };
                    }

                    if (hayToro) {
                      nuevoRegistro.toro = {
                        fecha: fechaToro,
                        nombre: typeof nombreToro !== "undefined" ? nombreToro : "",
                        esRepasoToro: typeof esRepasoToro !== "undefined" ? esRepasoToro : false
                      };
                    }

                    ficha.historialServicios.push(nuevoRegistro);
                    localStorage.setItem(clave, JSON.stringify(ficha));

                    // Limpieza de campos
                    if (typeof setFechaInseminacion === "function") setFechaInseminacion("");
                    if (typeof setNombreInseminacion === "function") setNombreInseminacion("");
                    if (typeof setFechaToro === "function") setFechaToro("");
                    if (typeof setNombreToro === "function") setNombreToro("");
                    if (typeof setEsRepasoToro === "function") setEsRepasoToro(false);

                    if (typeof setHistorialServicios === "function") {
                      setHistorialServicios(ficha.historialServicios);
                    }
                  } catch (e) {
                    alert("Ocurrió un error al agregar el servicio al historial.");
                  }
                }}
                style={{
                  background: "var(--verde-monte)",
                  color: "white",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "13.5px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                ➕ Agregar al historial
              </button>
            </div>
          </div>

          {/* BLOQUE 2: SERVICIO CON TORO / REPASO */}
          <div
            style={{
              background: "#FFFDF8",
              border: "1px solid var(--borde)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <span
              style={{
                display: "block",
                fontFamily: "'PP Neue Montreal Bold', serif",
                fontWeight: 600,
                fontSize: 14.5,
                color: "var(--verde-monte)",
                marginBottom: 10,
              }}
            >
              🐂 Servicio con Toro / Repaso
            </span>

            <CampoTexto
              id="fecha-servicio-toro"
              etiqueta="Fecha de Servicio"
              tipo="date"
              valor={fechaToro}
              onChange={setFechaToro}
            />

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--marron-oscuro)",
                marginBottom: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={esRepasoToro}
                onChange={(e) => setEsRepasoToro(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "var(--verde-monte)", cursor: "pointer" }}
              />
              Repaso con Toro
              <span style={{ fontWeight: 400, fontSize: 11.5, color: "#8A7A63" }}>(opcional)</span>
            </label>

            <CampoTexto
              id="nombre-toro"
              etiqueta="Nombre de Toro"
              tipo="text"
              placeholder="Ej: Toro Manchado"
              valor={nombreToro}
              onChange={setNombreToro}
            />

            <label
              htmlFor="observaciones-toro"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--marron-oscuro)",
                marginBottom: 5,
              }}
            >
              Observaciones
            </label>
            <textarea
              id="observaciones-toro"
              rows={3}
              placeholder="Notas adicionales (opcional)"
              value={observacionesToro}
              onChange={(e) => setObservacionesToro(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                padding: "12px 14px",
                borderRadius: 10,
                border: "2px solid var(--borde)",
                background: "#FFFDF8",
                color: "var(--marron-oscuro)",
                resize: "vertical",
              }}
            />

            {/* ➕ BOTÓN PARA AGREGAR EL SERVICIO AL HISTORIAL EN EL ACTO */}
            <div style={{ marginTop: "15px", textAlign: "right" }}>
              <button
                type="button"
                onClick={() => {
                  // 1. Validamos que haya al menos una fecha cargada
                  const hayInseminacion = typeof fechaInseminacion !== "undefined" && fechaInseminacion;
                  const hayToro = typeof fechaToro !== "undefined" && fechaToro;

                  if (!hayInseminacion && !hayToro) {
                    alert("Por favor, ingresa al menos una fecha (de inseminación o de toro) para agregar al historial.");
                    return;
                  }

                  try {
                    const clave = `animal:${caravana}`;
                    const raw = localStorage.getItem(clave) || "{}";
                    const ficha = JSON.parse(raw);

                    // Nos aseguramos de que exista el array de historial
                    if (!ficha.historialServicios || !Array.isArray(ficha.historialServicios)) {
                      ficha.historialServicios = [];
                    }

                    // 2. Armamos el nuevo registro
                    const nuevoRegistro = {};

                    if (hayInseminacion) {
                      nuevoRegistro.inseminacion = {
                        fecha: fechaInseminacion,
                        nombre: typeof nombreInseminacion !== "undefined" ? nombreInseminacion : ""
                      };
                    }

                    if (hayToro) {
                      nuevoRegistro.toro = {
                        fecha: fechaToro,
                        nombre: typeof nombreToro !== "undefined" ? nombreToro : "",
                        esRepasoToro: typeof esRepasoToro !== "undefined" ? esRepasoToro : false
                      };
                    }

                    // 3. Lo agregamos al historial local
                    ficha.historialServicios.push(nuevoRegistro);
                    localStorage.setItem(clave, JSON.stringify(ficha));

                    // 4. Limpiamos las cajitas de entrada
                    if (typeof setFechaInseminacion === "function") setFechaInseminacion("");
                    if (typeof setNombreInseminacion === "function") setNombreInseminacion("");
                    if (typeof setFechaToro === "function") setFechaToro("");
                    if (typeof setNombreToro === "function") setNombreToro("");
                    if (typeof setEsRepasoToro === "function") setEsRepasoToro(false);

                    // 5. Actualizamos el historial en pantalla al instante
                    if (typeof setHistorialServicios === "function") {
                      setHistorialServicios(ficha.historialServicios);
                    }
                  } catch (e) {
                    alert("Ocurrió un error al agregar el servicio al historial.");
                  }
                }}
                style={{
                  background: "var(--verde-monte)",
                  color: "white",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "13.5px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                ➕ Agregar al historial
              </button>
            </div>

          </div>

          {/* 📋 HISTORIAL REPRODUCTIVO CON AGRUPACIÓN POR AÑO Y CÁLCULOS DESPLEGABLES */}
          {(() => {
            let todosLosServicios = [];

            // Función para borrar un sub-servicio (Inseminación o Toro)
            const eliminarSubServicio = (hIdx, tipoABorrar) => {
              if (!window.confirm(`¿Estás segura de borrar este registro de ${tipoABorrar}?`)) return;

              try {
                const clave = `animal:${caravana}`;
                const raw = localStorage.getItem(clave) || "{}";
                const ficha = JSON.parse(raw);

                if (ficha.historialServicios && ficha.historialServicios[hIdx]) {
                  delete ficha.historialServicios[hIdx][tipoABorrar];

                  const item = ficha.historialServicios[hIdx];
                  if (!item.inseminacion && !item.toro) {
                    ficha.historialServicios.splice(hIdx, 1);
                  }

                  localStorage.setItem(clave, JSON.stringify(ficha));

                  if (typeof setHistorialServicios === "function") {
                    setHistorialServicios(ficha.historialServicios || []);
                  }
                }
              } catch (e) {
                alert("No se pudo eliminar el registro.");
              }
            };

            todosLosServicios = Array.isArray(historialServicios) ? historialServicios : [];

            // 🌟 AGRUPACIÓN POR AÑO
            const serviciosPorAnio = {};

            todosLosServicios.forEach((serv, idx) => {
              // Extraer el año de la fecha disponible (IA o Toro)
              let fechaRef = "";
              if (serv.inseminacion && serv.inseminacion.fecha) {
                fechaRef = serv.inseminacion.fecha;
              } else if (serv.toro && serv.toro.fecha) {
                fechaRef = serv.toro.fecha;
              }

              // Obtener el año (soporta YYYY-MM-DD o DD/MM/YYYY)
              let anio = "Sin Año";
              if (fechaRef) {
                if (fechaRef.includes("-")) {
                  anio = fechaRef.split("-")[0];
                } else if (fechaRef.includes("/")) {
                  const partes = fechaRef.split("/");
                  anio = partes[partes.length - 1];
                }
              }

              if (!serviciosPorAnio[anio]) {
                serviciosPorAnio[anio] = [];
              }

              // Guardamos el servicio junto con su índice original para poder borrarlo
              serviciosPorAnio[anio].push({ ...serv, originalIndex: idx });
            });

            // Ordenar los años de más reciente a más antiguo
            const aniosOrdenados = Object.keys(serviciosPorAnio).sort((a, b) => b.localeCompare(a));

            return (
              <div
                style={{
                  marginTop: 20,
                  padding: 14,
                  background: "#FFFDF8",
                  borderRadius: 12,
                  border: "1px solid var(--borde)",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontFamily: "'PP Neue Montreal Bold', serif",
                    fontWeight: 600,
                    fontSize: 14.5,
                    color: "var(--verde-monte)",
                    marginBottom: 10,
                  }}
                >
                  📋 Historial Reproductivo ({todosLosServicios.length})
                </span>

                {aniosOrdenados.length === 0 && (
                  <p style={{ fontSize: 12.5, color: "#8A7A63", fontStyle: "italic", margin: 0 }}>
                    Todavía no hay servicios registrados en el historial.
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {aniosOrdenados.map((anio) => (
                    <div key={anio} style={{ background: "#F5F2EC", padding: "10px", borderRadius: "10px" }}>
                      {/* ENCABEZADO DE AÑO */}
                      <div
                        style={{
                          fontWeight: "bold",
                          color: "var(--verde-monte)",
                          fontSize: "13.5px",
                          marginBottom: "8px",
                          borderBottom: "1px solid #E0DCD3",
                          paddingBottom: "4px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        📅 Año {anio}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {[...serviciosPorAnio[anio]].sort((a, b) => {
                          const fechaA = a.inseminacion?.fecha || a.toro?.fecha || "";
                          const fechaB = b.inseminacion?.fecha || b.toro?.fecha || "";
                          return fechaB.localeCompare(fechaA);
                        }).map((serv) => {
                          const idx = serv.originalIndex;
                          return (
                            <div
                              key={idx}
                              style={{
                                padding: "10px 12px",
                                background: "#FFFDF8",
                                borderRadius: 8,
                                fontSize: 13,
                                color: "var(--marron-oscuro)",
                                borderLeft: "4px solid var(--verde-monte)",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                              }}
                            >
                              {/* VISTA DE INSEMINACIÓN */}
                              {serv.inseminacion && (
                                <div style={{ marginBottom: serv.toro ? 8 : 0 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                      💉 <strong>Inseminación:</strong> {formatearFechaDDMMYYYY(parseISO(serv.inseminacion.fecha))}
                                      {serv.inseminacion.nombre && ` — Padre: ${serv.inseminacion.nombre}`}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => eliminarSubServicio(idx, "inseminacion")}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "#C62828",
                                        cursor: "pointer",
                                        fontSize: 14,
                                        padding: "0 4px",
                                      }}
                                      title="Eliminar inseminación"
                                    >
                                      ❌
                                    </button>
                                  </div>

                                  {/* 🔽 LISTA DESPLEGABLE CON CÁLCULOS Y FECHAS CLAVE */}
                                  {serv.inseminacion.calculos && (
                                    <details
                                      style={{
                                        marginTop: 8,
                                        background: "#EFECE6",
                                        padding: "8px 10px",
                                        borderRadius: 8,
                                        border: "1px solid #E0DCD3",
                                      }}
                                    >
                                      <summary
                                        style={{
                                          cursor: "pointer",
                                          fontWeight: "600",
                                          color: "var(--verde-monte)",
                                          fontSize: 12.5,
                                          userSelect: "none",
                                        }}
                                      >
                                        📅 Ver fechas estimadas de parto y repaso
                                      </summary>
                                      <div
                                        style={{
                                          marginTop: 8,
                                          paddingTop: 6,
                                          borderTop: "1px solid #DCD7CD",
                                          fontSize: 12,
                                          lineHeight: 1.6,
                                          color: "var(--marron-oscuro)",
                                        }}
                                      >
                                        <div>
                                          🐂 <strong>Repaso con toro sugerido:</strong> {serv.inseminacion.calculos.repasoSugerido}{" "}
                                          <span style={{ opacity: 0.75, fontSize: 11 }}>(sugerido, no confirmado)</span>
                                        </div>
                                        <div>
                                          🍼 <strong>Parto probable (IA):</strong> {serv.inseminacion.calculos.partoIaDesde} — {serv.inseminacion.calculos.partoIaHasta}{" "}
                                          <span style={{ opacity: 0.75, fontSize: 11 }}>(probable)</span>
                                        </div>
                                        <div>
                                          🐂 <strong>Parto probable (repaso con toro):</strong> desde {serv.inseminacion.calculos.partoRepasoDesde}
                                        </div>
                                      </div>
                                    </details>
                                  )}
                                </div>
                              )}

                              {/* VISTA DE SERVICIO CON TORO / REPASO */}
                              {serv.toro && (
                                <div
                                  style={{
                                    paddingTop: serv.inseminacion ? 8 : 0,
                                    borderTop: serv.inseminacion ? "1px dashed #D5CFC4" : "none",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                      🐂 <strong>{serv.toro.esRepasoToro ? "Repaso con Toro" : "Servicio Toro"}:</strong> {formatearFechaDDMMYYYY(parseISO(serv.toro.fecha))}
                                      {serv.toro.nombre && ` — Padre: ${serv.toro.nombre}`}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => eliminarSubServicio(idx, "toro")}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "#C62828",
                                        cursor: "pointer",
                                        fontSize: 14,
                                        padding: "0 4px",
                                      }}
                                      title="Eliminar servicio con toro"
                                    >
                                      ❌
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        </details>
      )}


      {/* Tacto */}
      {muestraServicio && (
        <details className="seccion-desplegable" style={{ borderTop: "1px dashed var(--borde)", paddingTop: 18, marginBottom: 20 }}>
          <summary
            style={{
              fontFamily: "'PP Neue Montreal Bold', serif",
              fontSize: 18,
              fontWeight: 600,
              color: "#FBF7ED",
              background: "var(--verde-monte)",
              padding: "12px 16px",
              borderRadius: 8,
              margin: "10px 0 14px 0",
              cursor: "pointer",
              userSelect: "none",
              boxSizing: "border-box",
            }}
          >
            Tacto
          </summary>
          <p style={{ fontSize: 12, color: "#8A7A63", margin: "0 0 12px" }}>
            Opcional. Registralo cuando se controle la preñez.
          </p>

          <CampoTexto
            id="fecha-tacto"
            etiqueta="Fecha del tacto"
            tipo="date"
            valor={fechaTacto}
            onChange={setFechaTacto}
          />

          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--marron-oscuro)",
              marginBottom: 6,
            }}
          >
            Resultado
          </label>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}
            role="radiogroup"
            aria-label="Resultado del tacto"
          >
            <button
              type="button"
              role="radio"
              aria-checked={resultadoTacto === "Preniada"}
              className="tipo-btn"
              onClick={() => seleccionarTacto("Preniada")}
              style={{
                padding: "12px 8px",
                borderRadius: 12,
                border: resultadoTacto === "Preniada" ? "2px solid var(--verde-exito)" : "2px solid var(--borde)",
                background: resultadoTacto === "Preniada" ? "var(--verde-exito)" : "#FFFDF8",
                color: resultadoTacto === "Preniada" ? "#FBF7ED" : "var(--marron-oscuro)",
                cursor: "pointer",
                fontFamily: "'PP Neue Montreal Bold', serif",
                fontWeight: 600,
                fontSize: 14.5,
              }}
            >
              Preñada
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={resultadoTacto === "Vacia"}
              className="tipo-btn"
              onClick={() => seleccionarTacto("Vacia")}
              style={{
                padding: "12px 8px",
                borderRadius: 12,
                border: resultadoTacto === "Vacia" ? "2px solid var(--terracota)" : "2px solid var(--borde)",
                background: resultadoTacto === "Vacia" ? "var(--terracota)" : "#FFFDF8",
                color: resultadoTacto === "Vacia" ? "#FBF7ED" : "var(--marron-oscuro)",
                cursor: "pointer",
                fontFamily: "'PP Neue Montreal Bold', serif",
                fontWeight: 600,
                fontSize: 14.5,
              }}
            >
              Vacía
            </button>
          </div>

          {resultadoTacto === "Preniada" && (
            <p style={{ fontSize: 11.5, color: "var(--verde-monte)", margin: "0 0 14px", fontWeight: 500 }}>
              Se conserva la información del servicio ya cargado.
            </p>
          )}
          {resultadoTacto === "Vacia" && (
            <p style={{ fontSize: 11.5, color: "var(--terracota)", margin: "0 0 14px", fontWeight: 500 }}>
              Se registra este resultado. No se modifica el servicio ni se crea una nueva fecha de preñez.
            </p>
          )}

          <label
            htmlFor="observaciones"
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--marron-oscuro)",
              marginBottom: 5,
            }}
          >
            Observaciones
          </label>
          <textarea
            id="observaciones"
            rows={3}
            placeholder="Notas adicionales (opcional)"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              padding: "12px 14px",
              borderRadius: 10,
              border: "2px solid var(--borde)",
              background: "#FFFDF8",
              color: "var(--marron-oscuro)",
              resize: "vertical",
            }}
          />
        </details>
      )}

      {/* Parición */}
      {muestraServicio && (
        <details className="seccion-desplegable" style={{ borderTop: "1px dashed var(--borde)", paddingTop: 18, marginBottom: 20 }}>
          <summary
            style={{
              fontFamily: "'PP Neue Montreal Bold', serif",
              fontSize: 18,
              fontWeight: 600,
              color: "#FBF7ED",
              background: "var(--verde-monte)",
              padding: "12px 16px",
              borderRadius: 8,
              margin: "10px 0 14px 0",
              cursor: "pointer",
              userSelect: "none",
              boxSizing: "border-box",
            }}
          >
            Parición
          </summary>
          <p style={{ fontSize: 12, color: "#8A7A63", margin: "0 0 12px" }}>
            Opcional. Registralo cuando nazca la cría.
          </p>

          <CampoTexto
            id="fecha-paricion"
            etiqueta="Fecha de parición"
            tipo="date"
            valor={fechaParicion}
            onChange={setFechaParicion}
          />

          {proximoServicioSugerido && (
            <div
              style={{
                background: "#EFEBDD",
                border: "1px dashed var(--verde-salvia)",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <CalendarClock size={15} color="var(--verde-monte)" />
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "var(--verde-monte)",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  Calculado automáticamente
                </span>
              </div>
              <FilaCalculo
                etiqueta="Próximo servicio sugerido"
                valor={proximoServicioSugerido}
                detalle="a los 40 días del parto · sugerido"
              />
            </div>
          )}

          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--marron-oscuro)",
              marginBottom: 6,
            }}
          >
            Tipo de cría
          </label>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}
            role="radiogroup"
            aria-label="Tipo de cría"
          >
            <button
              type="button"
              role="radio"
              aria-checked={tipoCria === "Hembra"}
              className="tipo-btn"
              onClick={() => seleccionarTipoCria("Hembra")}
              style={{
                padding: "12px 8px",
                borderRadius: 12,
                border: tipoCria === "Hembra" ? "2px solid var(--verde-monte)" : "2px solid var(--borde)",
                background: tipoCria === "Hembra" ? "var(--verde-monte)" : "#FFFDF8",
                color: tipoCria === "Hembra" ? "#FBF7ED" : "var(--marron-oscuro)",
                cursor: "pointer",
                fontFamily: "'PP Neue Montreal Bold', serif",
                fontWeight: 600,
                fontSize: 14.5,
              }}
            >
              Hembra
              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, fontFamily: "'Inter', sans-serif" }}>
                Ternera
              </div>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={tipoCria === "Macho"}
              className="tipo-btn"
              onClick={() => seleccionarTipoCria("Macho")}
              style={{
                padding: "12px 8px",
                borderRadius: 12,
                border: tipoCria === "Macho" ? "2px solid var(--verde-monte)" : "2px solid var(--borde)",
                background: tipoCria === "Macho" ? "var(--verde-monte)" : "#FFFDF8",
                color: tipoCria === "Macho" ? "#FBF7ED" : "var(--marron-oscuro)",
                cursor: "pointer",
                fontFamily: "'PP Neue Montreal Bold', serif",
                fontWeight: 600,
                fontSize: 14.5,
              }}
            >
              Macho
              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, fontFamily: "'Inter', sans-serif" }}>
                Ternero
              </div>
            </button>
          </div>

          <CampoTexto
            id="caravana-cria"
            etiqueta="Número de caravana de la cría"
            tipo="text"
            placeholder="Ej: 7810"
            valor={caravanaCria}
            onChange={setCaravanaCria}
          />

          <div style={{ marginBottom: 12 }}>
            <label
              htmlFor="peso-nacer"
              style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--marron-oscuro)", marginBottom: 5 }}
            >
              Peso al nacer (kg)
            </label>
            <input
              id="peso-nacer"
              type="number"
              step="0.1"
              placeholder="Ej: 32.5"
              value={pesoNacer || ""}
              onChange={(e) => setPesoNacer(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                padding: "12px 14px",
                borderRadius: 10,
                border: "2px solid var(--borde)",
                background: "#FFFDF8",
                color: "var(--marron-oscuro)",
              }}
            />
          </div>

          {caravanaCria.trim() && (
            <FichaAutomaticaCria
              caravana={caravana}
              caravanaCria={caravanaCria.trim()}
              fechaParicion={fechaParicion}
              tipoCria={tipoCria}
              pesoNacer={pesoNacer}
              nombreServicio={nombrePadreActual}
              muestraServicio={muestraServicio}
              origenCria={origenCria}
              observacionesCria={observacionesCria}
              setObservacionesCria={setObservacionesCria}
            />
          )}

          {Array.isArray(historialCrias) && (
            <div
              style={{
                marginTop: 4,
                marginBottom: 18,
                padding: 14,
                background: "#FFFDF8",
                borderRadius: 12,
                border: "1px solid var(--borde)",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontFamily: "'PP Neue Montreal Bold', serif",
                  fontWeight: 600,
                  fontSize: 14.5,
                  color: "var(--verde-monte)",
                  marginBottom: 10,
                }}

              >
                {/* 1. ACÁ PEGAS EL BOTÓN (Justo antes de que empiece el historial) */}
                <div style={{ marginTop: "8px", marginBottom: "16px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!fechaParicion || !caravanaCria.trim()) {
                        alert("Por favor, ingresá la fecha de parición y el número de caravana de la cría.");
                        return;
                      }

                      if (caravanaCria.trim() === caravana) {
                        alert("La caravana de la cría no puede ser igual a la de la madre.");
                        return;
                      }

                      try {
                        const claveMadre = `animal:${caravana}`;
                        const rawMadre = localStorage.getItem(claveMadre) || "{}";
                        const fichaMadre = JSON.parse(rawMadre);

                        if (!fichaMadre.historialCrias || !Array.isArray(fichaMadre.historialCrias)) {
                          fichaMadre.historialCrias = [];
                        }

                        let padreCalculado = "Sin registrar";
                        let origenCalculado = "Sin registrar";

                        const historialServiciosMadre = fichaMadre.historialServicios || (typeof historialServicios !== "undefined" ? historialServicios : []);
                        const fParto = new Date(fechaParicion + "T00:00:00");

                        for (let i = historialServiciosMadre.length - 1; i >= 0; i--) {
                          const s = historialServiciosMadre[i];
                          if (s.inseminacion && s.inseminacion.fecha) {
                            const fIA = new Date(s.inseminacion.fecha + "T00:00:00");
                            const diasIA = Math.round((fParto - fIA) / (1000 * 60 * 60 * 24));

                            if (diasIA >= 250 && diasIA <= 305) {
                              padreCalculado = s.inseminacion.nombre || "Toro IA (Sin Nombre)";
                              origenCalculado = "Inseminación Artificial";
                              break;
                            }
                            if (diasIA > 305 && s.toro && s.toro.nombre) {
                              padreCalculado = s.toro.nombre;
                              origenCalculado = "Repaso con Toro";
                              break;
                            }
                          }
                          if (s.toro && s.toro.fecha && padreCalculado === "Sin registrar") {
                            const fToro = new Date(s.toro.fecha + "T00:00:00");
                            const diasToro = Math.round((fParto - fToro) / (1000 * 60 * 60 * 24));

                            if (diasToro >= 250 && diasToro <= 310) {
                              padreCalculado = s.toro.nombre || "Toro (Sin Nombre)";
                              origenCalculado = s.toro.esRepasoToro ? "Repaso con Toro" : "Servicio Natural";
                              break;
                            }
                          }
                        }

                        const nuevaCria = {
                          caravana: caravanaCria.trim(),
                          fechaNacimiento: fechaParicion,
                          sexo: tipoCria,
                          pesoNacer: pesoNacer ? `${pesoNacer} kg` : null,
                          nombrePadre: padreCalculado,
                          origen: origenCalculado,
                        };

                        const yaExiste = fichaMadre.historialCrias.some((c) => c.caravana === caravanaCria.trim());
                        const historialCriasActualizado = yaExiste
                          ? fichaMadre.historialCrias.map((c) => (c.caravana === caravanaCria.trim() ? nuevaCria : c))
                          : [...fichaMadre.historialCrias, nuevaCria];

                        fichaMadre.historialCrias = historialCriasActualizado;
                        localStorage.setItem(claveMadre, JSON.stringify(fichaMadre));

                        const claveCria = `animal:${caravanaCria.trim()}`;
                        const fichaCria = {
                          caravana: caravanaCria.trim(),
                          tipo: tipoCria === "Macho" ? "Ternero" : "Ternera", // 👈 AHORA ASIGNA "Ternero" O "Ternera"
                          esCria: true,
                          fechaAlta: new Date().toISOString().slice(0, 10),
                          fechaModificacion: null,
                          fechaNacimiento: fechaParicion,
                          caravanaMadre: caravana, // Toma la caravana de la madre actual
                          nombrePadre: padreCalculado || "Sin registrar",
                          servicio: null,
                          tacto: null,
                          paricion: null,
                          cria: {
                            fechaNacimiento: fechaParicion,
                            sexo: tipoCria,
                            pesoNacer: pesoNacer ? `${pesoNacer} kg` : null,
                            caravanaMadre: caravana,
                            nombrePadre: padreCalculado,
                            origenServicio: origenCalculado,
                            observaciones: observacionesCria ? observacionesCria.trim() : null,
                          },
                        };
                        localStorage.setItem(claveCria, JSON.stringify(fichaCria));

                        if (typeof setHistorialCrias === "function") {
                          setHistorialCrias(historialCriasActualizado);
                        }

                        setFechaParicion("");
                        if (typeof seleccionarTipoCria === "function") seleccionarTipoCria(null);
                        setCaravanaCria("");
                        if (typeof setObservacionesParicion === "function") setObservacionesParicion("");
                        setObservacionesCria("");
                        setPesoNacer("");

                        alert(`✅ Cría N° ${nuevaCria.caravana} agregada al historial correctamente.`);
                      } catch (e) {
                        console.error(e);
                        alert("Ocurrió un error al agregar la cría al historial.");
                      }
                    }}
                    style={{
                      width: "100%",
                      background: "var(--verde-monte)",
                      color: "white",
                      border: "none",
                      padding: "12px 16px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    ➕ Agregar cría al historial
                  </button>
                </div>

                🐄 Historial de Crías ({historialCrias.length})
              </span>
              {historialCrias.length === 0 && (
                <p style={{ fontSize: 12.5, color: "#8A7A63", fontStyle: "italic", margin: "0 0 10px" }}>
                  Todavía no hay crías registradas.
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...historialCrias].sort((a, b) => (b.fechaNacimiento || "").localeCompare(a.fechaNacimiento || "")).map((c) => (
                  <div
                    key={c.caravana}
                    style={{
                      padding: "10px 12px",
                      background: "#F5F2EC",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "var(--marron-oscuro)",
                      borderLeft: "4px solid var(--verde-salvia)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ fontWeight: 700 }}>🐮 N° {c.caravana}</div>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`¿Estás segura de eliminar la cría N° ${c.caravana} del historial?`)) {
                            try {
                              // 1. Filtrar la lista actual
                              const nuevoHistorial = (historialCrias || []).filter((item) => item.caravana !== c.caravana);

                              // 2. Actualizar el estado en React para que desaparezca visualmente
                              if (typeof setHistorialCrias === "function") {
                                setHistorialCrias(nuevoHistorial);
                              }

                              // 3. Guardar la modificación de la madre en el localStorage
                              const claveMadre = `animal:${caravana}`;
                              const rawMadre = localStorage.getItem(claveMadre);
                              if (rawMadre) {
                                const fichaMadre = JSON.parse(rawMadre);
                                fichaMadre.historialCrias = nuevoHistorial;
                                localStorage.setItem(claveMadre, JSON.stringify(fichaMadre));
                              }

                              // 4. Borrar la ficha propia de la cría
                              localStorage.removeItem(`animal:${c.caravana}`);

                              // 5. Forzar actualización de estado si existe la función
                              if (typeof setVersionHistorial === "function") {
                                setVersionHistorial((prev) => prev + 1);
                              }
                            } catch (err) {
                              console.error(err);
                              alert("Ocurrió un error al intentar borrar la cría.");
                            }
                          }
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#C62828",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "0 4px",
                        }}
                        title="Eliminar cría del historial"
                      >
                        ❌
                      </button>
                    </div>
                    <FilaDato etiqueta="Fecha de nacimiento" valor={formatearFechaDDMMYYYY(parseISO(c.fechaNacimiento))} />
                    <FilaDato
                      etiqueta="Sexo"
                      valor={
                        c.sexo === "Hembra" ? "Hembra (ternera)" : c.sexo === "Macho" ? "Macho (ternero)" : null
                      }
                    />
                    <FilaDato etiqueta="Peso al nacer" valor={c.pesoNacer} />
                    <FilaDato etiqueta="Nombre del padre" valor={c.nombrePadre} />
                    <FilaDato etiqueta="Origen" valor={c.origen} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <label
            htmlFor="observaciones-paricion"
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--marron-oscuro)",
              marginBottom: 5,
            }}
          >
            Observaciones
          </label>
          <textarea
            id="observaciones-paricion"
            rows={3}
            placeholder="Notas adicionales (opcional)"
            value={observacionesParicion}
            onChange={(e) => setObservacionesParicion(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              padding: "12px 14px",
              borderRadius: 10,
              border: "2px solid var(--borde)",
              background: "#FFFDF8",
              color: "var(--marron-oscuro)",
              resize: "vertical",
            }}
          />
        </details>
      )}

      {estado === "conflicto" && (
        <Aviso texto="Esta caravana fue registrada por otra persona mientras completabas la ficha. Volvé a buscar para editarla en vez de crear una nueva." />
      )}
      {estado === "error" && <Aviso texto="No se pudo guardar la ficha. Probá de nuevo." />}

      <button
        type="button"
        className="btn-principal"
        disabled={!listoParaGuardar || estado === "guardando"}
        onClick={onGuardar}
        style={{
          width: "100%",
          padding: "16px",
          borderRadius: 12,
          border: "none",
          background: "var(--marron-cuero)",
          color: "#FBF7ED",
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontWeight: 600,
          fontSize: 17,
          cursor: listoParaGuardar ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {estado === "guardando" ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Guardando...
          </>
        ) : enEdicion ? (
          "Guardar cambios"
        ) : (
          "Registrar animal"
        )}
      </button>
    </div>
  );
}

function FichaAutomaticaCria({
  caravana,
  caravanaCria,
  fechaParicion,
  tipoCria,
  pesoNacer,
  nombreServicio,
  muestraServicio,
  origenCria,
  observacionesCria,
  setObservacionesCria,
}) {
  const mismaCaravana = caravanaCria === caravana;
  return (
    <div
      style={{
        background: "#EFEBDD",
        border: "1px dashed var(--verde-salvia)",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Tag size={14} color="var(--verde-monte)" />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--verde-monte)",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          Se creará una ficha propia para esta cría
        </span>
      </div>

      {mismaCaravana ? (
        <p style={{ fontSize: 12.5, color: "var(--terracota)", margin: 0, fontWeight: 600 }}>
          La caravana de la cría no puede ser igual a la de la madre. Corregí el número.
        </p>
      ) : (
        <>
          <FilaDato etiqueta="Caravana" valor={caravanaCria} />
          <FilaDato etiqueta="Fecha de nacimiento" valor={fechaParicion ? formatearFechaDDMMYYYY(parseISO(fechaParicion)) : null} />
          <FilaDato
            etiqueta="Sexo"
            valor={tipoCria === "Hembra" ? "Hembra (ternera)" : tipoCria === "Macho" ? "Macho (ternero)" : null}
          />
          <FilaDato etiqueta="Peso al nacer" valor={pesoNacer ? `${pesoNacer} kg` : null} />
          <FilaDato etiqueta="Caravana de la madre" valor={caravana} />
          <FilaDato
            etiqueta="Nombre del padre"
            valor={muestraServicio ? nombreServicio.trim() || null : null}
          />
          <FilaDato etiqueta="Origen (inseminación / repaso)" valor={etiquetaOrigenCria(origenCria)} />


          {/* Campo de Observaciones de la cría (Limpio, sin código adentro) */}
          <label
            htmlFor="observaciones-cria"
            style={{
              display: "block",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--marron-oscuro)",
              margin: "12px 0 5px",
            }}
          >
            Observaciones de la cría
          </label>
          <textarea
            id="observaciones-cria"
            rows={2}
            placeholder="Notas adicionales sobre la cría (opcional)"
            value={observacionesCria}
            onChange={(e) => setObservacionesCria(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "'Inter', sans-serif",
              fontSize: 13.5,
              padding: "10px 12px",
              borderRadius: 8,
              border: "2px solid var(--borde)",
              background: "#FFFDF8",
              color: "var(--marron-oscuro)",
              resize: "vertical",
            }}
          />

          <p style={{ fontSize: 10.5, color: "#7A6C55", margin: "8px 0 0", lineHeight: 1.35 }}>
            El origen se calcula comparando la fecha de nacimiento con los rangos probables de parto.
            No reemplaza un diagnóstico veterinario ni un análisis genético.
          </p>
        </>
      )}
    </div>
  );
}

function Aviso({ texto }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        background: "#F6E9DE",
        border: "1px solid var(--terracota)",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 18,
      }}
    >
      <AlertTriangle size={18} color="var(--terracota)" style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--marron-oscuro)", lineHeight: 1.4 }}>{texto}</p>
    </div>
  );
}

function CampoTexto({ id, etiqueta, tipo = "text", valor, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        htmlFor={id}
        style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--marron-oscuro)", marginBottom: 5 }}
      >
        {etiqueta}
      </label>
      <input
        id={id}
        type={tipo === "number" ? "text" : tipo}
        inputMode={tipo === "number" ? "text" : undefined}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontFamily: "'Inter', sans-serif",
          fontSize: 15,
          padding: "12px 14px",
          borderRadius: 10,
          border: "2px solid var(--borde)",
          background: "#FFFDF8",
          color: "var(--marron-oscuro)",
        }}
      />
    </div>
  );
}

function PanelCalculos({ calculos }) {
  return (
    <div
      style={{
        background: "#EFEBDD",
        border: "1px dashed var(--verde-salvia)",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <CalendarClock size={15} color="var(--verde-monte)" />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--verde-monte)",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          Calculado automáticamente
        </span>
      </div>

      <FilaCalculo etiqueta="Repaso con toro sugerido" valor={calculos.repasoSugerido} detalle="sugerido, no confirmado" />
      <FilaCalculo
        etiqueta="Parto probable (inseminación)"
        valor={`${calculos.partoInseminacionDesde} — ${calculos.partoInseminacionHasta}`}
        detalle="probable"
      />
      <FilaCalculo etiqueta="Parto probable (repaso con toro)" valor={`desde ${calculos.partoRepasoDesde}`} detalle="probable" />

      <p style={{ fontSize: 10.5, color: "#7A6C55", margin: "8px 0 0", lineHeight: 1.35 }}>
        Estimado en base a la fecha de inseminación. No reemplaza el diagnóstico de un veterinario. Hasta
        que nazca la cría no se sabe si la preñez fue por inseminación o por repaso.
      </p>
    </div>
  );
}

function FilaCalculo({ etiqueta, valor, detalle }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: "#6B5A45" }}>{etiqueta}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--marron-cuero-oscuro)" }}>{valor}</span>
      </div>
      <div style={{ fontSize: 10, color: "#8A7A63", fontStyle: "italic", textAlign: "right" }}>{detalle}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Pantalla 3: Confirmación                                          */
/* ---------------------------------------------------------------- */

function FichaGuardada({ caravana, tipo, modo, resultadoCria, onBuscarOtra }) {
  const esEdicion = modo === "edicion";
  return (
    <div
      style={{
        background: "var(--crema)",
        border: "1px solid var(--borde)",
        borderRadius: 16,
        padding: "28px 20px",
        textAlign: "center",
        boxShadow: "0 2px 10px rgba(59,42,29,0.06)",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: "50%",
          background: "var(--verde-exito)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 14px",
        }}
      >
        <Check size={24} color="#FBF7ED" strokeWidth={3} />
      </div>

      <p style={{ margin: "0 0 18px", fontSize: 15, color: "var(--marron-oscuro)", fontWeight: 600 }}>
        {esEdicion ? "Ficha actualizada correctamente" : "Animal registrado correctamente"}
      </p>

      <div style={{ background: "var(--verde-monte)", borderRadius: 12, padding: "16px 28px", marginBottom: 22 }}>
        <div style={{ fontFamily: "'PP Neue Montreal Bold', serif", fontSize: 30, fontWeight: 700, color: "#FBF7ED" }}>
          {caravana}
        </div>
        <div style={{ fontSize: 13, color: "var(--verde-salvia)", fontWeight: 600, marginTop: 2 }}>
          {tipo}
        </div>
      </div>

      {resultadoCria === "creada" && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--verde-monte)", fontWeight: 600 }}>
          ✅ Se creó automáticamente la ficha de la cría.
        </p>
      )}
      {resultadoCria === "actualizada" && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--verde-monte)", fontWeight: 600 }}>
          ✅ Se actualizó la ficha existente de la cría.
        </p>
      )}
      {resultadoCria === "conflicto" && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--terracota)", fontWeight: 600 }}>
          ⚠️ No se pudo crear la ficha de la cría (esa caravana ya existe con otro dueño).
        </p>
      )}

      {resultadoCria === "creada" && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--verde-monte)", fontWeight: 600 }}>
          ✅ Se creó automáticamente la ficha de la cría.
        </p>
      )}
      {resultadoCria === "actualizada" && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--verde-monte)", fontWeight: 600 }}>
          ✅ Se actualizó la ficha existente de la cría.
        </p>
      )}
      {resultadoCria === "conflicto" && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--terracota)", fontWeight: 600 }}>
          ⚠️ No se pudo crear la ficha de la cría (esa caravana ya existe con otro dueño).
        </p>
      )}

      <button
        type="button"
        onClick={onBuscarOtra}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 12,
          border: "2px solid var(--marron-cuero)",
          background: "transparent",
          color: "var(--marron-cuero-oscuro)",
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontWeight: 600,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        Buscar otra caravana
      </button>
    </div>
  );
}

function FilaDato({ etiqueta, valor }) {
  const tieneValor = valor !== null && valor !== undefined && valor !== "";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", fontSize: 13.5 }}>
      <span style={{ color: "#6B5A45" }}>{etiqueta}</span>
      <span
        style={{
          color: tieneValor ? "var(--marron-oscuro)" : "#A89A82",
          fontStyle: tieneValor ? "normal" : "italic",
          fontWeight: tieneValor ? 600 : 400,
          textAlign: "right",
        }}
      >
        {tieneValor ? valor : "Sin registrar"}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* CHATBOT: motor de respuestas (interpreta preguntas simples)       */
/* ---------------------------------------------------------------- */

// Saca tildes y pasa todo a minúscula, para que dé lo mismo escribir
// "cuántas" que "cuantas" o "PREÑADA" que "preniada".
function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Suma o resta días a un objeto Date (no a un texto), para calcular "ayer", "anteayer", etc.
function sumarDiasDate(date, dias) {
  const d = new Date(date);
  d.setDate(d.getDate() + dias);
  return d;
}

// Avisa a toda la app que los datos cambiaron, para que las pantallas
// que ya estaban abiertas (Inicio, Listado, Alertas) se actualicen solas.
function emitirActualizacionDatos() {
  try {
    window.dispatchEvent(new Event("agrodata:actualizado"));
  } catch (e) {
    // no pasa nada si el navegador no lo soporta
  }
}

// Detecta si el mensaje es una ORDEN para cargar un dato (no una pregunta).
function esComandoDeCarga(preguntaNorm) {
  const verbos = ["anota", "anot", "registra", "registr", "carga", "carg", "guarda", "guard",
    "agrega", "agreg", "recordame", "recuerdame",
    "pone", "pon ", "cambia", "cambi", "actualiza", "actualiz",
    "corrige", "corrig", "modifica", "modific", "completa", "complet",];
  const disparadoresAlta = ["alta", "animal nuevo", "nueva ficha", "ficha nueva", "crea la ficha", "da de alta un animal"];
  // Frases del tipo "la A058 es una vaca" / "es un toro", sin necesidad
  // de un verbo de carga explícito.
  const mencionaCategoria = TIPOS.some((t) => preguntaNorm.includes(normalizarTexto(t.valor)));
  const esDescripcion = (preguntaNorm.includes("es un ") || preguntaNorm.includes("es una ")) && mencionaCategoria;

  return (
    verbos.some((v) => preguntaNorm.includes(v)) ||
    disparadoresAlta.some((d) => preguntaNorm.includes(d)) ||
    esDescripcion
  );
}

// Averigua qué fecha corresponde: "ayer", "anteayer", una fecha escrita
// (15/03) o, si no se dice nada, hoy.
function fechaDeComando(preguntaNorm) {
  if (preguntaNorm.includes("anteayer")) return fechaAISO(sumarDiasDate(new Date(), -2));
  if (preguntaNorm.includes("ayer")) return fechaAISO(sumarDiasDate(new Date(), -1));
  const matchFecha = preguntaNorm.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (matchFecha) {
    const dia = matchFecha[1].padStart(2, "0");
    const mes = matchFecha[2].padStart(2, "0");
    const anio = matchFecha[3] ? (matchFecha[3].length === 2 ? `20${matchFecha[3]}` : matchFecha[3]) : String(new Date().getFullYear());
    return `${anio}-${mes}-${dia}`;
  }
  return fechaAISO(new Date());
}

// Busca en el mensaje los números de caravana mencionados (puede haber
// uno solo, o dos si es una parición: madre y cría).
function extraerCaravanasDeComando(preguntaOriginal) {
  const tokens = preguntaOriginal.split(/\s+/);
  const disparadores = ["la", "el", "n", "n°", "nº", "numero", "número", "caravana", "cria", "cría"];
  const encontradas = [];
  for (let i = 0; i < tokens.length; i++) {
    const tokenNorm = normalizarTexto(tokens[i]).replace(/[°º.,;:]/g, "");
    if (disparadores.includes(tokenNorm) && tokens[i + 1]) {
      const candidato = tokens[i + 1].replace(/[.,;:?¡!]/g, "");
      if (/\d/.test(candidato) && !encontradas.includes(candidato)) encontradas.push(candidato);
    }
  }
  if (encontradas.length === 0) {
    for (const t of tokens) {
      const limpio = t.replace(/[.,;:?¡!]/g, "");
      if (/^[A-Za-z]{0,3}\d{1,6}[A-Za-z]{0,2}$/.test(limpio) && !/^20\d{2}$/.test(limpio)) {
        encontradas.push(limpio);
      }
    }
  }
  return encontradas;
}

// Busca un peso mencionado, tipo "32 kilos" o "32.5 kg".
function extraerPesoDeComando(preguntaOriginal) {
  const match = preguntaOriginal.match(/(\d+[.,]?\d*)\s*(kg|kilo|kilos)/i);
  if (!match) return "";
  return match[1].replace(",", ".");
}

// Busca un nombre (de toro o pajuela) que venga después de una palabra clave.
function extraerNombreDeComando(preguntaOriginal, disparadorRegex) {
  const regex = new RegExp(disparadorRegex + "\\s+([A-Za-zÀ-ÿ0-9\\s]{2,30})", "i");
  const match = preguntaOriginal.match(regex);
  if (!match) return "";
  return match[1].split(/[.,;]/)[0].trim();
}


// Arma el "esqueleto" de una ficha nueva, con el mismo formato que usa
// el resto de la app al guardar desde el formulario.
function crearFichaNueva(caravana, tipo, raza) {
  return {
    caravana,
    tipo: tipo || null,
    raza: raza ? raza.trim() : null,
    fechaNacimiento: null,
    caravanaMadre: null,
    nombrePadre: null,
    observacionesAnimal: null,
    fechaAlta: fechaAISO(new Date()),
    fechaModificacion: null,
    servicio: null,
    historialServicios: [],
    historialCrias: [],
    tacto: null,
    paricion: null,
  };
}


// Busca si la pregunta menciona el número de una caravana existente.
// Primero intenta una coincidencia exacta (respetando mayúsculas/minúsculas,
// tal como pide el resto de la app) y, si no encuentra nada, prueba sin
// importar mayúsculas, por si el usuario lo dictó por voz.
function extraerAnimalMencionado(preguntaOriginal, animales) {
  const palabras = preguntaOriginal.split(/[\s,.;:?¿!¡]+/).filter(Boolean);

  for (const palabra of palabras) {
    const exacto = animales.find((a) => a.caravana === palabra);
    if (exacto) return exacto;
  }
  for (const palabra of palabras) {
    const insensible = animales.find(
      (a) => a.caravana.toLowerCase() === palabra.toLowerCase()
    );
    if (insensible) return insensible;
  }
  return null;
}

// Encuentra a qué categoría (Vaca, Toro, etc.) se refiere la pregunta.
function extraerCategoriaMencionada(preguntaNorm) {
  return TIPOS.find((t) => preguntaNorm.includes(normalizarTexto(t.valor)))?.valor || null;
}

// Recibe la orden escrita/dictada. Si es un comando de carga válido,
// guarda el dato y devuelve el mensaje de confirmación. Si no es un
// comando (es una pregunta), devuelve null para que se siga tratando
// como pregunta normal.
function intentarProcesarComando(preguntaOriginal) {
  const p = normalizarTexto(preguntaOriginal);
  if (!esComandoDeCarga(p)) return null;

  const fecha = fechaDeComando(p);
  const caravanas = extraerCaravanasDeComando(preguntaOriginal);

  // --- RECORDATORIO / TAREA (no necesita caravana) ---
  if (p.includes("recordame") || p.includes("recuerdame") || (p.includes("tarea") && caravanas.length === 0)) {
    const texto = preguntaOriginal
      .replace(/(anota|anot[aá]|registr[aá]|carg[aá]|guard[aá]|agreg[aá]|recordame|recu[eé]rdame)/gi, "")
      .replace(/\b(hoy|ayer|anteayer)\b/gi, "")
      .trim();
    guardarTareaManual({ id: `${Date.now()}`, fecha, texto: texto || "Recordatorio", completada: false });
    emitirActualizacionDatos();
    return `📌 Anotado. Te lo recuerdo para el ${formatearFechaDDMMYYYY(parseISO(fecha))}.`;
  }

  if (caravanas.length === 0) {
    return "Entendí que querés cargar algo, pero no reconocí el número de caravana. Probá diciendo, por ejemplo: 'anotá que la 102 tuvo tacto positivo hoy'.";
  }

  const caravanaMadre = caravanas[0];
  const claveMadre = `animal:${caravanaMadre}`;
  let ficha = leerAnimalPorCaravana(caravanaMadre);

  // --- ALTA DE FICHA NUEVA (explícita: "dar de alta", "animal nuevo", etc.) ---
  if (p.includes("alta") || p.includes("animal nuevo") || p.includes("ficha nueva") || p.includes("crear la ficha") ||p.includes("nueva ficha")) {
    if (ficha) {
      return `La caravana N° ${caravanaMadre} ya existe (${ficha.tipo || "sin categoría"}). Si querés agregarle un dato, decime cuál (tacto, servicio, parición).`;
    }
    const categoria = extraerCategoriaMencionada(p);
    const raza = extraerNombreDeComando(preguntaOriginal, "(raza)");
    const fichaNueva = crearFichaNueva(caravanaMadre, categoria, raza);
    localStorage.setItem(claveMadre, JSON.stringify(fichaNueva));
    emitirActualizacionDatos();
    return `✅ Listo. Creé la ficha nueva N° ${caravanaMadre}${categoria ? ` (${categoria})` : ""}${raza ? `, raza ${raza}` : ""}. Ya la podés completar desde el formulario o seguir cargándole datos por acá.`;
  }

  // Si la ficha no existe pero la orden menciona una categoría (vaca, toro, etc.),
  // se crea automáticamente y se sigue procesando el resto de la orden.
  if (!ficha) {
    const categoria = extraerCategoriaMencionada(p);
    if (!categoria) {
      return `No encontré ninguna ficha con la caravana N° ${caravanaMadre}. Puedo crearla si me decís la categoría, por ejemplo: "dar de alta animal nuevo, caravana ${caravanaMadre}, vaca".`;
    }
    ficha = crearFichaNueva(caravanaMadre, categoria, "");
    localStorage.setItem(claveMadre, JSON.stringify(ficha));
    emitirActualizacionDatos();
  }

    // --- COMPLETAR / CORREGIR LA CATEGORÍA de una ficha que ya existe ---
  // (por ejemplo, cuando no se detalló al cargarla por primera vez)
  const categoriaMencionada = extraerCategoriaMencionada(p);
  const esSobreOtroDato =
    p.includes("tacto") || p.includes("insemin") || p.includes("toro") || p.includes("repaso") ||
    p.includes("pario") || p.includes("nacio") || p.includes("cria") ||
    p.includes("ternero") || p.includes("ternera") || p.includes("alta") ||
    p.includes("animal nuevo") || p.includes("nueva ficha") || p.includes("ficha nueva");

  if (categoriaMencionada && !esSobreOtroDato) {
    const categoriaAnterior = ficha.tipo;
    ficha.tipo = categoriaMencionada;
    localStorage.setItem(claveMadre, JSON.stringify(ficha));
    emitirActualizacionDatos();
    return categoriaAnterior
      ? `✅ Listo. Cambié la categoría de la N° ${caravanaMadre} de ${categoriaAnterior} a ${categoriaMencionada}.`
      : `✅ Listo. Completé la categoría de la N° ${caravanaMadre}: ${categoriaMencionada}.`;
  }

  // --- TACTO ---
  if (p.includes("tacto")) {
    let resultado = null;
    if (p.includes("positiv") || p.includes("preniad") || p.includes("prenad")) resultado = "Preniada";
    if (p.includes("negativ") || p.includes("vacia")) resultado = "Vacia";
    if (!resultado) {
      return `Entendí que querés registrar un tacto para la N° ${caravanaMadre}, pero no quedó claro si fue positivo o negativo.`;
    }
    ficha.tacto = { fecha, resultado, observaciones: ficha.tacto?.observaciones || null };
    localStorage.setItem(claveMadre, JSON.stringify(ficha));
    emitirActualizacionDatos();
    return `✅ Listo. Registré el tacto de la N° ${caravanaMadre} como ${resultado === "Preniada" ? "Preñada" : "Vacía"} (${formatearFechaDDMMYYYY(parseISO(fecha))}).`;
  }

  // --- SERVICIO: INSEMINACIÓN ---
  if (p.includes("insemin")) {
    const nombre = extraerNombreDeComando(preguntaOriginal, "(pajuela|con|de)");
    if (!Array.isArray(ficha.historialServicios)) ficha.historialServicios = [];
    ficha.historialServicios.push({
      inseminacion: { fecha, nombre, calculos: calcularFechasInseminacion(fecha) },
    });
    localStorage.setItem(claveMadre, JSON.stringify(ficha));
    emitirActualizacionDatos();
    return `✅ Listo. Registré la inseminación de la N° ${caravanaMadre} el ${formatearFechaDDMMYYYY(parseISO(fecha))}${nombre ? ` (${nombre})` : ""}.`;
  }

  // --- SERVICIO: TORO / REPASO ---
  if (p.includes("toro") || p.includes("repaso")) {
    const nombre = extraerNombreDeComando(preguntaOriginal, "(toro|con)");
    const esRepaso = p.includes("repaso");
    if (!Array.isArray(ficha.historialServicios)) ficha.historialServicios = [];
    ficha.historialServicios.push({ toro: { fecha, nombre, esRepasoToro: esRepaso } });
    localStorage.setItem(claveMadre, JSON.stringify(ficha));
    emitirActualizacionDatos();
    return `✅ Listo. Registré el servicio con toro de la N° ${caravanaMadre} el ${formatearFechaDDMMYYYY(parseISO(fecha))}${nombre ? ` (${nombre})` : ""}.`;
  }

  // --- PARICIÓN ---
  if (p.includes("pario") || p.includes("nacio") || p.includes("cria") || p.includes("ternero") || p.includes("ternera")) {
    const caravanaCria = caravanas[1] || null;
    let sexo = null;
    if (p.includes("hembra") || p.includes("ternera")) sexo = "Hembra";
    if (p.includes("macho") || p.includes("ternero")) sexo = "Macho";
    const peso = extraerPesoDeComando(preguntaOriginal);

    if (!caravanaCria) {
      return `Entendí que la N° ${caravanaMadre} tuvo una cría, pero me falta el número de caravana de la cría. Probá: 'la ${caravanaMadre} parió ${sexo === "Macho" ? "un macho" : "una hembra"}, caravana [número]'.`;
    }
    if (caravanaCria === caravanaMadre) {
      return "La caravana de la cría no puede ser igual a la de la madre.";
    }

    const padreYOrigenCalc = determinarPadreYOrigen(ficha.historialServicios || [], fecha);

    ficha.paricion = {
      fecha,
      tipoCria: sexo,
      caravanaCria,
      proximoServicioSugerido: calcularProximoServicio(fecha),
      observaciones: ficha.paricion?.observaciones || null,
    };
    if (!Array.isArray(ficha.historialCrias)) ficha.historialCrias = [];
    const nuevaCria = {
      caravana: caravanaCria,
      fechaNacimiento: fecha,
      sexo,
      pesoNacer: peso ? `${peso} kg` : null,
      nombrePadre: padreYOrigenCalc.padre,
      origen: padreYOrigenCalc.origen,
    };
    const yaExiste = ficha.historialCrias.some((c) => c.caravana === caravanaCria);
    ficha.historialCrias = yaExiste
      ? ficha.historialCrias.map((c) => (c.caravana === caravanaCria ? nuevaCria : c))
      : [...ficha.historialCrias, nuevaCria];
    localStorage.setItem(claveMadre, JSON.stringify(ficha));

    const claveCria = `animal:${caravanaCria}`;
    const fichaCriaExistente = leerAnimalPorCaravana(caravanaCria);
    const fichaCria = {
      caravana: caravanaCria,
      tipo: sexo === "Macho" ? "Ternero" : "Ternera",
      esCria: true,
      fechaAlta: fichaCriaExistente?.fechaAlta || fechaAISO(new Date()),
      fechaModificacion: fichaCriaExistente ? fechaAISO(new Date()) : null,
      fechaNacimiento: fecha,
      caravanaMadre,
      nombrePadre: padreYOrigenCalc.padre,
      servicio: null,
      tacto: null,
      paricion: null,
      cria: {
        fechaNacimiento: fecha,
        sexo,
        pesoNacer: peso ? `${peso} kg` : null,
        caravanaMadre,
        nombrePadre: padreYOrigenCalc.padre,
        origenServicio: padreYOrigenCalc.origen,
        observaciones: null,
      },
    };
    localStorage.setItem(claveCria, JSON.stringify(fichaCria));
    emitirActualizacionDatos();

    return `✅ Listo. Registré que la N° ${caravanaMadre} parió ${sexo === "Macho" ? "un macho" : sexo === "Hembra" ? "una hembra" : "una cría"} (N° ${caravanaCria}) el ${formatearFechaDDMMYYYY(parseISO(fecha))}${peso ? `, ${peso} kg` : ""}.`;
  }

  return `Entendí que querés cargar algo para la N° ${caravanaMadre}, pero no reconocí bien qué (¿tacto, inseminación, servicio con toro o parición?).`;
}

// Función principal: recibe la pregunta escrita/dictada y devuelve el
// texto de la respuesta. Todo se calcula en el momento a partir de lo
// que ya está guardado — el chatbot no inventa ni guarda nada nuevo.
function responderPregunta(preguntaOriginal) {
  const p = normalizarTexto(preguntaOriginal);
  const animales = leerTodosLosAnimalesGuardados();
  const hoy = new Date();

  // 1. Saludo / ayuda
  if (p.includes("ayuda") || p.includes("que puedo preguntar") || p === "hola") {
    return (
      "Podés preguntarme cosas como:\n" +
      "• ¿Cuántas vacas preñadas / vacías tengo?\n" +
      "• ¿Cómo está la [caravana]?\n" +
      "• ¿Cuándo nació / fue inseminada / tuvo tacto la [caravana]?\n" +
      "• ¿Qué tareas o alertas tengo hoy?\n" +
      "• ¿Qué vacunas le tocan a los terneros / vacas / toros / vaquillonas?\n" +
      "• ¿Qué se aplicó últimamente en sanidad?\n" +
      "• ¿Quién es el padre / la madre / las crías de la [caravana]?"
    );
  }

  const animalMencionado = extraerAnimalMencionado(preguntaOriginal, animales);

  // 2. FECHAS de un animal puntual (nacimiento, inseminación, tacto, parto)
  if (animalMencionado && (p.includes("cuando") || p.includes("fecha"))) {
    if (p.includes("nacio") || p.includes("nacimiento")) {
      return animalMencionado.fechaNacimiento
        ? `La N° ${animalMencionado.caravana} nació el ${formatearFechaDDMMYYYY(parseISO(animalMencionado.fechaNacimiento))}.`
        : `No hay fecha de nacimiento registrada para la N° ${animalMencionado.caravana}.`;
    }

    if (p.includes("insemin")) {
      const ultimo = Array.isArray(animalMencionado.historialServicios) && animalMencionado.historialServicios.length > 0
        ? animalMencionado.historialServicios[animalMencionado.historialServicios.length - 1]
        : animalMencionado.servicio || null;
      const fecha = ultimo?.inseminacion?.fecha;
      return fecha
        ? `La última inseminación de la N° ${animalMencionado.caravana} fue el ${formatearFechaDDMMYYYY(parseISO(fecha))}.`
        : `No hay ninguna inseminación registrada para la N° ${animalMencionado.caravana}.`;
    }

    if (p.includes("toro") || p.includes("servicio")) {
      const ultimo = Array.isArray(animalMencionado.historialServicios) && animalMencionado.historialServicios.length > 0
        ? animalMencionado.historialServicios[animalMencionado.historialServicios.length - 1]
        : animalMencionado.servicio || null;
      const fecha = ultimo?.toro?.fecha;
      return fecha
        ? `El último servicio con toro de la N° ${animalMencionado.caravana} fue el ${formatearFechaDDMMYYYY(parseISO(fecha))}.`
        : `No hay ningún servicio con toro registrado para la N° ${animalMencionado.caravana}.`;
    }

    if (p.includes("tacto")) {
      return animalMencionado.tacto?.fecha
        ? `El último tacto de la N° ${animalMencionado.caravana} fue el ${formatearFechaDDMMYYYY(parseISO(animalMencionado.tacto.fecha))}, resultado: ${animalMencionado.tacto.resultado === "Preniada" ? "Preñada" : "Vacía"}.`
        : `No hay tacto registrado para la N° ${animalMencionado.caravana}.`;
    }

    if (p.includes("paric") || p.includes("parto") || p.includes("pario") || p.includes("parir")) {
      return animalMencionado.paricion?.fecha
        ? `La N° ${animalMencionado.caravana} parió el ${formatearFechaDDMMYYYY(parseISO(animalMencionado.paricion.fecha))}.`
        : `La N° ${animalMencionado.caravana} todavía no tiene parición registrada.`;
    }
  }

  // 3. Otras preguntas sobre UN animal puntual (estado, padre, madre, crías)
  if (animalMencionado) {
    const estado = estadoReproductivoDe(animalMencionado);

    if (p.includes("padre")) {
      const padre = animalMencionado.nombrePadre || animalMencionado.cria?.nombrePadre;
      return padre
        ? `El padre registrado de la N° ${animalMencionado.caravana} es ${padre}.`
        : `Todavía no hay un padre registrado para la N° ${animalMencionado.caravana}.`;
    }

    if (p.includes("madre")) {
      const madre = animalMencionado.caravanaMadre || animalMencionado.cria?.caravanaMadre;
      return madre
        ? `La madre registrada de la N° ${animalMencionado.caravana} es la N° ${madre}.`
        : `Todavía no hay una madre registrada para la N° ${animalMencionado.caravana}.`;
    }

    if (p.includes("cria") || p.includes("hijo")) {
      const crias = Array.isArray(animalMencionado.historialCrias) ? animalMencionado.historialCrias : [];
      if (crias.length === 0) return `La N° ${animalMencionado.caravana} todavía no tiene crías registradas.`;
      const lista = crias.map((c) => `N° ${c.caravana}`).join(", ");
      return `La N° ${animalMencionado.caravana} tiene ${crias.length} cría(s) registrada(s): ${lista}.`;
    }

    if (p.includes("cuando para") || p.includes("proxima accion") || p.includes("proximo")) {
      const accion = obtenerProximaAccion(animalMencionado);
      return accion
        ? `Para la N° ${animalMencionado.caravana}: ${accion}`
        : `Todavía no hay datos suficientes para estimar el próximo evento de la N° ${animalMencionado.caravana}.`;
    }

    // Por defecto: estado general del animal
    return estado
      ? `La N° ${animalMencionado.caravana} (${animalMencionado.tipo || "sin categoría"}) está: ${estado.texto}.`
      : `La N° ${animalMencionado.caravana} es ${animalMencionado.tipo || "sin categoría"}. No tiene estado reproductivo cargado.`;
  }

  // 4. SANIDAD: plan de vacunas por categoría
  if (p.includes("vacuna") || p.includes("plan sanitario") || p.includes("sanidad")) {
    const categoria = ["terneros", "vaquillonas", "vacas", "toros"].find((c) => p.includes(c));

    if (categoria) {
      const nombreCategoria = categoria.charAt(0).toUpperCase() + categoria.slice(1);
      const tareas = PLANES_SANITARIOS[nombreCategoria] || [];
      const lista = tareas.map((t) => `• ${t.tarea} (${t.meses})`).join("\n");
      return `Plan sanitario para ${nombreCategoria}:\n${lista}`;
    }

    // Últimas aplicaciones cargadas en la pantalla de Sanidad
    if (p.includes("ultim") || p.includes("aplico") || p.includes("aplicacion")) {
      const registros = leerRegistrosSanidad()
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 5);
      if (registros.length === 0) return "Todavía no hay aplicaciones de sanidad registradas.";
      const lista = registros
        .map((r) => `• ${r.texto.replace("💉 Sanidad: ", "")} — ${r.fecha}`)
        .join("\n");
      return `Últimas aplicaciones registradas:\n${lista}`;
    }

    return "Decime sobre qué categoría querés el plan sanitario: terneros, vaquillonas, vacas o toros.";
  }

  // 5. Conteos generales ("¿cuántas vacas tengo?", "¿cuántas preñadas?")
  if (p.includes("cuant")) {
    const categoria = extraerCategoriaMencionada(p);
    let base = categoria ? animales.filter((a) => a.tipo === categoria) : animales;

    if (p.includes("prenad") || p.includes("preniad")) {
      base = base.filter((a) => estadoReproductivoDe(a)?.texto === "Preñada");
      return `Tenés ${base.length} animal(es) preñado(s)${categoria ? ` en la categoría ${categoria}` : ""}.`;
    }
    if (p.includes("vacia")) {
      base = base.filter((a) => estadoReproductivoDe(a)?.texto === "Vacía");
      return `Tenés ${base.length} animal(es) vacío(s)${categoria ? ` en la categoría ${categoria}` : ""}.`;
    }
    if (p.includes("parida")) {
      base = base.filter((a) => estadoReproductivoDe(a)?.texto === "Parida");
      return `Tenés ${base.length} animal(es) parido(s)${categoria ? ` en la categoría ${categoria}` : ""}.`;
    }
    return categoria
      ? `Tenés ${base.length} animal(es) en la categoría ${categoria}.`
      : `Tenés ${animales.length} animal(es) registrados en total.`;
  }

  // 6. Tareas / pendientes / alertas de hoy
  if (p.includes("tarea") || p.includes("pendiente") || (p.includes("hoy") && p.includes("hacer"))) {
    const tareas = leerTareasManuales().filter((t) => !t.completada);
    let totalAlertas = 0;
    animales.forEach((f) => (totalAlertas += obtenerAlertasDe(f, hoy).length));
    if (tareas.length === 0 && totalAlertas === 0) return "No tenés tareas ni alertas pendientes por ahora. 🎉";
    const partesTareas = tareas.slice(0, 5).map((t) => `• ${t.texto}${t.fecha ? ` (${t.fecha})` : ""}`);
    return (
      `Tenés ${totalAlertas} alerta(s) automática(s) y ${tareas.length} tarea(s) manual(es) pendiente(s).` +
      (partesTareas.length ? `\n${partesTareas.join("\n")}` : "")
    );
  }

  // 7. Tactos pendientes (en general)
  if (p.includes("tacto")) {
    const conTactoPendiente = [];
    animales.forEach((f) => {
      obtenerAlertasDe(f, hoy).forEach((a) => {
        if (a.tipo === "tacto") conTactoPendiente.push(f.caravana);
      });
    });
    return conTactoPendiente.length === 0
      ? "No hay animales con tacto pendiente por ahora."
      : `Tenés ${conTactoPendiente.length} animal(es) con tacto pendiente: ${conTactoPendiente.join(", ")}.`;
  }

  // 8. Próximos partos (en general, sin nombrar una caravana)
  if (p.includes("parto") || p.includes("parir")) {
    const proximos = [];
    animales.forEach((f) => {
      obtenerAlertasDe(f, hoy).forEach((a) => {
        if (a.tipo === "parto") proximos.push({ caravana: f.caravana, etiqueta: a.etiqueta });
      });
    });
    if (proximos.length === 0) return "No hay partos próximos detectados por ahora.";
    const lista = proximos.map((x) => `N° ${x.caravana} (${x.etiqueta})`).join(", ");
    return `Partos próximos: ${lista}.`;
  }

  // 9. No se entendió la pregunta
  return (
    "No entendí bien esa pregunta 🤔. Probá preguntarme algo como:\n" +
    "'¿cuántas vacas preñadas tengo?', '¿cuándo nació la 102?' o '¿qué vacunas le tocan a los terneros?'"
  );
}

/* ---------------------------------------------------------------- */
/* CHATBOT: componente visual (botón flotante + ventana de chat)     */
/* ---------------------------------------------------------------- */

function ChatBot() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([
    {
      autor: "bot",
      texto: "¡Hola! Preguntame algo sobre tus animales. Por ejemplo: '¿cuántas vacas preñadas tengo?'",
    },
  ]);
  const [entrada, setEntrada] = useState("");
  const [escuchando, setEscuchando] = useState(false);
  const reconocimientoRef = useRef(null);
  const listaRef = useRef(null);

  // Configura el reconocimiento de voz una sola vez (si el navegador lo soporta)
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    const reconocimiento = new SpeechRecognitionAPI();
    reconocimiento.lang = "es-AR";
    reconocimiento.continuous = false;
    reconocimiento.interimResults = false;
    reconocimiento.onresult = (evento) => {
      const texto = evento.results[0][0].transcript;
      enviarPregunta(texto);
    };
    reconocimiento.onend = () => setEscuchando(false);
    reconocimiento.onerror = () => setEscuchando(false);
    reconocimientoRef.current = reconocimiento;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Baja el scroll al último mensaje cada vez que se agrega uno nuevo
  useEffect(() => {
    if (listaRef.current) {
      listaRef.current.scrollTop = listaRef.current.scrollHeight;
    }
  }, [mensajes]);

  const soportaVoz = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const iniciarEscucha = () => {
    if (!reconocimientoRef.current || escuchando) return;
    setEscuchando(true);
    reconocimientoRef.current.start();
  };

  const enviarPregunta = (textoManual) => {
    const pregunta = (textoManual !== undefined ? textoManual : entrada).trim();
    if (!pregunta) return;

    const respuestaComando = intentarProcesarComando(pregunta);
    const respuesta = respuestaComando !== null ? respuestaComando : responderPregunta(pregunta);

    setMensajes((prev) => [
      ...prev,
      { autor: "usuario", texto: pregunta },
      { autor: "bot", texto: respuesta },
    ]);
    setEntrada("");

    // Lee la respuesta en voz alta, si el navegador lo permite
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(respuesta);
      utterance.lang = "es-AR";
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <>
      {/* Botón flotante para abrir/cerrar el chat */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Abrir asistente"
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          background: "var(--verde-monte)",
          color: "#FBF7ED",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
          cursor: "pointer",
          zIndex: 300,
        }}
      >
        {abierto ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* Ventana de chat */}
      {abierto && (
        <div
          style={{
            position: "fixed",
            bottom: 86,
            right: 20,
            width: 320,
            maxWidth: "90vw",
            height: 440,
            maxHeight: "70vh",
            background: "var(--crema)",
            border: "1px solid var(--borde)",
            borderRadius: 16,
            boxShadow: "0 6px 24px rgba(0,0,0,0.2)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 300,
          }}
        >
          {/* Encabezado */}
          <div
            style={{
              background: "var(--verde-monte)",
              color: "#FBF7ED",
              padding: "12px 14px",
              fontFamily: "'PP Neue Montreal Bold', serif",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Asistente de AgroData
          </div>

          {/* Mensajes */}
          <div
            ref={listaRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {mensajes.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.autor === "usuario" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: m.autor === "usuario" ? "var(--verde-monte)" : "#F5F2EC",
                  color: m.autor === "usuario" ? "#FBF7ED" : "var(--marron-oscuro)",
                  padding: "8px 12px",
                  borderRadius: 12,
                  fontSize: 13,
                  whiteSpace: "pre-line",
                  lineHeight: 1.4,
                }}
              >
                {m.texto}
              </div>
            ))}
          </div>

          {/* Entrada de texto + botones */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: 10,
              borderTop: "1px solid var(--borde)",
              background: "#FFFDF8",
            }}
          >
            <input
              type="text"
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enviarPregunta();
              }}
              placeholder="Escribí tu pregunta..."
              style={{
                flex: 1,
                boxSizing: "border-box",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                padding: "10px 12px",
                borderRadius: 10,
                border: "2px solid var(--borde)",
                background: "#FFFDF8",
                color: "var(--marron-oscuro)",
              }}
            />
            {soportaVoz && (
              <button
                type="button"
                onClick={iniciarEscucha}
                title="Preguntar por voz"
                style={{
                  width: 38,
                  border: "none",
                  borderRadius: 10,
                  background: escuchando ? "var(--terracota)" : "var(--marron-cuero)",
                  color: "#FBF7ED",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Mic size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => enviarPregunta()}
              title="Enviar"
              style={{
                width: 38,
                border: "none",
                borderRadius: 10,
                background: "var(--verde-monte)",
                color: "#FBF7ED",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const esError = toast.tipo === "error";
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        maxWidth: "90%",
        background: esError ? "var(--terracota)" : "var(--verde-monte)",
        color: "#FBF7ED",
        padding: "12px 18px",
        borderRadius: 12,
        boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
        fontFamily: "'Inter', sans-serif",
        fontSize: 13.5,
        fontWeight: 600,
        textAlign: "center",
      }}
    >
      {toast.mensaje}
    </div>
  );
}

/* --- Componente: Menú Lateral que no tapa la cabecera verde --- */
function MenuLateral({ abierto, onAbrir, onCerrar, navegarA, pantallaActual }) {
  const irA = (destino) => {
    navegarA(destino);
    onCerrar(); // Cierra el menú desplegable al hacer clic
  };

    const [esMobile, setEsMobile] = useState(false);
  useEffect(() => {
    const revisarAncho = () => setEsMobile(window.innerWidth < 768);
    revisarAncho();
    window.addEventListener("resize", revisarAncho);
    return () => window.removeEventListener("resize", revisarAncho);
  }, []);

  return (
    <>
      {/* Fondo oscuro transparente que se ubica debajo del header */}
      {abierto && (
        <div
          onClick={onCerrar}
          style={{
            position: "fixed",
            top: "65px", // Comienza debajo de la barra verde
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.3)",
            zIndex: 40,
          }}
        />
      )}

            {/* Menú Lateral */}
      <aside
        className={`sidebar ${abierto ? "abierto" : ""}`}
        style={{
          position: "fixed",
          top: "65px",
          left: 0,
          bottom: 0,
          width: esMobile ? (abierto ? 220 : 0) : (abierto ? 220 : 60),
          background: "#FBF7ED",
          borderRight: esMobile && !abierto ? "none" : "2px solid var(--borde, #e0d8c3)",
          zIndex: 45,
          transition: "width 0.25s ease-in-out",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: esMobile && !abierto ? "16px 0" : "16px 10px",
          boxSizing: "border-box",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <div>
          {/* Opciones de navegación */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 20 }}>
            {/* 1. Inicio */}
            <OpcionMenu
              icono={<Home size={20} />}
              texto="Inicio"
              mostrarTexto={true}
              activa={pantallaActual === "inicio"}
              onClick={() => irA("inicio")}
            />

            {/* 2. Tareas para hoy */}
            <OpcionMenu
              icono={<CalendarClock size={20} />}
              texto="Tareas para hoy"
              mostrarTexto={true}
              activa={pantallaActual === "alertas"}
              onClick={() => irA("alertas")}
            />

            {/* 3. Cargar animales */}
            <OpcionMenu
              icono={<PlusCircle size={20} />}
              texto="Cargar animales"
              mostrarTexto={true}
              activa={pantallaActual === "buscar"}
              onClick={() => irA("buscar")}
            />

            {/* 4. Mis animales */}
            <OpcionMenu
              icono={<List size={20} />}
              texto="Mis animales"
              mostrarTexto={true}
              activa={pantallaActual === "listado"}
              onClick={() => irA("listado")}
            />

            {/* 5. Genealogía */}
            <OpcionMenu
              icono={<GitFork size={20} />}
              texto="Genealogía"
              mostrarTexto={true}
              activa={pantallaActual === "genealogia"}
              onClick={() => irA("genealogia")}
            />

            {/* 6. Sanidad */}
            <OpcionMenu
              icono={<Syringe size={20} />}
              texto="Sanidad"
              mostrarTexto={true}
              activa={pantallaActual === "sanidad"}
              onClick={() => irA("sanidad")}
            />

            {/* 7. Estadísticas */}
            <OpcionMenu
              icono={<CalendarClock size={20} />}
              texto="Estadísticas"
              mostrarTexto={true}
              activa={pantallaActual === "estadisticas"}
              onClick={() => irA("estadisticas")}
            />
          </nav>
        </div>

        {/* Pie de página del menú */}
        {abierto && (
          <div
            style={{
              borderTop: "1px solid var(--borde, #e0d8c3)",
              paddingTop: 10,
              fontSize: 11,
              color: "#8A7A63",
            }}
          >
            AgroData — Eleana Africani
          </div>
        )}
      </aside>
    </>
  );
}

function OpcionMenu({ icono, texto, mostrarTexto, activa, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={texto}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        background: activa ? "var(--verde-monte)" : "transparent",
        color: activa ? "#FBF7ED" : "var(--texto, #333)",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        fontWeight: activa ? 600 : 400,
        fontSize: 14,
        overflow: "hidden",
        whiteSpace: "nowrap"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icono}
      </div>
      {mostrarTexto && <span>{texto}</span>}
    </button>
  );
}



/* ---------------------------------------------------------------- */
/* Pantalla "Sanidad" */
/* ---------------------------------------------------------------- */

function PantallaSanidad() {
  const [pestaña, setPestaña] = useState("plan"); // "plan", "registro", "resguardo"
  const [categoriaSel, setCategoriaSel] = useState("Terneros");

  // Formulario de registro masivo
  const [evento, setEvento] = useState("Vacunación Aftosa");
  const [lote, setLote] = useState("Rodeo General");
  const [farmaco, setFarmaco] = useState("");
  
  // NUEVO: Estado para capturar la fecha elegida (por defecto trae el día de hoy)
  const [fechaAplicacion, setFechaAplicacion] = useState(
    new Date().toISOString().split("T")[0]
  );

  // NUEVO: Función que guarda en "Tareas para hoy" / Calendario
// Función para eliminar un trabajo cargado
  const eliminarRegistro = (idParaEliminar) => {
    if (!window.confirm("¿Estás segura de eliminar este registro de sanidad?")) {
      return;
    }

    try {
      const guardadas = JSON.parse(localStorage.getItem("tareas_manuales") || "[]");
      const listaFiltrada = guardadas.filter((item) => item.id !== idParaEliminar);
      
      localStorage.setItem("tareas_manuales", JSON.stringify(listaFiltrada));
      alert("Registro eliminado correctamente.");
      
      // Forzamos un pequeño refresco del estado local para actualizar la pantalla
      setFarmaco((prev) => prev); 
    } catch (e) {
      console.error(e);
      alert("Error al eliminar el registro.");
    }
  };

  const guardarRegistro = () => {
    if (!fechaAplicacion) {
      alert("Por favor selecciona una fecha");
      return;
    }

    // Normalizamos la fecha a formato ISO (AAAA-MM-DD)
    const fechaISO = new Date(fechaAplicacion + "T00:00:00").toISOString().split("T")[0];

    const nuevaTarea = {
      id: Date.now().toString(),
      texto: `💉 Sanidad: ${evento} en ${lote}${farmaco ? ` (${farmaco})` : ""}`,
      fecha: fechaISO,
      completada: false,
    };

    try {
      const guardadas = JSON.parse(localStorage.getItem("tareas_manuales") || "[]");
      guardadas.push(nuevaTarea);
      localStorage.setItem("tareas_manuales", JSON.stringify(guardadas));

      alert(`¡Trabajo agendado para el día ${fechaISO}!`);
      setFarmaco("");
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar la tarea.");
    }
  };

  // PLAN SANITARIO REAL EXTRAÍDO DE LA PLANILLA VETERINARIA BRANDSEN
  const PLANES = {
    Terneros: {
      tareas: [
        { meses: "Marzo - Abril", tarea: "Antiparasitario (según H.P.G.)" },
        { meses: "Marzo", tarea: "Vacuna Brucelosis" },
        { meses: "Marzo - Abril", tarea: "Vacuna Aftosa" },
        { meses: "Mayo", tarea: "Refuerzo de Cobre" },
        { meses: "Septiembre - Octubre", tarea: "Vacuna Neumonía" },
        { meses: "Septiembre - Octubre", tarea: "Vacuna Mancha" },
        { meses: "Septiembre - Octubre", tarea: "Vacuna Querato-conjuntivitis" },
        { meses: "Noviembre", tarea: "Antiparasitario" },
      ],
      notas: [
        "💡 Tomar muestras de materia fecal para hacer H.P.G. y desparasitar de forma estratégica.",
        "💉 Vacunas: Empezar a vacunar a partir de los 2 meses de vida."
      ]
    },
    Vaquillonas: {
      tareas: [
        { meses: "Marzo", tarea: "Vacuna Carbunclo" },
        { meses: "Marzo", tarea: "Antiparasitario" },
        { meses: "Marzo", tarea: "Vacuna Aftosa" },
        { meses: "Marzo - Abril", tarea: "Refuerzo de Cobre" },
        { meses: "Mayo - Junio", tarea: "Vacuna Diarrea-Neonatal" },
        { meses: "Abril - Mayo", tarea: "Vacunas Reproductivas" },
        { meses: "Agosto - Septiembre", tarea: "Refuerzo Cobre / Reproductivas" },
        { meses: "Septiembre", tarea: "Antiparasitario" },
      ],
      notas: []
    },
    Vacas: {
      tareas: [
        { meses: "Marzo", tarea: "Vacunas Reproductivas" },
        { meses: "Marzo", tarea: "Vacuna Carbunclo" },
        { meses: "Marzo", tarea: "Refuerzo de Cobre" },
        { meses: "Marzo", tarea: "Vacuna Aftosa" },
        { meses: "Junio", tarea: "Vacuna Diarrea-Neonatal" },
        { meses: "Junio", tarea: "Refuerzo de Cobre" },
        { meses: "Septiembre", tarea: "Vacunas Reproductivas" },
        { meses: "Septiembre", tarea: "Antiparasitario" },
        { meses: "Octubre", tarea: "Refuerzo de Cobre" },
      ],
      notas: [
        "🔬 En el mismo momento del Tacto / Ecografía, hacer el sangrado para diagnóstico de Brucelosis.",
        "💉 La vacuna Diarrea-Neonatal es de dosis obligatoria y se puede reforzar.",
        "🪰 Parásitos externos (Mosca de los cuernos): Curar SOLAMENTE cuando las vacas estén molestas e inquietas para evitar resistencia."
      ]
    },
    Toros: {
      tareas: [
        { meses: "Marzo", tarea: "Vacuna Carbunclo" },
        { meses: "Mayo - Junio", tarea: "Vacunas Reproductivas" },
        { meses: "Mayo - Junio", tarea: "Antiparasitario" },
        { meses: "Mayo - Junio", tarea: "Control de Toros (Raspado venéreo)" },
        { meses: "Mayo - Junio", tarea: "Refuerzo de Cobre" },
        { meses: "Septiembre", tarea: "Vacunas Reproductivas" },
        { meses: "Septiembre", tarea: "Refuerzo de Cobre" },
      ],
      notas: []
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "10px" }}>
      
      {/* 1. Navegación Superior entre Pestañas */}
      <div style={{ display: "flex", gap: 6, background: "#F5F2EC", padding: 4, borderRadius: 12 }}>
        {[
          { id: "plan", label: "📋 Plan por Categoría" },
          { id: "registro", label: "💉 Cargar Trabajo" },
          { id: "resguardo", label: "⚠️ Resguardos" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPestaña(tab.id)}
            style={{
              flex: 1,
              padding: "10px 4px",
              borderRadius: 8,
              border: "none",
              background: pestaña === tab.id ? "var(--crema)" : "transparent",
              color: pestaña === tab.id ? "var(--marron-oscuro)" : "#8A7A63",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              boxShadow: pestaña === tab.id ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* PESTAÑA 1: PLAN SANITARIO */}
      {pestaña === "plan" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          
          {/* Botones de Categorías */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {Object.keys(PLANES).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoriaSel(cat)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 20,
                  border: "1px solid var(--borde)",
                  background: categoriaSel === cat ? "var(--verde-monte)" : "var(--crema)",
                  color: categoriaSel === cat ? "#FFF" : "var(--marron-oscuro)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Tarjeta de Calendario */}
          <div style={{ background: "var(--crema)", border: "1px solid var(--borde)", borderRadius: 16, padding: 16 }}>
            <h3 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--marron-oscuro)" }}>
              Calendario Sanitario: {categoriaSel}
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PLANES[categoriaSel].tareas.map((item, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#F5F2EC", borderRadius: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--marron-oscuro)" }}>{item.tarea}</span>
                  <span style={{ fontSize: 11, color: "#2E3D29", fontWeight: 700, background: "#E2EBD8", padding: "4px 8px", borderRadius: 6 }}>{item.meses}</span>
                </div>
              ))}
            </div>

            {/* Recomendaciones Veterinarias Especiales */}
            {PLANES[categoriaSel].notas.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--borde)", display: "flex", flexDirection: "column", gap: 8 }}>
                {PLANES[categoriaSel].notas.map((nota, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#5A4C3A", background: "#FFFDF8", padding: 10, borderRadius: 8, border: "1px solid #E0D8C3" }}>
                    {nota}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 2: CARGAR TRABAJO MASIVO E HISTORIAL */}
      {pestaña === "registro" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          
          {/* Formulario de Carga */}
          <div style={{ background: "#FFFDF8", border: "1px solid var(--borde, #E0D8C3)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ fontSize: 16, margin: 0, color: "var(--marron-oscuro, #3B2A1D)" }}>
              Registrar Aplicación en Campo
            </h3>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#8A7A63", display: "block", marginBottom: 4 }}>Tratamiento o Vacuna</label>
              <select value={evento} onChange={(e) => setEvento(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid var(--borde, #E0D8C3)", background: "#F5F2EC", fontSize: 14, color: "var(--marron-oscuro, #3B2A1D)" }}>
                <option>Vacuna Aftosa</option>
                <option>Vacuna Carbunclo / Mancha</option>
                <option>Vacuna Brucelosis</option>
                <option>Vacunas Reproductivas</option>
                <option>Diarrea Neonatal</option>
                <option>Antiparasitario</option>
                <option>Cobre / Minerales</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#8A7A63", display: "block", marginBottom: 4 }}>Categoría o Lote Aplicado</label>
              <select value={lote} onChange={(e) => setLote(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid var(--borde, #E0D8C3)", background: "#F5F2EC", fontSize: 14, color: "var(--marron-oscuro, #3B2A1D)" }}>
                <option>Terneros</option>
                <option>Vaquillonas</option>
                <option>Vacas</option>
                <option>Toros</option>
                <option>Rodeo General</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#8A7A63", display: "block", marginBottom: 4 }}>Fecha de Aplicación / Programación</label>
              <input 
                type="date" 
                value={fechaAplicacion} 
                onChange={(e) => setFechaAplicacion(e.target.value)} 
                style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid var(--borde, #E0D8C3)", background: "#F5F2EC", fontSize: 14, boxSizing: "border-box", color: "var(--marron-oscuro, #3B2A1D)" }} 
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#8A7A63", display: "block", marginBottom: 4 }}>Producto / Dosis (Opcional)</label>
              <input type="text" placeholder="Ej: Dosis 2ml / Ivermectina" value={farmaco} onChange={(e) => setFarmaco(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid var(--borde, #E0D8C3)", background: "#F5F2EC", fontSize: 14, boxSizing: "border-box", color: "var(--marron-oscuro, #3B2A1D)" }} />
            </div>

            <button type="button" onClick={guardarRegistro} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "var(--verde-monte, #3E4E2F)", color: "#FFF", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 8 }}>
              ✅ Guardar y Agendar en Calendario
            </button>
          </div>

          {/* Historial Registrado Ordenado Cronológicamente */}
          <div style={{ background: "#FFFDF8", border: "1px solid var(--borde, #E0D8C3)", borderRadius: 16, padding: 18 }}>
            <h3 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--marron-oscuro, #3B2A1D)" }}>
              📋 Historial de Aplicaciones
            </h3>

            {(() => {
              const guardadas = JSON.parse(localStorage.getItem("tareas_manuales") || "[]");
              const listaSanidad = guardadas.filter(t => t.texto && t.texto.includes("💉 Sanidad:"));

              if (listaSanidad.length === 0) {
                return <p style={{ fontSize: 13, color: "#8A7A63", margin: 0 }}>No hay trabajos cargados aún.</p>;
              }

              // Ordenamos cronológicamente (más recientes primero)
              listaSanidad.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {listaSanidad.map((item) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "#F5F2EC", borderRadius: 10, border: "1px solid #E0D8C3", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--marron-oscuro, #3B2A1D)" }}>
                          {item.texto.replace("💉 Sanidad: ", "")}
                        </div>
                        <div style={{ fontSize: 11, color: "#8A7A63", marginTop: 2 }}>
                          📅 {item.fecha}
                        </div>
                      </div>

                      {/* Botón de Eliminar con X */}
                      <button
                        type="button"
                        onClick={() => eliminarRegistro(item.id)}
                        title="Eliminar registro"
                        style={{
                          background: "#FADBD8",
                          border: "1px solid #F5B7B1",
                          color: "#78281F",
                          borderRadius: "8px",
                          width: "32px",
                          height: "32px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "14px",
                          cursor: "pointer",
                          flexShrink: 0
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

        </div>
      )}

      {/* PESTAÑA 3: RESGUARDOS */}
      {pestaña === "resguardo" && (
        <div style={{ background: "var(--crema)", border: "1px solid var(--borde)", borderRadius: 16, padding: 18 }}>
          <h3 style={{ fontSize: 16, margin: "0 0 6px", color: "var(--marron-oscuro)" }}>
            Períodos de Resguardo
          </h3>
          <p style={{ fontSize: 12, color: "#8A7A63", margin: "0 0 14px" }}>
            Animales con restricciones de venta o faena por aplicación de fármacos[cite: 2].
          </p>

          <div style={{ padding: "12px", background: "#FDF2E9", border: "1px solid var(--terracota)", borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--terracota)" }}>⚠️ Terneros - Antiparasitario</div>
            <div style={{ fontSize: 12, marginTop: 4, color: "var(--marron-oscuro)" }}>No enviar a faena hasta dentro de 15 días.</div>
          </div>
        </div>
      )}

    </div>
  );
}