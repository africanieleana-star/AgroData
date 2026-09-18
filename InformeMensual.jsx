import React, { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// ------------------------------------------------------------------
// Funciones para leer los datos guardados (leen directo de localStorage,
// igual que hace el resto de la app, sin depender de App.jsx)
// ------------------------------------------------------------------
function leerTodosLosAnimales() {
  const animales = [];
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    if (!clave || !clave.startsWith("animal:")) continue;
    try {
      const ficha = JSON.parse(localStorage.getItem(clave));
      if (ficha && ficha.caravana) animales.push(ficha);
    } catch (e) {
      // ficha corrupta, se omite
    }
  }
  return animales;
}

function leerVentasGuardadas() {
  try {
    const data = localStorage.getItem("agrodata_ventas");
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function leerSanidadGuardada() {
  try {
    const guardadas = JSON.parse(localStorage.getItem("tareas_manuales") || "[]");
    return guardadas.filter((t) => t.texto && t.texto.includes("💉 Sanidad:"));
  } catch (e) {
    return [];
  }
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return "-";
  const partes = fechaISO.split("-");
  if (partes.length !== 3) return fechaISO;
  const [anio, mes, dia] = partes;
  return `${dia}/${mes}/${anio}`;
}

function esDelMes(fechaISO, mes, anio) {
  if (!fechaISO) return false;
  const mesPad = String(mes).padStart(2, "0");
  return fechaISO.startsWith(`${anio}-${mesPad}`);
}

function calcularMontoVenta(venta) {
  const num = (v) => {
    if (!v) return null;
    const n = parseFloat(String(v).replace(",", "."));
    return isNaN(n) ? null : n;
  };
  const porUnidad = num(venta.precioPorUnidad);
  if (porUnidad !== null) return porUnidad * (venta.animales?.length || 1);
  const porKilo = num(venta.precioPorKilo);
  const kilos = num(venta.cantidadKilos);
  if (porKilo !== null && kilos !== null) return porKilo * kilos;
  return null;
}

function formatearMonto(v) {
  if (v === null || v === undefined || isNaN(v)) return "-";
  return `$${Math.round(v).toLocaleString("es-AR")}`;
}

function estadoDe(ficha) {
  if (ficha.fallecimiento?.fecha) return "Falleció";
  if (ficha.vendido) return "Vendido";
  if (ficha.esCria) return "-";
  const aplica = ["Vaca", "Vaquillona", "Ternera"];
  if (!aplica.includes(ficha.tipo)) return "-";
  const yaParida =
    ficha.paricion?.fecha ||
    (Array.isArray(ficha.historialCrias) && ficha.historialCrias.length > 0);
  if (yaParida) return "Parida";
  if (ficha.tacto?.resultado === "Preniada") return "Preñada";
  if (ficha.tacto?.resultado === "Vacia") return "Vacía";
  return "Vacía";
}

// Si estamos muy abajo en la página, agrega una nueva antes de seguir
// escribiendo, para que no se corte un título justo al final de la hoja.
function agregarPaginaSiHaceFalta(doc, y, margen = 30) {
  const alturaPagina = doc.internal.pageSize.getHeight();
  if (y > alturaPagina - margen) {
    doc.addPage();
    return 20;
  }
  return y;
}

// ------------------------------------------------------------------
// Arma el PDF completo para el mes y año indicados
// ------------------------------------------------------------------
function generarInformePDF(mes, anio) {
  const animales = leerTodosLosAnimales();
  const ventas = leerVentasGuardadas();
  const sanidad = leerSanidadGuardada();

  const doc = new jsPDF();
  const nombreMes = MESES[mes - 1];
  let y = 20;

  // Encabezado
  doc.setFontSize(18);
  doc.setTextColor(62, 78, 47);
  doc.text("AgroData - Informe Mensual", 14, y);
  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(`Periodo: ${nombreMes} ${anio}`, 14, y);
  y += 6;
  doc.text(`Generado el: ${new Date().toLocaleDateString("es-AR")}`, 14, y);
  y += 10;

  // --- NACIMIENTOS DEL MES ---
  const nacimientos = [];
  animales.forEach((madre) => {
    (madre.historialCrias || []).forEach((cria) => {
      if (esDelMes(cria.fechaNacimiento, mes, anio)) {
        nacimientos.push([
          cria.caravana || "Sin caravana",
          madre.caravana,
          formatearFecha(cria.fechaNacimiento),
          cria.sexo === "Macho" ? "Macho" : cria.sexo === "Hembra" ? "Hembra" : "-",
          cria.pesoNacer || "-",
          cria.nombrePadre || "Sin registrar",
        ]);
      }
    });
  });

  y = agregarPaginaSiHaceFalta(doc, y);
  doc.setFontSize(13);
  doc.setTextColor(62, 78, 47);
  doc.text("Nacimientos del mes", 14, y);
  y += 4;
  if (nacimientos.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Caravana cría", "Madre", "Fecha", "Sexo", "Peso", "Padre"]],
      body: nacimientos,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [62, 78, 47] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("Sin nacimientos registrados este mes.", 14, y + 6);
    y += 16;
  }

  // --- TACTOS DEL MES ---
  const tactos = animales
    .filter((a) => a.tacto && esDelMes(a.tacto.fecha, mes, anio))
    .map((a) => [
      a.caravana,
      formatearFecha(a.tacto.fecha),
      a.tacto.resultado === "Preniada" ? "Preñada" : a.tacto.resultado === "Vacia" ? "Vacía" : "-",
    ]);

  y = agregarPaginaSiHaceFalta(doc, y);
  doc.setFontSize(13);
  doc.setTextColor(62, 78, 47);
  doc.text("Tactos del mes", 14, y);
  y += 4;
  if (tactos.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Caravana", "Fecha", "Resultado"]],
      body: tactos,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [62, 78, 47] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("Sin tactos registrados este mes.", 14, y + 6);
    y += 16;
  }

  // --- SERVICIOS DEL MES ---
  const servicios = [];
  animales.forEach((a) => {
    (a.historialServicios || []).forEach((s) => {
      if (s.inseminacion?.fecha && esDelMes(s.inseminacion.fecha, mes, anio)) {
        servicios.push([a.caravana, "Inseminación", formatearFecha(s.inseminacion.fecha), s.inseminacion.nombre || "-"]);
      }
      if (s.toro?.fecha && esDelMes(s.toro.fecha, mes, anio)) {
        servicios.push([
          a.caravana,
          s.toro.esRepasoToro ? "Repaso con Toro" : "Servicio Toro",
          formatearFecha(s.toro.fecha),
          s.toro.nombre || "-",
        ]);
      }
    });
  });

  y = agregarPaginaSiHaceFalta(doc, y);
  doc.setFontSize(13);
  doc.setTextColor(62, 78, 47);
  doc.text("Servicios del mes", 14, y);
  y += 4;
  if (servicios.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Caravana", "Tipo", "Fecha", "Nombre"]],
      body: servicios,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [62, 78, 47] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("Sin servicios registrados este mes.", 14, y + 6);
    y += 16;
  }

  // --- SANIDAD DEL MES ---
  const sanidadDelMes = sanidad
    .filter((t) => esDelMes(t.fecha, mes, anio))
    .map((t) => [formatearFecha(t.fecha), t.texto.replace("💉 Sanidad: ", "")]);

  y = agregarPaginaSiHaceFalta(doc, y);
  doc.setFontSize(13);
  doc.setTextColor(139, 90, 43);
  doc.text("Sanidad y vacunación del mes", 14, y);
  y += 4;
  if (sanidadDelMes.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Tratamiento"]],
      body: sanidadDelMes,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [139, 90, 43] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("Sin aplicaciones de sanidad registradas este mes.", 14, y + 6);
    y += 16;
  }

  // --- VENTAS DEL MES ---
  const ventasDelMes = ventas.filter((v) => esDelMes(v.fecha, mes, anio));
  const filasVentas = ventasDelMes.map((v) => [
    formatearFecha(v.fecha),
    String((v.animales || []).length),
    (v.animales || []).join(", "),
    formatearMonto(calcularMontoVenta(v)),
  ]);

  y = agregarPaginaSiHaceFalta(doc, y);
  doc.setFontSize(13);
  doc.setTextColor(139, 90, 43);
  doc.text("Ventas del mes", 14, y);
  y += 4;
  if (filasVentas.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Cant. animales", "Caravanas", "Monto"]],
      body: filasVentas,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [139, 90, 43] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;

    const totalFacturado = ventasDelMes.reduce(
      (acc, v) => acc + (calcularMontoVenta(v) || 0),
      0
    );
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text(`Total facturado en el mes: ${formatearMonto(totalFacturado)}`, 14, y);
    y += 12;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("Sin ventas registradas este mes.", 14, y + 6);
    y += 16;
  }

  // --- LISTADO COMPLETO DE ANIMALES ACTIVOS (foto de hoy) ---
  doc.addPage();
  y = 20;
  doc.setFontSize(15);
  doc.setTextColor(62, 78, 47);
  doc.text("Listado completo de animales activos", 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("(Foto del rodeo a la fecha de generacion de este informe)", 14, y);
  y += 8;

  const activos = animales.filter((a) => !a.vendido);
  const filasAnimales = activos
    .sort((a, b) => (a.caravana || "").localeCompare(b.caravana || ""))
    .map((a) => [a.caravana, a.tipo || "-", a.raza || "-", a.establecimiento || "-", estadoDe(a)]);

  if (filasAnimales.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Caravana", "Tipo", "Raza", "Establecimiento", "Estado"]],
      body: filasAnimales,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [62, 78, 47] },
      margin: { left: 14, right: 14 },
    });
  } else {
    doc.text("No hay animales cargados.", 14, y);
  }

  // Numeración de páginas
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `AgroData - Pagina ${p} de ${totalPaginas}`,
      14,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  doc.save(`AgroData_Informe_${nombreMes}_${anio}.pdf`);
}

