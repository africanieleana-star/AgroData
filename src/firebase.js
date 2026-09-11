// Conexión con Firebase: acá se inicializa el proyecto y se exportan
// las tres piezas que usa el resto de la app: "app", "auth" (login) y "db" (base de datos).
//
// NOTA: se sacó la caché persistente offline (persistentLocalCache) porque
// esa caché, guardada en el navegador (IndexedDB), se estaba trabando con
// una cola de escrituras pendientes que nunca lograba confirmarse, y eso
// dejaba la app colgada en "Guardando..." sin importar qué usuario entrara.
// Con este cambio, Firestore funciona en modo normal (necesita conexión a
// internet para guardar), pero se elimina esa causa de traba.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Mantenés tus credenciales reales exactamente como las tenés
const firebaseConfig = {
  apiKey: "AIzaSyBTFA5wDQX5SHsI0ao4WqACh4SBp3PhDWE",
  authDomain: "agrodata-4d110.firebaseapp.com",
  projectId: "agrodata-4d110",
  storageBucket: "agrodata-4d110.firebasestorage.app",
  messagingSenderId: "1087080177294",
  appId: "1:1087080177294:web:848d68837b7a332e5a33df",
};

// 1. Inicializa la app
const app = initializeApp(firebaseConfig);

// 2. Inicializa Autenticación (Login)
export const auth = getAuth(app);

// 3. Inicializa Firestore (sin caché persistente offline)
export const db = getFirestore(app);
