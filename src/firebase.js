// Conexión con Firebase: acá se inicializa el proyecto y se exportan
// las dos piezas que usa el resto de la app: "auth" (login) y "db" (base de datos).
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBTFA5wDQX5SHsI0ao4WqACh4SBp3PhDWE",
  authDomain: "agrodata-4d110.firebaseapp.com",
  projectId: "agrodata-4d110",
  storageBucket: "agrodata-4d110.firebasestorage.app",
  messagingSenderId: "1087080177294",
  appId: "1:1087080177294:web:848d68837b7a332e5a33df",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);ç

import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  // ... resto de tu configuración
};

// 1. Inicializa la app
const app = initializeApp(firebaseConfig);

// 2. Inicializa Firestore CON soporte Offline habilitado
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
