import React, { useState, useEffect } from "react";
import { getEstadoSync, subscribeEstadoSync, getUltimoMensajeError, revisarNovedadesAhora } from "./cloudSync";

export default function SyncStatus() {
  const [estado, setEstado] = useState(getEstadoSync());
  const [actualizando, setActualizando] = useState(false);

  useEffect(() => {
    const desuscribirse = subscribeEstadoSync(setEstado);
    return desuscribirse;
  }, []);

  const actualizarAhora = async () => {
    if (actualizando) return;
    setActualizando(true);
    await revisarNovedadesAhora();
    setTimeout(() => setActualizando(false), 600);
  };

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
               <span
          style={{
            width: 1,
            height: 14,
            background: color,
            opacity: 0.3,
            flexShrink: 0,
            marginLeft: 2,
          }}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actualizarAhora();
          }}
          title="Actualizar ahora"
          style={{
            background: "rgba(0,0,0,0.07)",
            border: "none",
            borderRadius: "50%",
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            marginLeft: 2,
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            flexShrink: 0,
            opacity: actualizando ? 0.5 : 1,
            transform: actualizando ? "rotate(180deg)" : "none",
            transition: "transform 0.4s ease, background 0.15s ease",
          }}
        >
          🔄
        </button>
      </div>
      {detalleError && (
        <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, whiteSpace: "normal", wordBreak: "break-word" }}>
          {detalleError}
        </div>
      )}
    </div>
  );
}
