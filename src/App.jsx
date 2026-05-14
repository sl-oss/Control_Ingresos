import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Inicio from "./pages/Inicio";
import Empresas from "./pages/Empresas";
import FacturacionDetalle from "./pages/FacturacionDetalle";
import FacturacionResumen from "./pages/FacturacionResumen";
import ClasificacionesIngresos from "./pages/ClasificacionesIngresos";
import CorteDiario from "./pages/CorteDiario";
import CuentasBancarias from "./pages/CuentasBancarias";
import EstadoCuentaBancos from "./pages/EstadoCuentaBancos";
import ConciliacionFacturacionCorte from "./pages/ConciliacionFacturacionCorte";
import ConciliacionCorteBanco from "./pages/ConciliacionCorteBanco";
import ReportesConciliacion from "./pages/ReportesConciliacion";
import DCLDetalle from "./pages/DCLDetalle";
import ConciliacionDCL from "./pages/ConciliacionDCL";
import ReglasContables from "./pages/ReglasContables";
import CatalogoContable from "./pages/CatalogoContable";
import ClasificacionFacturacion from "./pages/ClasificacionFacturacion";
import ParametrosContables from "./pages/ParametrosContables";
import MapeoCobrosContables from "./pages/MapeoCobrosContables";
import AsientosContables from "./pages/AsientosContables";
import LibroAsientos from "./pages/LibroAsientos";
import ComprasDetalle from "./pages/ComprasDetalle";

/* ======================================================
   PROTECCIÓN: SOLO ENTRA SI HAY EMPRESA SELECCIONADA
====================================================== */
function RutaProtegida({ children }) {
  const empresa =
    localStorage.getItem("empresaSeleccionada") ||
    sessionStorage.getItem("empresaSeleccionada");

  if (!empresa) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* SELECCIÓN DE EMPRESA */}
        <Route path="/" element={<Empresas />} />

        {/* INICIO */}
        <Route
          path="/inicio"
          element={
            <RutaProtegida>
              <Inicio />
            </RutaProtegida>
          }
        />
<Route path="/reglas-contables" element={<ReglasContables />} />
<Route path="/catalogo-contable" element={<CatalogoContable />} />
<Route path="/clasificacion-facturacion" element={<ClasificacionFacturacion />} />
<Route path="/parametros-contables" element={<ParametrosContables />} />
<Route path="/mapeo-cobros-contables" element={<MapeoCobrosContables />} />
<Route path="/asientos-contables" element={<AsientosContables />} />
<Route path="/libro-asientos" element={<LibroAsientos />} />
<Route path="/compras-detalle" element={<ComprasDetalle />} />
        {/* FACTURACIÓN */}
        <Route
          path="/facturacion"
          element={
            <RutaProtegida>
              <FacturacionDetalle />
            </RutaProtegida>
          }
        />

        <Route
          path="/resumen"
          element={
            <RutaProtegida>
              <FacturacionResumen />
            </RutaProtegida>
          }
        />

        {/* CLASIFICACIONES DE INGRESOS */}
        <Route
          path="/clasificaciones-ingresos"
          element={
            <RutaProtegida>
              <ClasificacionesIngresos />
            </RutaProtegida>
          }
        />

        {/* CORTE DIARIO */}
        <Route
          path="/corte-diario"
          element={
            <RutaProtegida>
              <CorteDiario />
            </RutaProtegida>
          }
        />

        {/* CUENTAS BANCARIAS */}
        <Route
          path="/cuentas-bancarias"
          element={
            <RutaProtegida>
              <CuentasBancarias />
            </RutaProtegida>
          }
        />

        {/* ESTADO DE CUENTA BANCARIO */}
        <Route
          path="/estado-cuenta-bancos"
          element={
            <RutaProtegida>
              <EstadoCuentaBancos />
            </RutaProtegida>
          }
        />

        {/* CONCILIACIÓN FACTURACIÓN VS CORTE */}
        <Route
          path="/conciliacion-facturacion-corte"
          element={
            <RutaProtegida>
              <ConciliacionFacturacionCorte />
            </RutaProtegida>
          }
        />

        {/* CONCILIACIÓN CORTE VS BANCO */}
        <Route
          path="/conciliacion-corte-banco"
          element={
            <RutaProtegida>
              <ConciliacionCorteBanco />
            </RutaProtegida>
          }
        />

        {/* REPORTES DE CONCILIACIÓN */}
        <Route
          path="/reportes-conciliacion"
          element={
            <RutaProtegida>
              <ReportesConciliacion />
            </RutaProtegida>
          }
        />

        <Route
  path="/dcl-detalle"
  element={
    <RutaProtegida>
      <DCLDetalle />
    </RutaProtegida>
  }
/>

<Route
  path="/conciliacion-dcl"
  element={
    <RutaProtegida>
      <ConciliacionDCL />
    </RutaProtegida>
  }
/>

        {/* REDIRECCIÓN GLOBAL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;