// ------------------------------------------------------------------
// Componente visual: botón + ventana para elegir mes y año
// ------------------------------------------------------------------
export default function InformeMensual() {
  const [abierto, setAbierto] = useState(false);
  const hoy = new Date();
  const [mesSel, setMesSel] = useState(hoy.getMonth() + 1);
  const [anioSel, setAnioSel] = useState(hoy.getFullYear());
  const [generando, setGenerando] = useState(false);

  const aniosDisponibles = [];
  for (let a = hoy.getFullYear(); a >= hoy.getFullYear() - 5; a--) {
    aniosDisponibles.push(a);
  }

  const descargar = () => {
    setGenerando(true);
    try {
      generarInformePDF(mesSel, anioSel);
    } catch (e) {
      console.error(e);
      alert("No se pudo generar el informe. Probá de nuevo.");
    } finally {
      setGenerando(false);
      setAbierto(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          border: "2px solid var(--marron-cuero)",
          background: "#FFFDF8",
          color: "var(--marron-cuero-oscuro)",
          fontFamily: "'PP Neue Montreal Bold', serif",
          fontWeight: 700,
          fontSize: 13.5,
          cursor: "pointer",
        }}
      >
        📄 Descargar informe mensual (PDF)
      </button>

      {abierto && (
        <div
          onClick={() => !generando && setAbierto(false)}
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
              padding: "22px 18px",
              width: "100%",
              maxWidth: 360,
              boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
            }}
          >
            <h2
              style={{
                fontFamily: "'PP Neue Montreal Bold', serif",
                fontSize: 17,
                fontWeight: 700,
                color: "var(--marron-oscuro, #3B2A1D)",
                margin: "0 0 14px",
              }}
            >
              📄 Informe mensual
            </h2>

            <p style={{ fontSize: 12.5, color: "#8A7A63", margin: "0 0 16px", lineHeight: 1.4 }}>
              Elegí el mes y el año. El PDF va a incluir nacimientos, tactos,
              servicios, sanidad y ventas de ese período, además del listado
              completo de animales activos.
            </p>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8A7A63", marginBottom: 4 }}>
                  Mes
                </label>
                <select
                  value={mesSel}
                  onChange={(e) => setMesSel(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 10,
                    border: "2px solid #E0D8C3",
                    background: "#F5F2EC",
                    fontSize: 13.5,
                    color: "#3B2A1D",
                  }}
                >
                  {MESES.map((nombre, idx) => (
                    <option key={nombre} value={idx + 1}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8A7A63", marginBottom: 4 }}>
                  Año
                </label>
                <select
                  value={anioSel}
                  onChange={(e) => setAnioSel(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 10,
                    border: "2px solid #E0D8C3",
                    background: "#F5F2EC",
                    fontSize: 13.5,
                    color: "#3B2A1D",
                  }}
                >
                  {aniosDisponibles.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={descargar}
              disabled={generando}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: 10,
                border: "none",
                background: "var(--verde-monte, #3E4E2F)",
                color: "#FBF7ED",
                fontFamily: "'PP Neue Montreal Bold', serif",
                fontWeight: 700,
                fontSize: 14,
                cursor: generando ? "not-allowed" : "pointer",
                opacity: generando ? 0.6 : 1,
                marginBottom: 8,
              }}
            >
              {generando ? "Generando..." : "⬇️ Descargar PDF"}
            </button>

            <button
              type="button"
              onClick={() => setAbierto(false)}
              disabled={generando}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 10,
                border: "none",
                background: "transparent",
                color: "#8A7A63",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
