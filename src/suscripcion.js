import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const DIAS_PRUEBA = 15;

// Devuelve { estado: "prueba" | "activa" | "vencida", diasRestantes }
export async function verificarSuscripcion(uid) {
  try {
    const referencia = doc(db, "suscripciones", uid);
    let snapshot = await getDoc(referencia);

    if (!snapshot.exists()) {
      // Primera vez que este usuario entra: arranca la prueba gratis.
      await setDoc(referencia, { inicio: serverTimestamp() });
      snapshot = await getDoc(referencia);
    }

    const datos = snapshot.data() || {};

    if (datos.activaManual === true) {
      return { estado: "activa", diasRestantes: null };
    }

    const inicio = datos.inicio && datos.inicio.toDate ? datos.inicio.toDate() : new Date();
    const diasPasados = Math.floor((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24));
    const diasRestantes = DIAS_PRUEBA - diasPasados;

    if (diasRestantes > 0) return { estado: "prueba", diasRestantes };
    return { estado: "vencida", diasRestantes: 0 };
  } catch (e) {
    console.error("No se pudo verificar la suscripción:", e);
    // Si falla por un problema de red (ej: primer login sin señal), no
    // bloqueamos: se vuelve a chequear solo la próxima vez que haya señal.
    return { estado: "prueba", diasRestantes: DIAS_PRUEBA };
  }
}
