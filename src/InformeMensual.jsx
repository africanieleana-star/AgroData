import React, { useState } from "react";

export default function InformeMensual({ animales = [], tareasSanidad = [], ventas = [] }) {
  const [cargando, setCargando] = useState(false);

  const generarPDF = () => {
    setCargando(true);

    try {
      // 1. Contar elementos asegurando que no tire error si están vacíos
      const cantAnimales = Array.isArray(animales) ? animales.length : 0;
      const cantSanidad = Array.isArray(tareasSanidad) ? tareasSanidad.length : 0;
      const cantVentas = Array.isArray(ventas) ? ventas.length : 0;

      // 2. Crear una ventana de impresión limpia
      const ventanaImpresion = window.open("", "_blank");

      if (!ventanaImpresion) {
        alert("Por favor, permití las ventanas emergentes en tu navegador para descargar el PDF.");
        setCargando(false);
        return;
      }

      // 3. Escribir el documento directamente con HTML y CSS estándar de impresión
      ventanaImpresion.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>AgroData - Informe Mensual</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 40px;
                color: #333333;
                background-color: #ffffff;
              }
              .encabezado {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 3px solid #2E7D32;
                padding-bottom: 12px;
                margin-bottom: 30px;
              }
              .titulo-app {
                color: #2E7D32;
                margin: 0;
                font-size: 28px;
                font-weight: bold;
              }
              .subtitulo-app {
                margin: 4px 0 0 0;
                color: #666666;
                font-size: 13px;
              }
              .seccion {
                margin-bottom: 25px;
              }
              .seccion-titulo {
                color: #1B5E20;
                font-size: 16px;
                border-bottom: 1px solid #DDDDDD;
                padding-bottom: 6px;
                margin-bottom: 12px;
                font-weight: bold;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 8px;
              }
              td {
                padding: 10px;
                border: 1px solid #DDDDDD;
                font-size: 13px;
              }
              .label {
                background-color: #F5F7F5;
                font-weight: bold;
                width: 60%;
              }
              .pie {
                margin-top: 50px;
                border-top: 1px dashed #CCCCCC;
                padding-top: 12px;
                text-align: center;
                font-size: 11px;
                color: #777777;
              }
            </style>
          </head>
          <body>
            <div class="encabezado">
              <div>
                <h1 class="titulo-app">🌱 AgroData</h1>
                <p class="subtitulo-app">Gestión Ganadera Inteligente</p>
              </div>
              <div style="text-align: right;">
                <h3 style="margin: 0; font-size: 14px;">INFORME MENSUAL CONSOLIDADO</h3>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #666666;">Fecha: ${new Date().toLocaleDateString('es-AR')}</p>
              </div>
            </div>

            <div class="seccion">
              <div class="seccion-titulo">1. Resumen de Stock Ganadero</div>
              <table>
                <tr>
                  <td class="label">Total Cabezas Registradas:</td>
                  <td>${cantAnimales} animales</td>
                </tr>
              </table>
            </div>

            <div class="seccion">
              <div class="seccion-titulo">2. Registro Sanitario</div>
              <table>
                <tr>
                  <td class="label">Tareas Sanitarias del Mes:</td>
                  <td>${cantSanidad} registros</td>
                </tr>
              </table>
            </div>

            <div class="seccion">
              <div class="seccion-titulo">3. Movimientos Comerciales</div>
              <table>
                <tr>
                  <td class="label">Operaciones de Venta:</td>
                  <td>${cantVentas} ventas</td>
                </tr>
              </table>
            </div>

            <div class="pie">
              Documento digital generado automáticamente desde AgroData.
            </div>

            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
        </html>
      `);

      ventanaImpresion.document.close();
      setCargando(false);
    } catch (err) {
      console.error(err);
      alert("Error al intentar abrir la vista de impresión.");
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
        Exportá un documento con el logo de AgroData, fecha y datos organizados por secciones.
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
        {cargando ? "⏳ Abriendo..." : "📄 Descargar / Imprimir Informe (PDF)"}
      </button>
    </div>
  );
}
