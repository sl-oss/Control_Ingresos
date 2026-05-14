import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

export default function FacturacionResumen() {
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [detalle, setDetalle] = useState([]);
  const [modal, setModal] = useState(false);
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [empresaActual, setEmpresaActual] = useState(null);

  const [formEdit, setFormEdit] = useState({
    tipo_libro: "CF",
    documento: "",
    nombre: "",
    totalvent: "",
  });

  const thinInputStyle = {
    padding: "8px 12px",
    borderRadius: "12px",
    minHeight: "40px",
  };

  const thinButtonStyle = {
    padding: "9px 14px",
    borderRadius: "12px",
  };

  useEffect(() => {
    const empresaGuardada = localStorage.getItem("empresaSeleccionada");
    if (empresaGuardada) {
      try {
        const empresa = JSON.parse(empresaGuardada);
        if (empresa?.id) {
          setEmpresaActual(empresa);
        }
      } catch (error) {
        console.error("Error leyendo empresaSeleccionada:", error);
      }
    }
  }, []);

  const empresaId = useMemo(() => empresaActual?.id || null, [empresaActual]);

  const validarEmpresaSeleccionada = () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return false;
    }
    return true;
  };

  const cargarResumen = async () => {
    if (!empresaId) {
      setData([]);
      return;
    }

    let query = supabase
      .from("facturacion_detalle")
      .select("*")
      .eq("empresa_id", empresaId);

    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);

    const { data, error } = await query;

    if (error) {
      console.error(error);
      alert("Error cargando resumen");
      return;
    }

    const resumen = {};

    (data || []).forEach((row) => {
      const fecha = row.fecha;

      if (!resumen[fecha]) {
        resumen[fecha] = {
          fecha,
          total_cf: 0,
          total_ccf: 0,
          total: 0,
        };
      }

      if (row.tipo_libro === "CF") {
        resumen[fecha].total_cf += Number(row.totalvent || 0);
      } else {
        resumen[fecha].total_ccf += Number(row.totalvent || 0);
      }

      resumen[fecha].total += Number(row.totalvent || 0);
    });

    const resultado = Object.values(resumen).sort(
      (a, b) => new Date(b.fecha) - new Date(a.fecha)
    );

    setData(resultado);
  };

  useEffect(() => {
    cargarResumen();
  }, [empresaId, desde, hasta]);

  const formatearFechaExcel = (fecha) => {
    if (!fecha) return "";
    const partes = String(fecha).split("-");
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fecha;
  };

  const exportarExcel = async (fecha) => {
    if (!validarEmpresaSeleccionada()) return;

    const { data, error } = await supabase
      .from("facturacion_detalle")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("fecha", fecha)
      .order("id", { ascending: true });

    if (error) {
      console.error(error);
      alert("No se pudo exportar");
      return;
    }

    const filas = (data || []).map((item) => {
      if (item.tipo_libro === "CF") {
        return {
          FECHADOC: formatearFechaExcel(item.fecha),
          CLASEDOC: item.clasedoc || "",
          TIPODOCUM: item.tipodocum || "",
          NUMRESOL: item.numresol || "",
          NUMSERIE: item.numserie || "",
          NUMDOCAL: item.numdocal || "",
          VEXENTAS: Number(item.vexentas || 0),
          VGRAVADAS: Number(item.vgravadas || 0),
          TOTALVENT: Number(item.totalvent || 0),
        };
      }

      return {
        FECHA: formatearFechaExcel(item.fecha),
        CLASEDOC: item.clasedoc || "",
        TIPODOCUM: item.tipodocum || "",
        NUMRESOL: item.numresol || "",
        NUMSERIE: item.numserie || "",
        NUMDOC: item.numdoc || "",
        NITPROV: item.nitprov || "",
        NOMBRE: item.nombre || "",
        VEXENTAS: Number(item.vexentas || 0),
        VGRAVADAS: Number(item.vgravadas || 0),
        DEBITOFIS: Number(item.debitofis || 0),
        DEBITOTER: Number(item.debitoter || 0),
        TOTALVENT: Number(item.totalvent || 0),
      };
    });

    const wb = XLSX.utils.book_new();

    const filasCF = filas.filter((f) => "FECHADOC" in f);
    const filasCCF = filas.filter((f) => "FECHA" in f);

    if (filasCF.length > 0) {
      const wsCF = XLSX.utils.json_to_sheet(filasCF);
      XLSX.utils.book_append_sheet(wb, wsCF, "Consumidor Final");
    }

    if (filasCCF.length > 0) {
      const wsCCF = XLSX.utils.json_to_sheet(filasCCF);
      XLSX.utils.book_append_sheet(wb, wsCCF, "Contribuyentes");
    }

    if (filasCF.length === 0 && filasCCF.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    XLSX.writeFile(
      wb,
      `Ventas_${empresaActual?.nombre || "Empresa"}_${fecha}.xlsx`
    );
  };

  const verDetalle = async (fecha) => {
    if (!validarEmpresaSeleccionada()) return;

    const { data, error } = await supabase
      .from("facturacion_detalle")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("fecha", fecha)
      .order("id", { ascending: true });

    if (error) {
      console.error(error);
      alert("No se pudo cargar el detalle");
      return;
    }

    setDetalle(data || []);
    setFechaSeleccionada(fecha);
    setEditandoId(null);
    setModal(true);
  };

  const eliminar = async (id) => {
    if (!validarEmpresaSeleccionada()) return;
    if (!confirm("¿Eliminar registro?")) return;

    const { error } = await supabase
      .from("facturacion_detalle")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar");
      return;
    }

    await verDetalle(fechaSeleccionada);
    await cargarResumen();
  };

  const iniciarEdicion = (item) => {
    setEditandoId(item.id);
    setFormEdit({
      tipo_libro: item.tipo_libro || "CF",
      documento: item.numdoc || item.numdocal || "",
      nombre: item.nombre || "",
      totalvent: item.totalvent ?? "",
    });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setFormEdit({
      tipo_libro: "CF",
      documento: "",
      nombre: "",
      totalvent: "",
    });
  };

  const guardarEdicion = async () => {
    if (!validarEmpresaSeleccionada()) return;
    if (!editandoId) return;

    const payload = {
      empresa_id: empresaId,
      tipo_libro: formEdit.tipo_libro,
      nombre: formEdit.nombre || null,
      totalvent: Number(formEdit.totalvent || 0),
      numdoc: formEdit.tipo_libro === "CCF" ? formEdit.documento || null : null,
      numdocal: formEdit.tipo_libro === "CF" ? formEdit.documento || null : null,
    };

    const { error } = await supabase
      .from("facturacion_detalle")
      .update(payload)
      .eq("id", editandoId)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo guardar la edición");
      return;
    }

    await verDetalle(fechaSeleccionada);
    await cargarResumen();
    cancelarEdicion();
  };

  const limpiarFiltros = () => {
    setDesde("");
    setHasta("");
  };

  const totalCF = data.reduce((acc, d) => acc + Number(d.total_cf || 0), 0);
  const totalCCF = data.reduce((acc, d) => acc + Number(d.total_ccf || 0), 0);
  const totalGeneral = data.reduce((acc, d) => acc + Number(d.total || 0), 0);

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">📊 Resumen Diario</h1>
            <p className="subtitle">
              Consolidado de ventas
              {empresaActual ? ` • ${empresaActual.nombre}` : " • Sin empresa seleccionada"}
            </p>
          </div>

          <div className="actions">
            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={() => navigate("/Inicio")}
            >
              🏠 Inicio
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={() => navigate("/facturacion")}
            >
              📊 Facturación
            </button>
          </div>
        </div>

        {!empresaId && (
          <div
            className="card"
            style={{ marginBottom: "20px", border: "1px solid #fecaca" }}
          >
            <p style={{ margin: 0, color: "#991b1b", fontWeight: 600 }}>
              Debes seleccionar una empresa para ver el resumen, exportar o editar registros.
            </p>
          </div>
        )}

        <div className="card" style={{ marginBottom: "20px" }}>
          <div className="grid grid-3">
            <div>
              <label className="label">Desde</label>
              <input
                type="date"
                className="input"
                style={thinInputStyle}
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                disabled={!empresaId}
              />
            </div>

            <div>
              <label className="label">Hasta</label>
              <input
                type="date"
                className="input"
                style={thinInputStyle}
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                disabled={!empresaId}
              />
            </div>

            <div className="actions" style={{ alignItems: "end" }}>
              <button
                className="btn btn-secondary"
                style={thinButtonStyle}
                onClick={limpiarFiltros}
                disabled={!empresaId}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-3" style={{ marginBottom: "20px" }}>
          <div className="stat-card">
            <p className="stat-title">Total CF</p>
            <h2 className="stat-value">${totalCF.toFixed(2)}</h2>
          </div>

          <div className="stat-card">
            <p className="stat-title">Total CCF</p>
            <h2 className="stat-value">${totalCCF.toFixed(2)}</h2>
          </div>

          <div className="stat-card">
            <p className="stat-title">Total General</p>
            <h2 className="stat-value">${totalGeneral.toFixed(2)}</h2>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Total CF</th>
                  <th>Total CCF</th>
                  <th>Total Día</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {empresaId ? (
                  data.length > 0 ? (
                    data.map((row, i) => (
                      <tr key={i}>
                        <td>{row.fecha}</td>
                        <td>${Number(row.total_cf || 0).toFixed(2)}</td>
                        <td>${Number(row.total_ccf || 0).toFixed(2)}</td>
                        <td style={{ fontWeight: "bold" }}>
                          ${Number(row.total || 0).toFixed(2)}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="btn btn-primary"
                              style={thinButtonStyle}
                              onClick={() => exportarExcel(row.fecha)}
                            >
                              Excel
                            </button>

                            <button
                              className="btn btn-secondary"
                              style={thinButtonStyle}
                              onClick={() => verDetalle(row.fecha)}
                            >
                              Ver
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="5"
                        style={{ textAlign: "center", color: "#64748b" }}
                      >
                        No hay datos para mostrar
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      Selecciona una empresa para ver el resumen
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "1100px",
              maxHeight: "85vh",
              overflow: "auto",
            }}
          >
            <div className="topbar" style={{ marginBottom: "14px" }}>
              <div>
                <h3 style={{ margin: 0 }}>Detalle {fechaSeleccionada}</h3>
                <p className="subtitle" style={{ marginTop: "6px" }}>
                  Facturas incluidas en esta fecha
                </p>
              </div>

              <div className="actions">
                <button
                  className="btn btn-secondary"
                  style={thinButtonStyle}
                  onClick={() => {
                    setModal(false);
                    cancelarEdicion();
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Documento</th>
                    <th>Nombre</th>
                    <th>Total</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {detalle.length > 0 ? (
                    detalle.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {editandoId === d.id ? (
                            <select
                              className="select"
                              style={thinInputStyle}
                              value={formEdit.tipo_libro}
                              onChange={(e) =>
                                setFormEdit({
                                  ...formEdit,
                                  tipo_libro: e.target.value,
                                })
                              }
                            >
                              <option value="CF">CF</option>
                              <option value="CCF">CCF</option>
                            </select>
                          ) : (
                            d.tipo_libro
                          )}
                        </td>

                        <td>
                          {editandoId === d.id ? (
                            <input
                              className="input"
                              style={thinInputStyle}
                              value={formEdit.documento}
                              onChange={(e) =>
                                setFormEdit({
                                  ...formEdit,
                                  documento: e.target.value,
                                })
                              }
                            />
                          ) : (
                            d.numdoc || d.numdocal
                          )}
                        </td>

                        <td>
                          {editandoId === d.id ? (
                            <input
                              className="input"
                              style={thinInputStyle}
                              value={formEdit.nombre}
                              onChange={(e) =>
                                setFormEdit({
                                  ...formEdit,
                                  nombre: e.target.value,
                                })
                              }
                            />
                          ) : (
                            d.nombre || "-"
                          )}
                        </td>

                        <td>
                          {editandoId === d.id ? (
                            <input
                              type="number"
                              step="0.01"
                              className="input"
                              style={thinInputStyle}
                              value={formEdit.totalvent}
                              onChange={(e) =>
                                setFormEdit({
                                  ...formEdit,
                                  totalvent: e.target.value,
                                })
                              }
                            />
                          ) : (
                            `$${Number(d.totalvent || 0).toFixed(2)}`
                          )}
                        </td>

                        <td>
                          <div className="actions">
                            {editandoId === d.id ? (
                              <>
                                <button
                                  className="btn btn-success"
                                  style={thinButtonStyle}
                                  onClick={guardarEdicion}
                                >
                                  Guardar
                                </button>

                                <button
                                  className="btn btn-secondary"
                                  style={thinButtonStyle}
                                  onClick={cancelarEdicion}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn btn-primary"
                                  style={thinButtonStyle}
                                  onClick={() => iniciarEdicion(d)}
                                >
                                  Editar
                                </button>

                                <button
                                  className="btn btn-secondary"
                                  style={thinButtonStyle}
                                  onClick={() => eliminar(d.id)}
                                >
                                  Eliminar
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="5"
                        style={{ textAlign: "center", color: "#64748b" }}
                      >
                        No hay detalle para esta fecha
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}