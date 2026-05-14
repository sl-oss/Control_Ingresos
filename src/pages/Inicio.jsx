import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Inicio() {
  const navigate = useNavigate();
  const [empresa, setEmpresa] = useState(null);

  useEffect(() => {
    const empresaGuardada =
      localStorage.getItem("empresaSeleccionada") ||
      sessionStorage.getItem("empresaSeleccionada");

    if (!empresaGuardada) {
      navigate("/");
      return;
    }

    try {
      setEmpresa(JSON.parse(empresaGuardada));
    } catch {
      navigate("/");
    }
  }, [navigate]);

  return (
    <div className="page">
      <div className="container">
        {/* HEADER */}
        <div className="topbar">
          <div>
            <h1 className="title">🏠 Inicio</h1>
            <p className="subtitle">
              {empresa
                ? `Empresa activa: ${empresa.nombre}`
                : "Selecciona una empresa"}
            </p>
          </div>

          <div className="actions">
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/")}
            >
              Cambiar empresa
            </button>
          </div>
        </div>

        {/* MODULOS */}
        <div className="grid grid-2">
          <div
            className="module-card"
            onClick={() => navigate("/clasificaciones-ingresos")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">🏷️</div>
            <h3 className="module-title">Clasificaciones de Ingresos</h3>
            <p className="module-text">
              Crea categorías de ingresos y define si salen detalladas o resumidas en los reportes.
            </p>
          </div>

          <div
            className="module-card"
            onClick={() => navigate("/facturacion")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">📄</div>
            <h3 className="module-title">Facturación Detalle</h3>
            <p className="module-text">
              Importa libros de ventas CF y CCF, edita y gestiona facturas.
            </p>
          </div>

<div
            className="module-card"
            onClick={() => navigate("/catalogo-contable")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">📚</div>
            <h3 className="module-title">Catálogo Contable</h3>
            <p className="module-text">
              Administra tus cuentas contables y sube tu catálogo desde Excel.
            </p>
          </div>

          <div
  className="module-card"
  onClick={() => navigate("/parametros-contables")}
  style={{ cursor: "pointer" }}
>
  <div className="module-icon">⚙️</div>
  <h3 className="module-title">Parámetros Contables</h3>
  <p className="module-text">
    Configura IVA, retenciones, percepciones, bancos y cajas para la contabilización automática.
  </p>
</div>

<div
    className="module-card"
    onClick={() => navigate("/reglas-contables")}
    style={{ cursor: "pointer" }}
  >
    <div className="module-icon">⚙️</div>
    <h3 className="module-title">Reglas Contables</h3>
    <p className="module-text">
      Crea etiquetas y reglas automáticas para clasificar ingresos, gastos y planillas.
    </p>
  </div>

<div
  className="module-card"
  onClick={() => navigate("//mapeo-cobros-contables")}
  style={{ cursor: "pointer" }}
>
  <div className="module-icon">⚙️</div>
  <h3 className="module-title">Clasificacion de Cobros</h3>
  <p className="module-text">
    Para clasificar el cobro
  </p>
</div>
<div
  className="module-card"
  onClick={() => navigate("/clasificacion-facturacion")}
  style={{ cursor: "pointer" }}
>
  <div className="module-icon">📑</div>
  <h3 className="module-title">Clasificación de Facturación</h3>
  <p className="module-text">
    Etiqueta y aplica reglas automáticas a tus ingresos.
  </p>
</div>

<div
  className="module-card"
  onClick={() => navigate("/asientos-contables")}
  style={{ cursor: "pointer" }}
>
  <div className="module-icon">⚙️</div>
  <h3 className="module-title">Asientos Contables de Ingresos</h3>
  <p className="module-text">
    Asientos Contables solo Ingresos
  </p>
</div>

<div
  className="module-card"
  onClick={() => navigate("/libro-asientos")}
  style={{ cursor: "pointer" }}
>
  <div className="module-icon">⚙️</div>
  <h3 className="module-title">Libro Diario de Ingresos</h3>
  <p className="module-text">
    Libro diario de Ingresos
  </p>
</div>
          

          <div
            className="module-card"
            onClick={() => navigate("/resumen")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">📊</div>
            <h3 className="module-title">Resumen Diario</h3>
            <p className="module-text">
              Visualiza totales por día y exporta información.
            </p>
          </div>

          

          

          <div
            className="module-card"
            onClick={() => navigate("/corte-diario")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">💰</div>
            <h3 className="module-title">Corte Diario</h3>
            <p className="module-text">
              Controla efectivo, POS, transferencias y otros ingresos del día.
            </p>
          </div>

          <div
            className="module-card"
            onClick={() => navigate("/cuentas-bancarias")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">🏦</div>
            <h3 className="module-title">Cuentas Bancarias</h3>
            <p className="module-text">
              Administra bancos y cuentas para POS y conciliación.
            </p>
          </div>

          <div
            className="module-card"
            onClick={() => navigate("/estado-cuenta-bancos")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">📘</div>
            <h3 className="module-title">Estado de Cuenta Bancario</h3>
            <p className="module-text">
              Carga, edita e importa movimientos bancarios para conciliación.
            </p>
          </div>

          <div
            className="module-card"
            onClick={() => navigate("/conciliacion-facturacion-corte")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">🧾</div>
            <h3 className="module-title">Conciliación Facturación vs Corte</h3>
            <p className="module-text">
              Compara por día lo facturado contra el corte diario y deja observaciones.
            </p>
          </div>

          <div
            className="module-card"
            onClick={() => navigate("/conciliacion-corte-banco")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">🏦</div>
            <h3 className="module-title">Conciliación Corte vs Banco</h3>
            <p className="module-text">
              Cruza los ingresos del corte diario contra los abonos del banco.
            </p>
          </div>

          <div
            className="module-card"
            onClick={() => navigate("/reportes-conciliacion")}
            style={{ cursor: "pointer" }}
          >
            <div className="module-icon">📑</div>
            <h3 className="module-title">Reportes de Conciliación</h3>
            <p className="module-text">
              Genera reportes consolidados, clasifica ingresos y exporta a Excel o PDF.
            </p>
          </div>

          <div
  className="module-card"
  onClick={() => navigate("/compras-detalle")}
  style={{ cursor: "pointer" }}
>
  <div className="module-icon">⚙️</div>
  <h3 className="module-title">Compras</h3>
  <p className="module-text">
    Compras FSE, CCF, FAC, etc
  </p>
</div>

<div
  className="module-card"
  onClick={() => navigate("/dcl-detalle")}
  style={{ cursor: "pointer" }}
>
  <div className="module-icon">📄</div>
  <h3 className="module-title">DCL / Liquidaciones POS</h3>
  <p className="module-text">
    Sube DCL por JSON, Excel o manual para llevar control de liquidaciones.
  </p>
</div>

<div
  className="module-card"
  onClick={() => navigate("/conciliacion-dcl")}
  style={{ cursor: "pointer" }}
>
  <div className="module-icon">🔗</div>
  <h3 className="module-title">Conciliación DCL</h3>
  <p className="module-text">
    Cruza el DCL contra comisión, IVA, anticipo y neto calculados en Corte Diario.
  </p>
</div>

        </div>
      </div>
    </div>
  );
}