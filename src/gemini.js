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

const modelo = getGenerativeModel(ai, {
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
