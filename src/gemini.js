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
  let texto = "=== DATOS DEL CAMPO REGISTRADOS EN AGRODATA ===\n\n";

  try {
    // 1. Leer Animales
    const animales = JSON.parse(localStorage.getItem("agrodata_animales") || "[]");
    
    // Filtramos por estado
    const fallecidos = animales.filter(a => 
      a.estado && (a.estado.toLowerCase().includes("muerto") || a.estado.toLowerCase().includes("fallecido"))
    );
    const activos = animales.filter(a => 
      !a.estado || (!a.estado.toLowerCase().includes("muerto") && !a.estado.toLowerCase().includes("fallecido"))
    );

    texto += "--- RESUMEN DE HACIENDA ---\n";
    texto += `- Total de animales en registro: ${animales.length}\n`;
    texto += `- Animales activos en el campo: ${activos.length}\n`;
    texto += `- Animales fallecidos/muertos: ${fallecidos.length}\n\n`;

    texto += "--- DETALLE DE ANIMALES FALLECIDOS ---\n";
    if (fallecidos.length === 0) {
      texto += "No hay animales marcados como fallecidos o muertos.\n";
    } else {
      fallecidos.forEach((a) => {
        texto += `- Caravana: ${a.caravana || "Sin ID"}, Categoría: ${a.categoria || "N/D"}, Estado: ${a.estado}\n`;
      });
    }

    // 2. Leer Tareas y Sanidad
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

