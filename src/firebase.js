import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
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

// 1. Inicializa la app (se exporta para poder usarla con Gemini)
export const app = initializeApp(firebaseConfig);

// 2. App Check: tiene que ir después de crear la app y antes de usar los servicios
if (import.meta.env.DEV) {
  // Para probar en tu computadora (localhost): genera un "token de depuración"
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider("6LePacctAAAAAHA8dXkXlrs3xIRZ4WwAiu_PaTau"),  isTokenAutoRefreshEnabled: true,
});

// 3. Login
export const auth = getAuth(app);

// 4. Base de datos con soporte offline
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
