import React, { useState } from "react";

export default function InformeMensual({ animales = [], tareasSanidad = [], ventas = [] }) {
  const [cargando, setCargando] = useState(false);

  const generarPDF = () => {
    setCargando(true);

    try {
      // 1. Crear un contenedor en el DOM
      const elemento = document.createElement("div");
      elemento.id = "area-pdf-impresion";
      
      // Estilos forzados para garantizar visibilidad total
      elemento.style.position = "absolute";
      elemento.style.left = "-9999px"; // Oculto fuera de la pantalla del usuario pero visible para el navegador
      elemento.style.top = "0";
      elemento.style.width = "750px";
      elemento.style.backgroundColor = "#ffffff";
      elemento.style.color = "#000000";
      elemento.style.padding = "30px";
      elemento.style.boxSizing = "border-box";
      elemento.style.fontFamily = "Arial, sans-serif";

      // 2. Cálculos de Totales
      const totalAnimales = Array.isArray(animales) ? animales.length : 0;
      const totalSanidad = Array.isArray(tareasSanidad) ? tareasSanidad.length : 0;
      const totalVentas = Array.isArray(ventas) ? ventas.length : 0;

      // 3. Contenido HTML del informe
      elemento.innerHTML = `
        <div style="background-color: #ffffff; color: #000000; width: 100%;">
          
          <!-- Encabezado con Isotipo de AgroData -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2E7D32; padding-bottom: 12px; margin-bottom: 25px;">
            <div>
              <h1 style="color: #2E7D32; margin: 0; font-size: 26px; font-weight: bold;">🌱 AgroData</h1>
              <p style="margin: 4px 0 0 0; color: #444444; font-size: 13px;">Gestión Ganadera Inteligente</p>
            </div>
            <div style="text-align: right;">
              <h3 style="margin: 0; color: #111111; font-size: 15px; font-weight: bold;">INFORME MENSUAL CONSOLIDADO</h3>
              <p style="margin: 4px 0 0 0; color: #555555; font-size: 12px;">Fecha: ${new Date().toLocaleDateString('es-AR')}</p>
            </div>
          </div>

          <!-- Sección 1 -->
          <div style="margin-bottom: 25px;">
            <h2 style="color: #1B5E20; font-size: 16px; border-bottom: 1px solid #CCCCCC; padding-bottom: 5px; margin-bottom: 12px; font-weight: bold;">
              1. Resumen de Stock Ganadero
            </h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #000000;">
              <tr style="background-color: #F5F7F5;">
                <td style="padding: 10px; border: 1px solid #DDDDDD; font-weight: bold; width: 60%;">Total Cabezas Registradas:</td>
                <td style="padding: 10px; border: 1px solid #DDDDDD; color: #000000;">${totalAnimales} animales</td>
              </tr>
            </table>
          </div>

          <!-- Sección 2 -->
          <div style="margin-bottom: 25px;">
            <h2 style="color: #1B5E20; font-size: 16px; border-bottom: 1px solid #CCCCCC; padding-bottom: 5px; margin-bottom: 12px; font-weight: bold;">
              2. Registro Sanitario y Tareas
            </h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #000000;">
              <tr style="background-color: #F5F7F5;">
                <td style="padding: 10px; border: 1px solid #DDDDDD; font-weight: bold; width: 60%;">Tareas Sanitarias del Mes:</td>
                <td style="padding: 10px; border: 1px solid #DDDDDD; color: #000000;">${totalSanidad} registros</td>
              </tr>
            </table>
          </div>

          <!-- Sección 3 -->
          <div style="margin-bottom: 25px;">
            <h2 style="color: #1B5E20; font-size: 16px; border-bottom: 1px solid #CCCCCC; padding-bottom: 5px; margin-bottom: 12px; font-weight: bold;">
              3. Ventas y Movimientos
            </h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #000000;">
              <tr style="background-color: #F5F7F5;">
                <td style="padding: 10px; border: 1px solid #DDDDDD; font-weight: bold; width: 60%;">Operaciones Comerciales:</td>
                <td style="padding: 10px; border: 1px solid #DDDDDD; color: #000000;">${totalVentas} ventas</td>
              </tr>
            </table>
          </div>

          <!-- Pie de página -->
          <div style="margin-top: 60px; border-top: 1px dashed #AAAAAA; padding-top: 12px; text-align: center; font-size: 11px; color: #666666;">
            Documento digital generado automáticamente desde la aplicación AgroData.
          </div>

        </div>
      `;

      // 4. Inserción en el documento
      document.body.appendChild(elemento);

      // 5. Configuración de html2pdf
      const opciones = {
        margin:       10,
        filename:     `AgroData_Informe_${new Date().getMonth() + 1}_${new Date().getFullYear()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
          scale: 2, 
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // 6. Esperamos 300 ms antes de generar para darle tiempo al navegador de renderizar el texto
      setTimeout(() => {
        if (window.html2pdf) {
          window.html2pdf().set(opciones).from(elemento).save().then(() => {
            if (document.getElementById("area-pdf-impresion")) {
              document.body.removeChild(elemento);
            }
            setCargando(false);
          }).catch((err) => {
            console.error("Error guardando PDF:", err);
            if (document.getElementById("area-pdf-impresion")) {
              document.body.removeChild(elemento);
            }
            setCargando(false);
          });
        } else {
          alert("Reintentá en unos segundos mientras carga la herramienta.");
          if (document.getElementById("area-pdf-impresion")) {
            document.body.removeChild(elemento);
          }
          setCargando(false);
        }
      }, 300);

    } catch (err) {
      console.error("Error al construir PDF:", err);
      alert("No se pudo generar el informe.");
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
