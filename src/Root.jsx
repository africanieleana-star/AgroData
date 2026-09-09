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

  // Antes de cerrar sesión, espera (o fuerza) la confirmación de que el
  // último cambio ya se guardó en la nube. Si no se pudo confirmar (por
  // ejemplo, sin internet), avisa antes de arriesgarse a perder datos.
  const manejarCerrarSesion = async () => {
    const resultado = await detenerSincronizacion();
    if (!resultado.exito) {
      const seguir = window.confirm(
        "No se pudo confirmar que tus últimos cambios se guardaron en la nube " +
        "(¿estás sin internet?). Si cerrás sesión igual, podrías perder lo último " +
        "que cargaste. ¿Cerrar sesión de todas formas?"
      );
      if (!seguir) return;
    }
    await signOut(auth);
  };

  if (estado === "cargando") return <Cargando />;
  if (estado === "sin-sesion") return <Auth />;

  return (
    <App userEmail={usuario?.email} onCerrarSesion={manejarCerrarSesion} />
  );
}
