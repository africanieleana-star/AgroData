import React, { useState } from "react";
import { listarBackups, restaurarBackup, obtenerDatosActuales, obtenerDatosDeBackup, recuperarAnimalesDesdeSubcoleccion } from "./cloudSync";

// Arma y dispara la descarga de un archivo .json en la PC del usuario,
// con los datos ya "desempaquetados" (cada ficha como objeto legible,
// no como texto crudo) para que el archivo se pueda abrir y leer fácil.
function descargarComoJSON(datos, nombreArchivo) {
  const legible = {};
  Object.keys(datos || {}).forEach((clave) => {
    try {
      legible[clave] = JSON.parse(datos[clave]);
    } catch (e) {
      legible[clave] = datos[clave]; // si no era JSON, se deja tal cual
    }
  });

  const blob = new Blob([JSON.stringify(legible, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

// Muestra la fecha AAAA-MM-DD en formato DD/MM/AAAA, más fácil de leer.
function formatearFecha(fechaISO) {
  const [anio, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}/${anio}`;
}

function fechaDeHoyISO() {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function esHoy(fechaISO) {
  return fechaISO === fechaDeHoyISO();
}

// Botón flotante + ventana modal para ver y restaurar copias de seguridad
// diarias. No necesita ninguna otra conexión con el resto de la app: se
// coloca en el render (por ejemplo junto a <SyncStatus />) y funciona solo.
export default function BackupPanel() {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [backups, setBackups] = useState([]);
  const [restaurandoFecha, setRestaurandoFecha] = useState(null);
  const [descargandoFecha, setDescargandoFecha] = useState(null);
  const [mensaje, setMensaje] = useState(null);

    const [recuperandoAnimales, setRecuperandoAnimales] = useState(false);

  const recuperarDesdeAnimales = async () => {
    if (
      !window.confirm(
        "Esto va a traer todas las fichas guardadas en Firebase (colección 'animales') " +
          "y cargarlas en este dispositivo. Si ya tenés alguna ficha local con la misma " +
          "caravana, se va a reemplazar por la versión de Firebase.\n\n¿Continuar?"
      )
    )
      return;

    setRecuperandoAnimales(true);
    setMensaje(null);
    const resultado = await recuperarAnimalesDesdeSubcoleccion();
    setRecuperandoAnimales(false);

    if (resultado.error) {
      setMensaje({ tipo: "error", texto: `⚠️ ${resultado.error}` });
      return;
    }

    setMensaje({
      tipo: "exito",
      texto: `✅ Se recuperaron ${resultado.recuperados} animal(es). Recargando la página...`,
    });
    setTimeout(() => window.location.reload(), 1500);
  };

  const descargarActual = () => {
    const datos = obtenerDatosActuales();
    const hoy = fechaDeHoyISO();
    descargarComoJSON(datos, `agrodata_respaldo_${hoy}.json`);
  };

  const descargarBackup = async (fecha) => {
    setDescargandoFecha(fecha);
    const datos = await obtenerDatosDeBackup(fecha);
    if (datos) {
      descargarComoJSON(datos, `agrodata_respaldo_${fecha}.json`);
    } else {
      setMensaje({ tipo: "error", texto: "⚠️ No se pudo descargar esa copia. Probá de nuevo." });
    }
    setDescargandoFecha(null);
  };

  const abrirPanel = async () => {
    setAbierto(true);
    setCargando(true);
    setMensaje(null);
    const lista = await listarBackups();
    setBackups(lista);
    setCargando(false);
  };

  const confirmarRestauracion = (fecha) => {
    const texto =
      `¿Restaurar todos tus datos a como estaban el ${formatearFecha(fecha)}?\n\n` +
      "Esto va a reemplazar lo que tenés cargado ahora mismo en este dispositivo " +
      "por la copia de esa fecha. La página se va a recargar automáticamente " +
      "para mostrar los datos restaurados.\n\n" +
      "Esta acción no se puede deshacer (aunque siempre podés volver a elegir " +
      "otra copia después).";
    if (!window.confirm(texto)) return;
    ejecutarRestauracion(fecha);
  };

  const ejecutarRestauracion = async (fecha) => {
    setRestaurandoFecha(fecha);
    setMensaje(null);
    const resultado = await restaurarBackup(fecha);
    if (resultado.exito) {
      setMensaje({ tipo: "exito", texto: "✅ Restaurado. Recargando la página..." });
      setTimeout(() => window.location.reload(), 1200);
    } else {
      setMensaje({
        tipo: "error",
        texto: "⚠️ No se pudo restaurar esa copia. Revisá tu conexión y probá de nuevo.",
      });
      setRestaurandoFecha(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={abrirPanel}
        title="Copias de seguridad"
        style={{
          position: "fixed",
          bottom: 58,
          left: 16,
          zIndex: 250,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--crema, #FFFFFF)",
          border: "1.5px solid var(--marron-cuero, #8B5A2B)",
          borderRadius: 999,
          padding: "6px 12px",
          boxShadow: "0 2px 8px rgba(59,42,29,0.12)",
          fontFamily: "'Inter', sans-serif",
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--marron-cuero-oscuro, #714823)",
          cursor: "pointer",
        }}
      >
        🕑 Copias de seguridad
      </button>

      {abierto && (
        <div
          onClick={() => setAbierto(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--crema, #FFFFFF)",
              borderRadius: 16,
              padding: "20px 18px",
              width: "100%",
              maxWidth: 420,
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2
                style={{
                  fontFamily: "'PP Neue Montreal Bold', serif",
                  fontSize: 17,
                  fontWeight: 700,
                  color: "var(--marron-oscuro, #3B2A1D)",
                  margin: 0,
                }}
              >
                Copias de seguridad
              </h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#8A7A63" }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#8A7A63", margin: "0 0 14px", lineHeight: 1.4 }}>
              Se guarda una copia automática por día. Podés volver a cualquiera de los
              últimos 30 días si algo se cargó mal o se perdió.
            </p>

            <button
              type="button"
              onClick={descargarActual}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1.5px solid var(--verde-monte, #3E4E2F)",
                background: "#FFFDF8",
                color: "var(--verde-monte, #3E4E2F)",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: 16,
              }}
            >
            >
              ⬇️ Descargar todo lo que tengo cargado ahora (archivo .json)
            </button>

            <button
              type="button"
              onClick={recuperarDesdeAnimales}
              disabled={recuperandoAnimales}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1.5px solid var(--marron-cuero, #8B5A2B)",
                background: "#FFFDF8",
                color: "var(--marron-cuero-oscuro, #714823)",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: recuperandoAnimales ? "not-allowed" : "pointer",
                marginBottom: 16,
                opacity: recuperandoAnimales ? 0.6 : 1,
              }}
            >
              {recuperandoAnimales ? "Recuperando..." : "🔄 Recuperar animales desde Firebase (emergencia)"}
            </button>

            {mensaje && (
            {mensaje && (
              <div
                style={{
                  background: mensaje.tipo === "error" ? "#FDECEA" : "#EAF3E4",
                  border: `1px solid ${mensaje.tipo === "error" ? "#C62828" : "var(--verde-exito, #4F6B3A)"}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: mensaje.tipo === "error" ? "#C62828" : "var(--verde-exito, #4F6B3A)",
                  marginBottom: 14,
                }}
              >
                {mensaje.texto}
              </div>
            )}

            {cargando ? (
              <p style={{ fontSize: 13, color: "#8A7A63", textAlign: "center" }}>Cargando copias...</p>
            ) : backups.length === 0 ? (
              <p style={{ fontSize: 13, color: "#8A7A63", textAlign: "center" }}>
                Todavía no hay copias de seguridad guardadas. Se va a crear la primera
                la próxima vez que guardes algo.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {backups.map((b) => (
                  <div
                    key={b.fecha}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--borde, #E2DCCB)",
                      background: "#FFFDF8",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--marron-oscuro, #3B2A1D)" }}>
                        {formatearFecha(b.fecha)}
                        {esHoy(b.fecha) && (
                          <span style={{ fontWeight: 600, color: "var(--verde-monte, #3E4E2F)" }}> (hoy)</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => descargarBackup(b.fecha)}
                        disabled={descargandoFecha === b.fecha}
                        title="Descargar esta copia (.json)"
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1.5px solid var(--marron-cuero, #8B5A2B)",
                          background: "#FFFDF8",
                          color: "var(--marron-cuero-oscuro, #714823)",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: descargandoFecha === b.fecha ? "not-allowed" : "pointer",
                          opacity: descargandoFecha === b.fecha ? 0.6 : 1,
                        }}
                      >
                        {descargandoFecha === b.fecha ? "..." : "⬇️"}
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmarRestauracion(b.fecha)}
                        disabled={restaurandoFecha === b.fecha}
                        style={{
                          padding: "7px 12px",
                          borderRadius: 8,
                          border: "none",
                          background: "var(--marron-cuero, #8B5A2B)",
                          color: "#FBF7ED",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: restaurandoFecha === b.fecha ? "not-allowed" : "pointer",
                          opacity: restaurandoFecha === b.fecha ? 0.6 : 1,
                        }}
                      >
                        {restaurandoFecha === b.fecha ? "Restaurando..." : "Restaurar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
