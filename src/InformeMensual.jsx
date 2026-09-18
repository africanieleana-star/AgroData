import React, { useState } from "react";

export default function InformeMensual({ animales = [], tareasSanidad = [], ventas = [] }) {
  const [cargando, setCargando] = useState(false);

  const generarPDF = () => {
    setCargando(true);

    try {
      // 1. Sanitización de listas de datos
      const listaAnimales = Array.isArray(animales) ? animales : [];
      const listaSanidad = Array.isArray(tareasSanidad) ? tareasSanidad : [];
      const listaVentas = Array.isArray(ventas) ? ventas : [];

      // 2. Cálculos estadísticos detallados
      const totalCabezas = listaAnimales.length;
      const preñadas = listaAnimales.filter(a => a.estadoReproductivo === "Preñada" || a.estado === "Preñada").length;
      const vacias = listaAnimales.filter(a => a.estadoReproductivo === "Vacía" || a.estado === "Vacía").length;
      const porcentajePrenez = totalCabezas > 0 ? ((preñadas / totalCabezas) * 100).toFixed(1) : "0.0";

      // 3. Filas dinámicas para la tabla de animales (Lectura flexible de categoría / tipo)
      const filasAnimales = listaAnimales.length > 0 
        ? listaAnimales.map((a, i) => {
            // Se busca la propiedad en orden de prioridad
            const categoriaReal = a.categoria || a.tipo || a.tipoAnimal || a.categoriaAnimal || 'Sin cat.';
            const caravanaReal = a.caravana || a.id || `A-${i+1}`;
            const razaReal = a.raza || 'N/D';
            const estadoReal = a.estadoReproductivo || a.estado || 'Normal';
            const obsReal = a.observaciones || a.notas || '-';

            return `
              <tr>
                <td style="text-align: center; font-weight: bold;">${caravanaReal}</td>
                <td>${categoriaReal}</td>
                <td>${razaReal}</td>
                <td style="text-align: center;">${estadoReal}</td>
                <td>${obsReal}</td>
              </tr>
            `;
          }).join('')
        : `<tr><td colspan="5" style="text-align: center; color: #888;">No hay animales registrados en el sistema.</td></tr>`;

      // 4. Filas dinámicas para sanidad
      const filasSanidad = listaSanidad.length > 0
        ? listaSanidad.map(s => `
            <tr>
              <td style="text-align: center;">${s.fecha || new Date().toLocaleDateString('es-AR')}</td>
              <td>${s.evento || s.tarea || 'Tratamiento'}</td>
              <td>${s.lote || s.categoria || 'Rodeo General'}</td>
              <td>${s.farmaco || s.producto || 'N/D'}</td>
            </tr>
          `).join('')
        : `<tr><td colspan="4" style="text-align: center; color: #888;">No hay tareas sanitarias aplicadas este mes.</td></tr>`;

      // 5. Filas dinámicas para ventas
      const filasVentas = listaVentas.length > 0
        ? listaVentas.map(v => `
            <tr>
              <td style="text-align: center;">${v.fecha || new Date().toLocaleDateString('es-AR')}</td>
              <td>${v.comprador || 'Cliente Particular'}</td>
              <td style="text-align: center;">${v.cantidad || 1} cabezas</td>
              <td style="text-align: right; font-weight: bold;">$${v.monto ? v.monto.toLocaleString('es-AR') : '0'}</td>
            </tr>
          `).join('')
        : `<tr><td colspan="4" style="text-align: center; color: #888;">No se registraron operaciones comerciales.</td></tr>`;

      // 6. Creación de la ventana de impresión
      const ventanaImpresion = window.open("", "_blank");

      if (!ventanaImpresion) {
        alert("Por favor, permití las ventanas emergentes para visualizar el informe.");
        setCargando(false);
        return;
      }

      ventanaImpresion.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>AgroData - Informe Técnico Consolidado</title>
            <style>
              @page { size: A4; margin: 18mm; }
              body {
                font-family: 'Helvetica Neue', Arial, sans-serif;
                color: #2C3E50;
                background-color: #FFFFFF;
                margin: 0;
                padding: 0;
                font-size: 12px;
              }
              .encabezado {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 2px solid #2E7D32;
                padding-bottom: 12px;
                margin-bottom: 20px;
              }
              .logo-container {
                display: flex;
                align-items: center;
                gap: 12px;
              }
              .logo-img {
                width: 48px;
                height: 48px;
                object-fit: cover;
                border-radius: 6px;
              }
              .titulo-app {
                color: #2E7D32;
                margin: 0;
                font-size: 24px;
                font-weight: bold;
              }
              .subtitulo-app {
                margin: 2px 0 0 0;
                color: #666;
                font-size: 11px;
              }
              .kpi-grid {
                display: flex;
                gap: 12px;
                margin-bottom: 20px;
              }
              .kpi-card {
                flex: 1;
                background-color: #F8F9FA;
                border: 1px solid #E9ECEF;
                border-radius: 6px;
                padding: 10px;
                text-align: center;
              }
              .kpi-valor {
                font-size: 18px;
                font-weight: bold;
                color: #1B5E20;
                margin-top: 4px;
              }
              .kpi-label {
                font-size: 10px;
                color: #666;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              .seccion {
                margin-bottom: 22px;
              }
              .seccion-titulo {
                color: #1B5E20;
                font-size: 14px;
                border-bottom: 1px solid #2E7D32;
                padding-bottom: 4px;
                margin-bottom: 10px;
                font-weight: bold;
                text-transform: uppercase;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 6px;
              }
              th {
                background-color: #E8F5E9;
                color: #1B5E20;
                padding: 8px;
                border: 1px solid #C8E6C9;
                font-size: 11px;
                text-align: left;
              }
              td {
                padding: 7px 8px;
                border: 1px solid #E0E0E0;
                font-size: 11px;
              }
              tr:nth-child(even) {
                background-color: #FAFAFA;
              }
              .firmas {
                margin-top: 45px;
                display: flex;
                justify-content: space-between;
                padding: 0 30px;
              }
              .firma-box {
                text-align: center;
                width: 200px;
                border-top: 1px solid #999;
                padding-top: 6px;
                font-size: 11px;
                color: #555;
              }
              .pie {
                margin-top: 30px;
                border-top: 1px dashed #CCC;
                padding-top: 10px;
                text-align: center;
                font-size: 10px;
                color: #888;
              }
            </style>
          </head>
          <body>
            <div class="encabezado">
              <div class="logo-container">
                <img src="/hojalogo.png" class="logo-img" alt="AgroData" />
                <div>
                  <h1 class="titulo-app">AgroData</h1>
                  <p class="subtitulo-app">Software de Gestión Ganadera Inteligente</p>
                </div>
              </div>
              <div style="text-align: right;">
                <h3 style="margin: 0; font-size: 13px; color: #333;">INFORME TÉCNICO CONSOLIDADO</h3>
                <p style="margin: 3px 0 0 0; font-size: 11px; color: #666;">Emisión: ${new Date().toLocaleDateString('es-AR')}</p>
              </div>
            </div>

            <!-- Resumen de Indicadores Clave -->
            <div class="kpi-grid">
              <div class="kpi-card">
                <div class="kpi-label">Total Rodeos</div>
                <div class="kpi-valor">${totalCabezas}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Vacas Preñadas</div>
                <div class="kpi-valor">${preñadas}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Índice Preñez</div>
                <div class="kpi-valor">${porcentajePrenez}%</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Tareas Aplicadas</div>
                <div class="kpi-valor">${listaSanidad.length}</div>
              </div>
            </div>

            <!-- Sección 1: Detalle Ganadero -->
            <div class="seccion">
              <div class="seccion-titulo">1. Inventario Detallado del Rodeo</div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 15%; text-align: center;">Caravana</th>
                    <th style="width: 20%;">Categoría</th>
                    <th style="width: 20%;">Raza</th>
                    <th style="width: 20%; text-align: center;">Estado Repro.</th>
                    <th style="width: 25%;">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${filasAnimales}
                </tbody>
              </table>
            </div>

            <!-- Sección 2: Registro Sanitario -->
            <div class="seccion">
              <div class="seccion-titulo">2. Historial Sanitario y Tratamientos</div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 15%; text-align: center;">Fecha</th>
                    <th style="width: 30%;">Evento / Trabajo</th>
                    <th style="width: 25%;">Lote / Categoría</th>
                    <th style="width: 30%;">Fármaco Aplicado</th>
                  </tr>
                </thead>
                <tbody>
                  ${filasSanidad}
                </tbody>
              </table>
            </div>

            <!-- Sección 3: Ventas y Salidas -->
            <div class="seccion">
              <div class="seccion-titulo">3. Movimientos Comerciales</div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 15%; text-align: center;">Fecha</th>
                    <th style="width: 40%;">Comprador / Destino</th>
                    <th style="width: 20%; text-align: center;">Cabezas</th>
                    <th style="width: 25%; text-align: right;">Monto Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${filasVentas}
                </tbody>
              </table>
            </div>

            <!-- Firmas -->
            <div class="firmas">
              <div class="firma-box">Firma Administrador / Propietario</div>
              <div class="firma-box">Firma Médico Veterinario</div>
            </div>

            <div class="pie">
              Documento digital generado automáticamente por la plataforma AgroData.
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
      alert("Error al intentar construir el reporte detallado.");
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
        📊 Reporte Técnico Detallado (PDF)
      </h3>
      <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#666" }}>
        Generá un informe completo con el logo oficial, métricas clave, inventario por caravana y espacio de firmas.
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
        {cargando ? "⏳ Preparando informe..." : "📄 Exportar Reporte Técnico Completo"}
      </button>
    </div>
  );
}
