// Conexión con Firebase: acá se inicializa el proyecto y se exportan
// las tres piezas que usa el resto de la app: "app", "auth" (login) y "db".
//
// NOTA sobre el historial de este archivo:
// En un momento sacamos la caché persistente offline porque un código
// viejo (ya eliminado) mandaba cientos de escrituras de golpe cada vez
// que se abría la pantalla de Inicio, y eso saturaba la cola de subida
// de Firestore, dejando la app trabada en "Guardando...".
//
// Ahora que ese código se eliminó, volvemos a activar la caché
// persistente (persistentLocalCache), porque es la herramienta que da
// Firebase específicamente para el uso offline: guarda los cambios en
// el dispositivo cuando no hay señal, y los sincroniza solo -de forma
// confiable- apenas vuelve la conexión, sin depender de que nuestro
// propio código adivine bien cuándo volvió internet.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

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

// 3. Inicializa Firestore CON soporte offline habilitado
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
