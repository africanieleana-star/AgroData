import React, { useState } from "react";

export default function InformeMensual({ animales = [], tareasSanidad = [], ventas = [] }) {
  const [cargando, setCargando] = useState(false);

  const generarPDF = () => {
    setCargando(true);

    try {
      const elemento = document.createElement("div");
      elemento.style.padding = "30px";
      elemento.style.fontFamily = "'Helvetica Neue', Arial, sans-serif";
      elemento.style.color = "#2C3E50";

      // 1. Encabezado con Logo y Fecha
      const encabezadoHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2E7D32; padding-bottom: 12px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <svg width="36" height="36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 15 C30 15 15 30 15 50 C15 70 30 85 50 85 C70 85 85 70 85 50 C85 30 70 15 50 15 Z" fill="#2E7D32"/>
              <path d="M50 25 L65 45 L35 45 Z" fill="#A5D6A7"/>
              <path d="M50 40 L70 65 L30 65 Z" fill="#81C784"/>
            </svg>
            <div>
              <h1 style="color: #2E7D32; margin: 0; font-size: 22px; font-weight: bold;">AgroData</h1>
              <p style="margin: 0; color: #666; font-size: 12px;">Gestión Ganadera Inteligente</p>
            </div>
          </div>
          <div style="text-align: right;">
            <h3 style="margin: 0; color: #333; font-size: 14px;">INFORME MENSUAL CONSOLIDADO</h3>
            <p style="margin: 4px 0 0 0; color: #666; font-size: 11px;">Emisión: ${new Date().toLocaleDateString('es-AR')}</p>
          </div>
        </div>
      `;

      // 2. Cálculo de Totales por Sección
      const totalAnimales = Array.isArray(animales) ? animales.length : 0;
      const totalSanidad = Array.isArray(tareasSanidad) ? tareasSanidad.length : 0;
      const totalVentas = Array.isArray(ventas) ? ventas.length : 0;

      // 3. Plantilla de Secciones
      elemento.innerHTML = `
        ${encabezadoHTML}

        <!-- SECCIÓN 1: STOCK Y RESUMEN DE ANIMALES -->
        <div style="margin-bottom: 20px;">
          <h2 style="color: #1B5E20; font-size: 15px; border-bottom: 1px solid #E0E0E0; padding-bottom: 4px; margin-bottom: 10px;">
            1. Resumen de Stock Ganadero
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr style="background-color: #F5F7F5;">
              <td style="padding: 8px; border: 1px solid #E0E0E0; font-weight: bold;">Total Cabezas Registradas:</td>
              <td style="padding: 8px; border: 1px solid #E0E0E0;">${totalAnimales}</td>
            </tr>
          </table>
        </div>

        <!-- SECCIÓN 2: SANIDAD Y TRATAMIENTOS -->
        <div style="margin-bottom: 20px;">
          <h2 style="color: #1B5E20; font-size: 15px; border-bottom: 1px solid #E0E0E0; padding-bottom: 4px; margin-bottom: 10px;">
            2. Registro Sanitario y Tareas Aplicadas
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr style="background-color: #F5F7F5;">
              <td style="padding: 8px; border: 1px solid #E0E0E0; font-weight: bold;">Tareas / Sanidad del Mes:</td>
              <td style="padding: 8px; border: 1px solid #E0E0E0;">${totalSanidad} registros</td>
            </tr>
          </table>
        </div>

        <!-- SECCIÓN 3: VENTAS Y MOVIMIENTOS -->
        <div style="margin-bottom: 20px;">
          <h2 style="color: #1B5E20; font-size: 15px; border-bottom: 1px solid #E0E0E0; padding-bottom: 4px; margin-bottom: 10px;">
            3. Ventas y Movimientos Comerciales
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr style="background-color: #F5F7F5;">
              <td style="padding: 8px; border: 1px solid #E0E0E0; font-weight: bold;">Operaciones de Venta:</td>
              <td style="padding: 8px; border: 1px solid #E0E0E0;">${totalVentas} transacciones</td>
            </tr>
          </table>
        </div>

        <!-- PIE DE PÁGINA -->
        <div style="margin-top: 40px; border-top: 1px dashed #BDBDBD; padding-top: 10px; text-align: center; font-size: 10px; color: #757575;">
          Documento digital generado automáticamente por la aplicación AgroData.
        </div>
      `;

      // 4. Parámetros de Generación de PDF
      const opciones = {
        margin:       10,
        filename:     `AgroData_Informe_${new Date().getMonth() + 1}_${new Date().getFullYear()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      if (window.html2pdf) {
        window.html2pdf().set(opciones).from(elemento).save().then(() => setCargando(false));
      } else {
        alert("Cargando el generador de PDF. Reintentá en unos segundos.");
        setCargando(false);
      }
    } catch (err) {
      console.error(err);
      alert("Error al armar la estructura del PDF.");
      setCargando(false);
    }
  };

  return (
    <div style={{
      background: "#FFF",
      padding: "16px",
      borderRadius: "16px",
      border: "1px solid #E0E0E0",
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      marginTop: "12px",
      marginBottom: "12px"
    }}>
      <h3 style={{ margin: "0 0 6px 0", color: "#2E3D29", fontSize: "16px" }}>
        📊 Reporte Mensual PDF
      </h3>
      <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#666" }}>
        Exportá un documento prolijo con el logo de AgroData, fecha e información organizada por secciones.
      </p>

      <button
        type="button"
        onClick={generarPDF}
        disabled={cargando}
        style={{
          width: "100%",
          padding: "12px 16px",
          backgroundColor: cargando ? "#81C784" : "#2E7D32",
          color: "white",
          border: "none",
          borderRadius: "10px",
          fontWeight: "bold",
          fontSize: "14px",
          cursor: cargando ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px"
        }}
      >
        {cargando ? "⏳ Generando PDF..." : "📄 Descargar Informe Mensual (PDF)"}
      </button>
    </div>
  );
}
