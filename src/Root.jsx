import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { iniciarSincronizacion, detenerSincronizacion } from "./cloudSync";
import Auth from "./Auth.jsx";
import App from "./App.jsx";

function Cargando() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F5F2EC",
        color: "#8A7A63",
        fontFamily: "sans-serif",
        fontSize: 14,
      }}
    >
      Cargando tus datos...
    </div>
  );
}

export default function Root() {
  // "cargando" | "sin-sesion" | "lista"
  const [estado, setEstado] = useState("cargando");
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const desuscribir = onAuthStateChanged(auth, async (usuarioFirebase) => {
      if (usuarioFirebase) {
        setEstado("cargando");
        await iniciarSincronizacion(usuarioFirebase.uid);
        setUsuario(usuarioFirebase);
        setEstado("lista");
      } else {
        detenerSincronizacion();
        setUsuario(null);
        setEstado("sin-sesion");
      }
    });
    return () => desuscribir();
  }, []);

  if (estado === "cargando") return <Cargando />;
  if (estado === "sin-sesion") return <Auth />;

  return (
    <App userEmail={usuario?.email} onCerrarSesion={() => signOut(auth)} />
  );
}
