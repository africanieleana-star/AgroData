import React, { useState, useEffect } from "react";
import { getEstadoSync, subscribeEstadoSync, getUltimoMensajeError } from "./cloudSync";

// Indicador chiquito y fijo en pantalla que muestra si los datos están
// guardados en la nube, guardándose, con error, o sin conexión.
// Usa los mismos colores/tipografía que el resto de AgroData.
export default function SyncStatus() {
  const [estado, setEstado] = useState(getEstadoSync());

  useEffect(() => {
    const desuscribirse = subscribeEstadoSync(setEstado);
    return desuscribirse;
  }, []);

  if (estado === "inactivo") return null; // todavía no hay sesión iniciada

  const CONFIG = {
    sincronizado: { texto: "Guardado en la nube", color: "var(--verde-exito)", icono: "✅" },
    guardando: { texto: "Guardando...", color: "var(--marron-cuero)", icono: "☁️" },
    error: { texto: "No se pudo guardar, reintentando...", color: "var(--terracota)", icono: "⚠️" },
    sin_conexion: { texto: "Sin conexión, guardando cuando vuelva", color: "var(--terracota)", icono: "📡" },
    conflicto_dispositivo: { texto: "Otro dispositivo guardó cambios nuevos. Tocá para recargar.", color: "var(--terracota)", icono: "🔁" },
  };

  const { texto, color, icono } = CONFIG[estado] || CONFIG.guardando;

  const detalleError = estado === "error" ? getUltimoMensajeError() : "";

  return (
    <div
      onClick={() => {
        if (estado === "conflicto_dispositivo") window.location.reload();
      }}
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        zIndex: 250,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        background: "var(--crema, #FFFFFF)",
        border: `1.5px solid ${color}`,
        borderRadius: 12,
        padding: "6px 12px",
        boxShadow: "0 2px 8px rgba(59,42,29,0.12)",
        fontFamily: "'Inter', sans-serif",
        fontSize: 11.5,
        fontWeight: 600,
        color,
        maxWidth: "82vw",
        cursor: estado === "conflicto_dispositivo" ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, flexShrink: 0 }}>{icono}</span>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{texto}</span>
      </div>
      {detalleError && (
        <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, whiteSpace: "normal", wordBreak: "break-word" }}>
          {detalleError}
        </div>
      )}
    </div>
  );
}
