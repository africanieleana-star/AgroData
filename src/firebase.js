// Conexión con Firebase: acá se inicializa el proyecto y se exportan
// las tres piezas que usa el resto de la app: "app", "auth" (login) y "db" (base de datos con soporte offline).
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
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

// 3. Inicializa Firestore CON soporte Offline habilitado (reemplaza a getFirestore)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
