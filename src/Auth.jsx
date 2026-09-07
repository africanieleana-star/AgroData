import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "./firebase";

// Traduce los códigos de error de Firebase a mensajes entendibles.
function mensajeError(codigo) {
  const mapa = {
    "auth/email-already-in-use": "Ese email ya tiene una cuenta creada. Probá iniciar sesión.",
    "auth/invalid-email": "El email no es válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/user-not-found": "No existe una cuenta con ese email.",
    "auth/wrong-password": "La contraseña es incorrecta.",
    "auth/invalid-credential": "Email o contraseña incorrectos.",
    "auth/missing-password": "Ingresá una contraseña.",
    "auth/too-many-requests": "Demasiados intentos. Probá de nuevo en unos minutos.",
  };
  return mapa[codigo] || "Ocurrió un error. Probá de nuevo.";
}

export default function Auth() {
  const [modo, setModo] = useState("login"); // "login" | "registro"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setAviso("");
    setCargando(true);
    try {
      if (modo === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
      // Si funciona, el componente que escucha el login (main.jsx)
      // se encarga de mostrar la app. No hace falta hacer nada más acá.
    } catch (err) {
      setError(mensajeError(err.code));
    } finally {
      setCargando(false);
    }
  };

  const handleOlvidoPassword = async () => {
    setError("");
    setAviso("");
    if (!email.trim()) {
      setError("Escribí tu email arriba y volvé a tocar el link.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAviso("Te enviamos un email para recuperar tu contraseña.");
    } catch (err) {
      setError(mensajeError(err.code));
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F5F2EC",
        fontFamily: "sans-serif",
        padding: 16,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#FFFDF8",
          border: "1px solid #E0D8C3",
          borderRadius: 16,
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <img
          src="/logo-login.png"
          alt="AgroData"
          style={{ width: "100%", maxWidth: 260, height: "auto", objectFit: "contain", margin: "0 auto" }}
        />
        <p style={{ fontSize: 13, color: "#8A7A63", margin: "0 0 8px", textAlign: "center" }}>
          {modo === "login"
            ? "Ingresá con tu email para ver tus datos."
            : "Creá tu cuenta para empezar a cargar tu campo."}
        </p>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#8A7A63", display: "block", marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #E0D8C3",
              background: "#F5F2EC",
              fontSize: 14,
              boxSizing: "border-box",
              color: "#3B2A1D",
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#8A7A63", display: "block", marginBottom: 4 }}>
            Contraseña
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #E0D8C3",
              background: "#F5F2EC",
              fontSize: 14,
              boxSizing: "border-box",
              color: "#3B2A1D",
            }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "#78281F", background: "#FADBD8", padding: 10, borderRadius: 8 }}>
            {error}
          </div>
        )}
        {aviso && (
          <div style={{ fontSize: 12, color: "#2E3D29", background: "#E2EBD8", padding: 10, borderRadius: 8 }}>
            {aviso}
          </div>
        )}

        <button
          type="submit"
          disabled={cargando}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "none",
            background: "#3E4E2F",
            color: "#FFF",
            fontWeight: 700,
            fontSize: 15,
            cursor: cargando ? "default" : "pointer",
            opacity: cargando ? 0.7 : 1,
          }}
        >
          {cargando ? "Un momento..." : modo === "login" ? "Ingresar" : "Crear cuenta"}
        </button>

        {modo === "login" && (
          <button
            type="button"
            onClick={handleOlvidoPassword}
            style={{ background: "none", border: "none", color: "#8A7A63", fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        <div style={{ textAlign: "center", fontSize: 13, color: "#8A7A63", marginTop: 8 }}>
          {modo === "login" ? "¿No tenés cuenta todavía?" : "¿Ya tenés cuenta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setModo(modo === "login" ? "registro" : "login");
              setError("");
              setAviso("");
            }}
            style={{ background: "none", border: "none", color: "#3E4E2F", fontWeight: 700, cursor: "pointer", padding: 0 }}
          >
            {modo === "login" ? "Creá una acá" : "Ingresá acá"}
          </button>
        </div>
      </form>
    </div>
  );
}
