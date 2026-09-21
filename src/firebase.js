import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBTFA5wDQX5SHsI0ao4WqACh4SBp3PhDWE",
  authDomain: "agrodata-4d110.firebaseapp.com",
  projectId: "agrodata-4d110",
  storageBucket: "agrodata-4d110.firebasestorage.app",
  messagingSenderId: "1087080177294",
  appId: "1:1087080177294:web:848d68837b7a332e5a33df",
};

// 1. Inicializa la app (ahora se exporta para poder usarla con Gemini)
export const app = initializeApp(firebaseConfig);

// 2. Login
export const auth = getAuth(app);

// 3. Base de datos con soporte offline
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
