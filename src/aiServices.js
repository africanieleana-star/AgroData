import { model } from "./firebase";

// Convierte imágenes o comprobantes para Gemini
async function fileToGenerativePart(file) {
  const base64Data = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: base64Data, mimeType: file.type },
  };
}

/**
 * 1. PROCESADOR DE FACTURAS AVANZADO
 */
export async function procesarFacturaAvanzada(archivo) {
  try {
    const imagePart = await fileToGenerativePart(archivo);
    
    const prompt = `Analiza esta factura o comprobante del campo. 
    Extrae la información en un formato claro con estas etiquetas:
    - PROVEEDOR:
    - FECHA:
    - CUIT:
    - CATEGORIA_SUGERIDA: (Alimento, Sanidad/Vacunas, Combustible, Maquinaria, Mantenimiento u Otros)
    - RESUMEN_ITEMS: (Breve lista de lo comprado)
    - TOTAL: (Solo el valor numérico y moneda)
    - OBSERVACION_AGRO: (Si detectas vacunas o insumos importantes, deja un consejo breve).`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Error al procesar la factura:", error);
    throw error;
  }
}

/**
 * 2. CHAT TEXTUAL CON GEMINI
 */
let chatSession = null;

export async function enviarMensajeChatAgro(mensaje) {
  try {
    if (!chatSession) {
      chatSession = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: "Hola, vas a actuar como el Asistente Técnico y Financiero de AgroData." }],
          },
          {
            role: "model",
            parts: [{ text: "¡Hola! Soy AgroAI, el asistente inteligente de AgroData. Puedo ayudarte con dudas sobre ganadería, insumos, gastos o manejo del rodeo. ¿En qué trabajamos hoy?" }],
          },
        ],
      });
    }

    const result = await chatSession.sendMessage(mensaje);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Error en el chat:", error);
    throw error;
  }
}

/**
 * 3. HERRAMIENTAS DE VOZ (LECTURA Y GRABACIÓN DE AUDIO)
 */

// A) Hace que la app lea en voz alta cualquier texto
export function hablarTexto(texto) {
  if (!('speechSynthesis' in window)) {
    alert("Tu navegador no soporta reproducción de voz.");
    return;
  }
  
  // Cancelamos cualquier audio anterior que esté sonando
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = "es-ES"; // Idioma español
  utterance.rate = 1.0;     // Velocidad normal

  window.speechSynthesis.speak(utterance);
}

// B) Escucha el micrófono del usuario y convierte lo que dice a texto
export function escucharMicrofono(onResultado, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Tu navegador no soporta reconocimiento de voz por micrófono.");
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const textoEscuchado = event.results[0][0].transcript;
    onResultado(textoEscuchado);
  };

  recognition.onerror = (event) => {
    console.error("Error en micrófono:", event.error);
    if (onError) onError(event.error);
  };

  recognition.start();
  return recognition;
}
