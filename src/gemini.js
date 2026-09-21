// Conexión con Gemini (a través de Firebase AI Logic)
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { app } from "./firebase";

const ai = getAI(app, { backend: new GoogleAIBackend() });

const INSTRUCCIONES = `
Sos el asistente de AgroData, una app de gestión ganadera para un productor argentino.
Respondé siempre en español rioplatense, en tono simple y amable.
Tenés acceso a TODO lo que el productor registró en la app (animales, compras, ventas,
sanidad, tareas, gastos, potreros, etc.), sin importar el tema.
Respondé SOLO en base a los datos del campo que se te entregan. Si el dato no está
en la información, decí claramente que no está registrado. No inventes animales,
fechas ni números.
Para cantidades usá los CONTEOS EXACTOS y el RESUMEN que vienen calculados.
Para "última", "primera" o "más reciente" ordená por fecha y decí la fecha del registro.
Las respuestas tienen que ser cortas (máximo 5 o 6 renglones).
Escribí en texto plano: no uses asteriscos, ni negritas, ni títulos, ni tablas.
Si hace falta una lista, usá renglones que empiecen con un guion.
No des diagnósticos veterinarios: ante dudas de salud, recomendá consultar al veterinario.
`;

export const modelo = getGenerativeModel(ai, {
  model: "gemini-3.8-flash",
  systemInstruction: INSTRUCCIONES,
});

export async function preguntarAGemini(pregunta, contextoDelCampo) {
  const hoy = new Date().toLocaleDateString("es-AR");

  // Si no viene contexto, lee los datos guardados en la app automáticamente
  const contextoActual = contextoDelCampo || obtenerContextoDelCampo();

  const prompt =
    `Fecha de hoy: ${hoy}\n\n` +
    `${contextoActual}\n\n` +
    `PREGUNTA DEL PRODUCTOR: ${pregunta}`;

  const resultado = await modelo.generateContent(prompt);
  return resultado.response.text();
}

/* ------------------------------------------------------------------ */
/*  CONTEXTO COMPLETO DEL CAMPO                                        */
/* ------------------------------------------------------------------ */

const LARGO_MAXIMO_TEXTO = 5000; // más largo que esto = archivo adjunto (factura en base64, etc.)
const CLAVES_IGNORADAS = /firebase|token|auth|apikey|password|session/i;
const PALABRAS_BAJA = /muert|fallec|baja|vend|egres|faena|extravi|robad/i;
const CLAVES_BAJA = /baja|vendid|muert|fallec|egres/i;

const esObjeto = (x) => x && typeof x === "object" && !Array.isArray(x);
const tieneCaravana = (x) => esObjeto(x) && x.caravana !== undefined;

function limpiar(valor) {
  if (typeof valor === "string") {
    if (valor.startsWith("data:") || valor.length > LARGO_MAXIMO_TEXTO) {
      return "[archivo adjunto omitido]";
    }
    return valor;
  }
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (esObjeto(valor)) {
    const salida = {};
    Object.keys(valor).forEach((k) => {
      salida[k] = limpiar(valor[k]);
    });
    return salida;
  }
  return valor;
}

function parsearFecha(v) {
  if (typeof v !== "string") return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

function comoLista(valor) {
  if (Array.isArray(valor) && valor.length && valor.every(esObjeto)) return valor;
  if (esObjeto(valor)) {
    const vals = Object.values(valor);
    if (vals.length > 1 && vals.every(esObjeto)) return vals;
  }
  return null;
}

// Lee TODO el localStorage de la app (menos claves de sesión/seguridad)
function leerLocalStorage() {
  const datos = {};
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    if (!clave || CLAVES_IGNORADAS.test(clave)) continue;
    const crudo = localStorage.getItem(clave);
    let valor;
    try {
      valor = JSON.parse(crudo);
    } catch (e) {
      valor = crudo;
    }
    datos[clave] = limpiar(valor);
  }
  return datos;
}

// Detecta los animales (registros con "caravana"), estén como lista,
// como mapa o como un registro por clave. Todo lo demás va a "resto".
function separarAnimales(datos) {
  const encontrados = [];
  const resto = {};

  Object.keys(datos).forEach((clave) => {
    const valor = datos[clave];
    const lista = comoLista(valor);
    if (lista && lista.filter(tieneCaravana).length > lista.length / 2) {
      lista.forEach((a) => encontrados.push(a));
    } else if (tieneCaravana(valor)) {
      encontrados.push(valor);
    } else {
      resto[clave] = valor;
    }
  });

  const vistos = new Set();
  const animales = encontrados.filter((a) => {
    const id = String(a.caravana);
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });

  return { animales, resto };
}

