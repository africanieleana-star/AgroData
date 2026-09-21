// Conexión con Gemini (a través de Firebase AI Logic)
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { app } from "./firebase";

const ai = getAI(app, { backend: new GoogleAIBackend() });

const INSTRUCCIONES = `
Sos el asistente de AgroData, una app de gestión ganadera para un productor argentino.
Respondé siempre en español rioplatense, en tono simple y amable.
Respondé SOLO en base a los datos del campo que se te entregan. Si el dato no está
en la información, decí claramente que no está registrado. No inventes animales,
fechas ni números.
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
  const prompt =
    `Fecha de hoy: ${hoy}\n\n` +
    `DATOS DEL CAMPO:\n${contextoDelCampo}\n\n` +
    `PREGUNTA DEL PRODUCTOR: ${pregunta}`;

  const resultado = await modelo.generateContent(prompt);
  return resultado.response.text();
}


// Función para armar el texto completo con la información de tu app
export function armarContextoCompleto({ animales = [], compras = [], eventos = [] }) {
  let texto = "=== DATOS REGISTRADOS EN AGRODATA ===\n\n";

  // 1. ANIMALES Y RODEO
  texto += "--- HACIENDA Y ANIMALES ---\n";
  if (animales.length === 0) {
    texto += "No hay animales registrados.\n";
  } else {
    animales.forEach((a) => {
      texto += `- Caravana: ${a.caravana || "Sin ID"}, Categoria: ${a.categoria || "N/D"}, Raza: ${a.raza || "N/D"}, Estado: ${a.estado || "N/D"}, Lote/Potrero: ${a.lote || "Sin asignar"}\n`;
    });
  }

  // 2. COMPRAS Y COMPROBANTES
  texto += "\n--- HISTORIAL DE COMPRAS Y GASTOS ---\n";
  if (compras.length === 0) {
    texto += "No hay compras o facturas registradas.\n";
  } else {
    compras.forEach((c) => {
      texto += `- Fecha: ${c.fecha || "N/D"}, Proveedor: ${c.proveedor || "Desconocido"}, Categoria: ${c.categoria || "General"}, Total: $${c.total || 0}, Ítems: ${c.resumen || c.concepto || "Sin detalle"}\n`;
    });
  }

  // 3. EVENTOS O TRATAMIENTOS
  texto += "\n--- EVENTOS Y SANIDAD ---\n";
  if (eventos.length === 0) {
    texto += "No hay eventos o tratamientos registrados.\n";
  } else {
    eventos.forEach((e) => {
      texto += `- Fecha: ${e.fecha || "N/D"}, Tipo: ${e.tipo || "General"}, Descripción: ${e.descripcion || "Sin detalle"}\n`;
    });
  }

  return texto;
}
