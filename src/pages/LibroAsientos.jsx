import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function LibroAsientos() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [asientos, setAsientos] = useState([]);
  const [detalle, setDetalle] = useState([]);
  const [asientoSeleccionado, setAsientoSeleccionado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtro, setFiltro] = useState("");

  const [editandoId, setEditandoId] = useState(null);
  const [formLinea, setFormLinea] = useState({
    fecha: "",
    cod: "",
    nombre: "",
    descripcion: "",
    debe: "",
    haber: "",
    referencia: "",
    etiqueta: "",
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
    const empresaGuardada =
      localStorage.getItem("empresaSeleccionada") ||
      sessionStorage.getItem("empresaSeleccionada");

    if (empresaGuardada) {
      try {
        const empresa = JSON.parse(empresaGuardada);
        if (empresa?.id) setEmpresaActual(empresa);
      } catch (error) {
        console.error("Error leyendo empresaSeleccionada:", error);
      }
    }
  }, []);

  const empresaId = useMemo(() => empresaActual?.id || null, [empresaActual]);

  const normalizar = (valor = "") =>
    String(valor || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const cargarAsientos = async () => {
    if (!empresaId) {
      setAsientos([]);
      setDetalle([]);
      setAsientoSeleccionado(null);
      return;
    }

    setLoading(true);

    let query = supabase
      .from("asientos_contables")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false })
      .order("id", { ascending: false });

    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);

    const { data, error } = await query;

    if (error) {
      console.error(error);
      alert("No se pudieron cargar los asientos.");
      setLoading(false);
      return;
    }

    setAsientos(data || []);
    setLoading(false);

    const asientoIdUrl = searchParams.get("asiento");
    if (asientoIdUrl) {
      const encontrado = (data || []).find(
        (item) => Number(item.id) === Number(asientoIdUrl)
      );

      if (encontrado) {
        await cargarDetalle(encontrado, true);
      }
    }
  };

  useEffect(() => {
    cargarAsientos();
  }, [empresaId]);

  const cargarDetalle = async (asiento, abrirModal = true) => {
    setAsientoSeleccionado(asiento);
    setEditandoId(null);

    const { data, error } = await supabase
      .from("asientos_contables_detalle")
      .select("*")
      .eq("asiento_id", asiento.id)
      .eq("empresa_id", empresaId)
      .order("id", { ascending: true });

    if (error) {
      console.error(error);
      alert("No se pudo cargar el detalle del asiento.");
      return;
    }

    setDetalle(data || []);

    if (abrirModal) {
      setModalAbierto(true);
    }
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setEditandoId(null);
    setDetalle([]);
    setAsientoSeleccionado(null);
  };

  const iniciarEdicion = (linea) => {
    setEditandoId(linea.id);
    setFormLinea({
      fecha: linea.fecha || "",
      cod: linea.cod || "",
      nombre: linea.nombre || "",
      descripcion: linea.descripcion || "",
      debe: linea.debe || 0,
      haber: linea.haber || 0,
      referencia: linea.referencia || "",
      etiqueta: linea.etiqueta || "",
    });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setFormLinea({
      fecha: "",
      cod: "",
      nombre: "",
      descripcion: "",
      debe: "",
      haber: "",
      referencia: "",
      etiqueta: "",
    });
  };

  const recalcularTotalesAsiento = async (asientoId) => {
    const { data, error } = await supabase
      .from("asientos_contables_detalle")
      .select("debe, haber")
      .eq("asiento_id", asientoId)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      return;
    }

    const totalDebe = (data || []).reduce(
      (acc, item) => acc + Number(item.debe || 0),
      0
    );
    const totalHaber = (data || []).reduce(
      (acc, item) => acc + Number(item.haber || 0),
      0
    );

    await supabase
      .from("asientos_contables")
      .update({
        total_debe: Math.round(totalDebe * 100) / 100,
        total_haber: Math.round(totalHaber * 100) / 100,
      })
      .eq("id", asientoId)
      .eq("empresa_id", empresaId);
  };

  const guardarLinea = async (linea) => {
    const payload = {
      fecha: formLinea.fecha,
      cod: formLinea.cod,
      nombre: formLinea.nombre,
      descripcion: formLinea.descripcion,
      debe: Number(formLinea.debe || 0),
      haber: Number(formLinea.haber || 0),
      referencia: formLinea.referencia || null,
      etiqueta: formLinea.etiqueta || null,
    };

    const { error } = await supabase
      .from("asientos_contables_detalle")
      .update(payload)
      .eq("id", linea.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo actualizar la línea.");
      return;
    }

    await recalcularTotalesAsiento(linea.asiento_id);
    cancelarEdicion();
    await cargarDetalle(asientoSeleccionado, false);
    await cargarAsientos();
  };

  const eliminarLinea = async (linea) => {
    if (!confirm("¿Eliminar esta línea del asiento?")) return;

    const { error } = await supabase
      .from("asientos_contables_detalle")
      .delete()
      .eq("id", linea.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar la línea.");
      return;
    }

    await recalcularTotalesAsiento(linea.asiento_id);
    await cargarDetalle(asientoSeleccionado, false);
    await cargarAsientos();
  };

  const eliminarAsiento = async (asiento) => {
    if (!confirm(`¿Eliminar el asiento #${asiento.id}?`)) return;

    const { error } = await supabase
      .from("asientos_contables")
      .delete()
      .eq("id", asiento.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar el asiento.");
      return;
    }

    if (asientoSeleccionado?.id === asiento.id) {
      cerrarModal();
    }

    cargarAsientos();
  };

  const cargarDetallesExportacion = async () => {
    const todos = [];
    const pageSize = 1000;
    let desdeRango = 0;
    let seguir = true;

    while (seguir) {
      let query = supabase
        .from("asientos_contables_detalle")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("fecha", { ascending: true })
        .order("id", { ascending: true })
        .range(desdeRango, desdeRango + pageSize - 1);

      if (desde) query = query.gte("fecha", desde);
      if (hasta) query = query.lte("fecha", hasta);

      const { data, error } = await query;

      if (error) {
        console.error(error);
        alert("No se pudieron cargar los detalles para exportar.");
        return [];
      }

      const bloque = data || [];
      todos.push(...bloque);

      if (bloque.length < pageSize) seguir = false;
      else desdeRango += pageSize;
    }

    return todos;
  };

  const exportarExcel = async () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return;
    }

    setLoading(true);
    const detalles = await cargarDetallesExportacion();
    setLoading(false);

    if (detalles.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    const filas = detalles.map((linea) => ({
      Fecha: linea.fecha || "",
      Cod: linea.cod || "",
      Nombre: linea.nombre || "",
      Descripcion: linea.descripcion || "",
      Debe: Number(linea.debe || 0),
      Haber: Number(linea.haber || 0),
      Referencia: linea.referencia || "",
    }));

    const ws = XLSX.utils.json_to_sheet(filas, {
      header: [
        "Fecha",
        "Cod",
        "Nombre",
        "Descripcion",
        "Debe",
        "Haber",
        "Referencia",
      ],
    });

    ws["!cols"] = [
      { wch: 12 },
      { wch: 16 },
      { wch: 32 },
      { wch: 70 },
      { wch: 14 },
      { wch: 14 },
      { wch: 26 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asientos");

    const nombreEmpresa = empresaActual?.nombre
      ? empresaActual.nombre.replace(/[\\/:*?"<>|]/g, "")
      : "Empresa";

    XLSX.writeFile(
      wb,
      `Libro_Asientos_${nombreEmpresa}_${desde || "inicio"}_${hasta || "fin"}.xlsx`
    );
  };

  const texto = normalizar(filtro);

  const asientosFiltrados = asientos.filter((asiento) => {
    if (!texto) return true;

    const busqueda = normalizar(
      [
        asiento.id,
        asiento.fecha,
        asiento.tipo,
        asiento.referencia,
        asiento.total_debe,
        asiento.total_haber,
        asiento.estado,
      ].join(" ")
    );

    return busqueda.includes(texto);
  });

  const totalDebe = detalle.reduce(
    (acc, item) => acc + Number(item.debe || 0),
    0
  );
  const totalHaber = detalle.reduce(
    (acc, item) => acc + Number(item.haber || 0),
    0
  );
  const diferencia = totalDebe - totalHaber;

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">📚 Libro de Asientos</h1>
            <p className="subtitle">
              Consulta, edita y exporta los asientos generados
              {empresaActual ? ` • ${empresaActual.nombre}` : " • Sin empresa seleccionada"}
            </p>
          </div>

          <div className="actions">
            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={() => navigate("/inicio")}
            >
              🏠 Inicio
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={() => navigate("/asientos-contables")}
            >
              📘 Generar asientos
            </button>

            <button
              className="btn btn-success"
              style={thinButtonStyle}
              onClick={exportarExcel}
              disabled={!empresaId || loading}
            >
              📤 Exportar Excel
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={cargarAsientos}
              disabled={!empresaId || loading}
            >
              🔄 Actualizar
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "20px" }}>
          <div className="grid grid-4">
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

            <div>
              <label className="label">Buscar</label>
              <input
                className="input"
                style={thinInputStyle}
                placeholder="ID, referencia, fecha..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                disabled={!empresaId}
              />
            </div>

            <div style={{ display: "flex", alignItems: "end" }}>
              <button
                className="btn btn-primary"
                style={thinButtonStyle}
                onClick={cargarAsientos}
                disabled={!empresaId}
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Asientos</h3>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Referencia</th>
                  <th>Debe</th>
                  <th>Haber</th>
                  <th>Diferencia</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {asientosFiltrados.length > 0 ? (
                  asientosFiltrados.map((asiento) => {
                    const dif =
                      Number(asiento.total_debe || 0) -
                      Number(asiento.total_haber || 0);

                    return (
                      <tr key={asiento.id}>
                        <td>{asiento.id}</td>
                        <td>{asiento.fecha}</td>
                        <td>{asiento.tipo}</td>
                        <td>{asiento.referencia || "-"}</td>
                        <td>${Number(asiento.total_debe || 0).toFixed(2)}</td>
                        <td>${Number(asiento.total_haber || 0).toFixed(2)}</td>
                        <td
                          style={{
                            fontWeight: 700,
                            color: Math.abs(dif) > 0.02 ? "#991b1b" : "#166534",
                          }}
                        >
                          ${dif.toFixed(2)}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="btn btn-primary"
                              style={thinButtonStyle}
                              onClick={() => cargarDetalle(asiento)}
                            >
                              Ver / Editar
                            </button>

                            <button
                              className="btn btn-secondary"
                              style={thinButtonStyle}
                              onClick={() => eliminarAsiento(asiento)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan="8"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      No hay asientos para mostrar
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && (
            <p style={{ marginTop: "12px", color: "#64748b" }}>Cargando...</p>
          )}
        </div>

        {modalAbierto && asientoSeleccionado && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.55)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
            }}
          >
            <div
              className="card"
              style={{
                width: "95vw",
                maxWidth: "1400px",
                maxHeight: "88vh",
                overflow: "auto",
                position: "relative",
              }}
            >
              <div className="topbar" style={{ marginBottom: "16px" }}>
                <div>
                  <h2 className="title" style={{ fontSize: "22px" }}>
                    Detalle del asiento #{asientoSeleccionado.id}
                  </h2>
                  <p className="subtitle">
                    Edita cualquier línea del asiento. Las columnas visibles son:
                    Fecha, Cod, Nombre, Descripción, Debe, Haber y Referencia.
                  </p>
                </div>

                <div className="actions">
                  <button
                    className="btn btn-secondary"
                    style={thinButtonStyle}
                    onClick={cerrarModal}
                  >
                    Cerrar
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cod</th>
                      <th>Nombre</th>
                      <th>Descripción</th>
                      <th>Debe</th>
                      <th>Haber</th>
                      <th>Referencia</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {detalle.map((linea) => {
                      const editando = editandoId === linea.id;

                      return (
                        <tr key={linea.id}>
                          <td>
                            {editando ? (
                              <input
                                type="date"
                                className="input"
                                style={thinInputStyle}
                                value={formLinea.fecha}
                                onChange={(e) =>
                                  setFormLinea({
                                    ...formLinea,
                                    fecha: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              linea.fecha
                            )}
                          </td>

                          <td>
                            {editando ? (
                              <input
                                className="input"
                                style={thinInputStyle}
                                value={formLinea.cod}
                                onChange={(e) =>
                                  setFormLinea({
                                    ...formLinea,
                                    cod: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              linea.cod
                            )}
                          </td>

                          <td>
                            {editando ? (
                              <input
                                className="input"
                                style={thinInputStyle}
                                value={formLinea.nombre}
                                onChange={(e) =>
                                  setFormLinea({
                                    ...formLinea,
                                    nombre: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              linea.nombre
                            )}
                          </td>

                          <td style={{ minWidth: "320px" }}>
                            {editando ? (
                              <input
                                className="input"
                                style={thinInputStyle}
                                value={formLinea.descripcion}
                                onChange={(e) =>
                                  setFormLinea({
                                    ...formLinea,
                                    descripcion: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              linea.descripcion
                            )}
                          </td>

                          <td>
                            {editando ? (
                              <input
                                type="number"
                                step="0.01"
                                className="input"
                                style={thinInputStyle}
                                value={formLinea.debe}
                                onChange={(e) =>
                                  setFormLinea({
                                    ...formLinea,
                                    debe: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              `$${Number(linea.debe || 0).toFixed(2)}`
                            )}
                          </td>

                          <td>
                            {editando ? (
                              <input
                                type="number"
                                step="0.01"
                                className="input"
                                style={thinInputStyle}
                                value={formLinea.haber}
                                onChange={(e) =>
                                  setFormLinea({
                                    ...formLinea,
                                    haber: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              `$${Number(linea.haber || 0).toFixed(2)}`
                            )}
                          </td>

                          <td>
                            {editando ? (
                              <input
                                className="input"
                                style={thinInputStyle}
                                value={formLinea.referencia}
                                onChange={(e) =>
                                  setFormLinea({
                                    ...formLinea,
                                    referencia: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              linea.referencia || "-"
                            )}
                          </td>

                          <td>
                            <div className="actions">
                              {editando ? (
                                <>
                                  <button
                                    className="btn btn-success"
                                    style={thinButtonStyle}
                                    onClick={() => guardarLinea(linea)}
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
                                    onClick={() => iniciarEdicion(linea)}
                                  >
                                    Editar
                                  </button>

                                  <button
                                    className="btn btn-secondary"
                                    style={thinButtonStyle}
                                    onClick={() => eliminarLinea(linea)}
                                  >
                                    Eliminar
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    <tr>
                      <td
                        colSpan="4"
                        style={{ textAlign: "right", fontWeight: 700 }}
                      >
                        Totales
                      </td>
                      <td style={{ fontWeight: 700 }}>${totalDebe.toFixed(2)}</td>
                      <td style={{ fontWeight: 700 }}>${totalHaber.toFixed(2)}</td>
                      <td
                        colSpan="2"
                        style={{
                          fontWeight: 700,
                          color: Math.abs(diferencia) > 0.02 ? "#991b1b" : "#166534",
                        }}
                      >
                        Dif: ${diferencia.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
