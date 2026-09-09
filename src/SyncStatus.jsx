import React, { useState, useEffect } from "react";
import { getEstadoSync, subscribeEstadoSync } from "./cloudSync";

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
  };

  const { texto, color, icono } = CONFIG[estado] || CONFIG.guardando;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "var(--crema, #FFFFFF)",
        border: `1.5px solid ${color}`,
        borderRadius: 999,
        padding: "6px 12px",
        boxShadow: "0 2px 8px rgba(59,42,29,0.12)",
        fontFamily: "'Inter', sans-serif",
        fontSize: 11.5,
        fontWeight: 600,
        color,
        maxWidth: "70vw",
      }}
    >
      <span style={{ fontSize: 13, flexShrink: 0 }}>{icono}</span>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{texto}</span>
    </div>
  );
}
