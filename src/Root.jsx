import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { iniciarSincronizacion, detenerSincronizacion } from "./cloudSync";
import { verificarSuscripcion } from "./suscripcion";
import Auth from "./Auth.jsx";
import App from "./App.jsx";

function PruebaVencida({ onCerrarSesion }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#F5F2EC",
        fontFamily: "sans-serif",
        padding: 24,
        textAlign: "center",
        gap: 16,
      }}
    >
      <h2 style={{ color: "#3B2A1D", margin: 0 }}>Tu período de prueba terminó</h2>
      <p style={{ color: "#8A7A63", maxWidth: 380, margin: 0 }}>
        Tus 15 días gratis de AgroData ya pasaron. Escribinos para activar tu suscripción y seguir usando la app.
      </p>
      <a
        href="https://wa.me/5492236819372?text=Hola!%20Quiero%20activar%20mi%20suscripci%C3%B3n%20de%20AgroData"
        target="_blank"
        rel="noreferrer"
        style={{
          padding: "12px 20px",
          borderRadius: 10,
          background: "#3E4E2F",
          color: "#FFF",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Escribir por WhatsApp
      </a>
      <button
        type="button"
        onClick={onCerrarSesion}
        style={{ background: "none", border: "none", color: "#8A7A63", fontSize: 13, cursor: "pointer" }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}

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
  const [suscripcion, setSuscripcion] = useState(null);

  useEffect(() => {
    const desuscribir = onAuthStateChanged(auth, async (usuarioFirebase) => {
      if (usuarioFirebase) {
        setEstado("cargando");
        await iniciarSincronizacion(usuarioFirebase.uid);
        const estadoSuscripcion = await verificarSuscripcion(usuarioFirebase.uid);
        setSuscripcion(estadoSuscripcion);
        setUsuario(usuarioFirebase);
        setEstado("lista");
      } else {
        detenerSincronizacion();
        setUsuario(null);
        setSuscripcion(null);
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
  if (suscripcion && suscripcion.estado === "vencida") {
    return <PruebaVencida onCerrarSesion={manejarCerrarSesion} />;
  }

  return (
    <App userEmail={usuario?.email} onCerrarSesion={manejarCerrarSesion} />
  );
}
