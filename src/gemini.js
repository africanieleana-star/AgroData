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
  
  // Si no viene contexto, lee los datos guardados en la app automáticamente
  const contextoActual = contextoDelCampo || obtenerContextoDelCampo();

  const prompt =
    `Fecha de hoy: ${hoy}\n\n` +
    `${contextoActual}\n\n` +
    `PREGUNTA DEL PRODUCTOR: ${pregunta}`;

  const resultado = await modelo.generateContent(prompt);
  return resultado.response.text();
}

export function obtenerContextoDelCampo() {
  let texto = "=== DATOS OFICIALES DEL CAMPO EN AGRODATA ===\n\n";

  try {
    // Intentamos leer la lista de animales de los nombres más comunes guardados en la app
    const animalesGuardados = JSON.parse(
      localStorage.getItem("agrodata_animales") || 
      localStorage.getItem("animales") || 
      "[]"
    );

    // Separamos los animales activos de los dados de baja o fallecidos
    const fallecidos = [];
    const activos = [];

    animalesGuardados.forEach((a) => {
      const estado = String(a.estado || "").toLowerCase();
      const esBaja = a.baja || estado.includes("muerto") || estado.includes("fallecido") || estado.includes("baja");

      if (esBaja) {
        fallecidos.push(a);
      } else {
        activos.push(a);
      }
    });

    // Escribimos los números EXACTOS para que la IA los lea directamente
    texto += "--- RESUMEN DE ANIMALES ---\n";
    texto += `* Cantidad TOTAL DE ANIMALES VIVOS / ACTIVOS: ${activos.length}\n`;
    texto += `* Cantidad TOTAL DE ANIMALES FALLECIDOS / MUERTOS: ${fallecidos.length}\n`;
    texto += `* Total histórico registrado en sistema: ${animalesGuardados.length}\n\n`;

    texto += "--- DETALLE DE ANIMALES FALLECIDOS ---\n";
    if (fallecidos.length === 0) {
      texto += "No hay animales registrados como fallecidos.\n";
    } else {
      fallecidos.forEach((a) => {
        texto += `- Caravana: ${a.caravana || "Sin ID"}, Categoria: ${a.categoria || "N/D"}, Estado: ${a.estado || "Fallecido"}\n`;
      });
    }

    // Leer Tareas y Sanidad
    const tareas = JSON.parse(localStorage.getItem("tareas_manuales") || "[]");
    texto += "\n--- REGISTRO DE TAREAS Y SANIDAD ---\n";
    if (tareas.length === 0) {
      texto += "No hay tareas registradas.\n";
    } else {
      tareas.forEach((t) => {
        texto += `- Tarea: ${t.texto || "Sin detalle"}\n`;
      });
    }
  } catch (e) {
    console.error("Error al leer datos para la IA:", e);
  }

  return texto;
}
