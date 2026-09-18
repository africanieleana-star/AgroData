import React, { useState } from "react";

export default function InformeMensual({ animales = [], tareasSanidad = [], ventas = [] }) {
  const [cargando, setCargando] = useState(false);

  const generarPDF = () => {
    setCargando(true);

    try {
      // 1. Crear el contenedor del informe
      const elemento = document.createElement("div");
      elemento.id = "reporte-impresion-temp";
      
      // ESTILOS CLAVE: Fondo blanco puro y posición para que sea visible por el capturador
      elemento.style.backgroundColor = "#FFFFFF";
      elemento.style.color = "#2C3E50";
      elemento.style.padding = "30px";
      elemento.style.fontFamily = "Arial, sans-serif";
      elemento.style.width = "700px";

      // 2. Encabezado con Isotipo de AgroData
      const encabezadoHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2E7D32; padding-bottom: 12px; margin-bottom: 20px;">
          <div>
            <h1 style="color: #2E7D32; margin: 0; font-size: 24px; font-weight: bold;">🌱 AgroData</h1>
            <p style="margin: 2px 0 0 0; color: #555; font-size: 12px;">Gestión Ganadera Inteligente</p>
          </div>
          <div style="text-align: right;">
            <h3 style="margin: 0; color: #333; font-size: 14px;">INFORME MENSUAL CONSOLIDADO</h3>
            <p style="margin: 4px 0 0 0; color: #666; font-size: 11px;">Emisión: ${new Date().toLocaleDateString('es-AR')}</p>
          </div>
        </div>
      `;

      // 3. Totales calculados de forma segura
      const totalAnimales = Array.isArray(animales) ? animales.length : 0;
      const totalSanidad = Array.isArray(tareasSanidad) ? tareasSanidad.length : 0;
      const totalVentas = Array.isArray(ventas) ? ventas.length : 0;

      // 4. Estructura visual de las Secciones
      elemento.innerHTML = `
        ${encabezadoHTML}

        <div style="margin-bottom: 20px;">
          <h2 style="color: #1B5E20; font-size: 15px; border-bottom: 1px solid #E0E0E0; padding-bottom: 4px; margin-bottom: 10px;">
            1. Resumen de Stock Ganadero
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr style="background-color: #F5F7F5;">
              <td style="padding: 10px; border: 1px solid #E0E0E0; font-weight: bold;">Total Cabezas Registradas:</td>
              <td style="padding: 10px; border: 1px solid #E0E0E0;">${totalAnimales} animales</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 20px;">
          <h2 style="color: #1B5E20; font-size: 15px; border-bottom: 1px solid #E0E0E0; padding-bottom: 4px; margin-bottom: 10px;">
            2. Registro Sanitario y Tareas Aplicadas
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr style="background-color: #F5F7F5;">
              <td style="padding: 10px; border: 1px solid #E0E0E0; font-weight: bold;">Tareas / Sanidad del Mes:</td>
              <td style="padding: 10px; border: 1px solid #E0E0E0;">${totalSanidad} registros</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 20px;">
          <h2 style="color: #1B5E20; font-size: 15px; border-bottom: 1px solid #E0E0E0; padding-bottom: 4px; margin-bottom: 10px;">
            3. Ventas y Movimientos Comerciales
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr style="background-color: #F5F7F5;">
              <td style="padding: 10px; border: 1px solid #E0E0E0; font-weight: bold;">Operaciones de Venta:</td>
              <td style="padding: 10px; border: 1px solid #E0E0E0;">${totalVentas} transacciones</td>
            </tr>
          </table>
        </div>

        <div style="margin-top: 50px; border-top: 1px dashed #BDBDBD; padding-top: 10px; text-align: center; font-size: 10px; color: #757575;">
          Documento digital consolidado generado automáticamente por AgroData.
        </div>
      `;

      // 5. Pegamos temporalmente el diseño al cuerpo de la página para que la librería lo "vea"
      document.body.appendChild(elemento);

      // 6. Opciones de descarga
      const opciones = {
        margin:       10,
        filename:     `AgroData_Informe_${new Date().getMonth() + 1}_${new Date().getFullYear()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, backgroundColor: '#FFFFFF' },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // 7. Descargar y limpiar el elemento temporal
      if (window.html2pdf) {
        window.html2pdf().set(opciones).from(elemento).save().then(() => {
          document.body.removeChild(elemento);
          setCargando(false);
        }).catch((err) => {
          console.error("Error al guardar PDF:", err);
          if (document.getElementById("reporte-impresion-temp")) {
            document.body.removeChild(elemento);
          }
          setCargando(false);
        });
      } else {
        alert("Cargando la herramienta de PDF. Por favor reintentá en 5 segundos.");
        if (document.getElementById("reporte-impresion-temp")) {
          document.body.removeChild(elemento);
        }
        setCargando(false);
      }
    } catch (err) {
      console.error("Error en la función:", err);
      alert("Hubo un problema al armar el PDF.");
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
        {cargando ? "⏳ Generando PDF..." : "📄 Descargar Informe Mensual (PDF)"}
      </button>
    </div>
  );
}