function esVivo(a) {
  const estado = String(a.estado || a.situacion || "");
  if (PALABRAS_BAJA.test(estado)) return false;
  const marcadoComoBaja = Object.keys(a).some((k) => {
    if (!CLAVES_BAJA.test(k)) return false;
    const v = a[k];
    if (!v) return false;
    return !["false", "no", "0"].includes(String(v).toLowerCase());
  });
  return !marcadoComoBaja;
}

// Resumen ya calculado: cantidad, distribución de campos con pocos valores
// distintos (categoría, sexo, estado...) y el registro más reciente/antiguo
// según cada campo de fecha.
function resumirLista(listaOriginal) {
  const lista = listaOriginal.filter(esObjeto);
  const resumen = { cantidad: lista.length };
  const conteos = {};
  const fechas = {};

  lista.forEach((item) => {
    Object.keys(item).forEach((campo) => {
      const v = item[campo];
      if (typeof v === "string" || typeof v === "boolean") {
        const k = String(v).slice(0, 60);
        conteos[campo] = conteos[campo] || {};
        conteos[campo][k] = (conteos[campo][k] || 0) + 1;
      }
      const f = parsearFecha(v);
      if (f) {
        const previo = fechas[campo] || { masReciente: null, masAntiguo: null };
        if (!previo.masReciente || f > previo.masReciente.f) previo.masReciente = { f, item };
        if (!previo.masAntiguo || f < previo.masAntiguo.f) previo.masAntiguo = { f, item };
        fechas[campo] = previo;
      }
    });
  });

  const distribucion = {};
  Object.keys(conteos).forEach((campo) => {
    const distintos = Object.keys(conteos[campo]).length;
    if (distintos <= 12 && distintos < lista.length) distribucion[campo] = conteos[campo];
  });
  if (Object.keys(distribucion).length) resumen.distribucionPorCampo = distribucion;

  const porFecha = {};
  Object.keys(fechas).forEach((campo) => {
    const r = fechas[campo].masReciente;
    const a = fechas[campo].masAntiguo;
    porFecha[campo] = {
      masReciente: { fecha: r.f.toISOString().slice(0, 10), registro: r.item },
      masAntiguo: { fecha: a.f.toISOString().slice(0, 10), registro: a.item },
    };
  });
  if (Object.keys(porFecha).length) resumen.registrosExtremosPorFecha = porFecha;

  return resumen;
}

export function obtenerContextoDelCampo() {
  try {
    const { animales, resto } = separarAnimales(leerLocalStorage());
    const vivos = animales.filter(esVivo);
    const bajas = animales.filter((a) => !esVivo(a));

    const resumen = {
      animalesVivos: resumirLista(vivos),
      animalesDeBaja: resumirLista(bajas),
    };
    Object.keys(resto).forEach((clave) => {
      const lista = comoLista(resto[clave]);
      if (lista) resumen[clave] = resumirLista(lista);
    });

    const texto =
      "=== DATOS OFICIALES DEL CAMPO EN AGRODATA ===\n\n" +
      "CONTEOS EXACTOS DE ANIMALES:\n" +
      `- Animales VIVOS (activos en el campo): ${vivos.length}\n` +
      `- Animales dados de baja (vendidos, muertos u otras bajas): ${bajas.length}\n` +
      `- Total histórico registrado: ${animales.length}\n\n` +
      "RESUMEN CALCULADO (confiable):\n" +
      JSON.stringify(resumen) + "\n\n" +
      "DATOS COMPLETOS - ANIMALES VIVOS:\n" +
      JSON.stringify(vivos) + "\n\n" +
      "DATOS COMPLETOS - ANIMALES DE BAJA (vendidos, muertos, etc.):\n" +
      JSON.stringify(bajas) + "\n\n" +
      "DATOS COMPLETOS - RESTO DE LA APP (compras, ventas, tareas, sanidad, gastos, etc.):\n" +
      JSON.stringify(resto);

    console.log(
      `[IA] Contexto: ${texto.length} caracteres | vivos: ${vivos.length} | bajas: ${bajas.length}`
    );
    console.log("[IA] Claves de datos enviadas:", Object.keys(resto));
    console.log("[IA] Distribución de animales de baja:", resumen.animalesDeBaja.distribucionPorCampo);
    return texto;
  } catch (e) {
    console.error("Error al leer datos para la IA:", e);
    return "No se pudieron leer los datos del campo.";
  }
}
