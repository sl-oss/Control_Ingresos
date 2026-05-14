import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function ParametrosContables() {
  const navigate = useNavigate();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [parametros, setParametros] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [tiposDocumento, setTiposDocumento] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [loading, setLoading] = useState(false);

  const [filtroOperacion, setFiltroOperacion] = useState("compra");

  const [form, setForm] = useState({
    nombre: "",
    tipo_operacion: "compra",
    tipo: "impuesto",
    tipo_documento: "",
    cuenta_contable: "",
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

  const normalizar = (txt = "") =>
    String(txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const compararCodigos = (a, b) => {
    const ca = String(a.codigo || "");
    const cb = String(b.codigo || "");
    return ca.localeCompare(cb, "es", { numeric: true, sensitivity: "base" });
  };

  const cargarCuentasCatalogo = async () => {
    if (!empresaId) return [];

    const todas = [];
    const pageSize = 1000;
    let desde = 0;
    let seguir = true;

    while (seguir) {
      const { data, error } = await supabase
        .from("catalogo_contable")
        .select("id, codigo, cuenta, activo, es_movimiento")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .eq("es_movimiento", true)
        .order("codigo", { ascending: true })
        .range(desde, desde + pageSize - 1);

      if (error) {
        console.error(error);
        alert("No se pudo cargar el catálogo contable.");
        return [];
      }

      const bloque = data || [];
      todas.push(...bloque);

      if (bloque.length < pageSize) seguir = false;
      else desde += pageSize;
    }

    return todas.sort(compararCodigos);
  };

  const cargarTodo = async () => {
    if (!empresaId) {
      setParametros([]);
      setCuentas([]);
      setTiposDocumento([]);
      return;
    }

    setLoading(true);

    const { data: parametrosData, error: errorParametros } = await supabase
      .from("parametros_contables")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("tipo_operacion", { ascending: true })
      .order("tipo", { ascending: true })
      .order("id", { ascending: false });

    if (errorParametros) {
      console.error(errorParametros);
      alert("No se pudieron cargar los parámetros contables.");
      setLoading(false);
      return;
    }

    const { data: tiposData, error: errorTipos } = await supabase
      .from("facturacion_detalle")
      .select("tipo_libro")
      .eq("empresa_id", empresaId);

    if (errorTipos) {
      console.error(errorTipos);
    }

    const { data: tiposComprasData } = await supabase
      .from("compras_detalle")
      .select("tipo_dte")
      .eq("empresa_id", empresaId);

    const tiposUnicos = [
      ...new Set([
        "CF",
        "CCF",
        "FSE",
        "SUJETO EXCLUIDO",
        "NC",
        "ND",
        ...(tiposData || [])
          .map((item) => String(item.tipo_libro || "").trim().toUpperCase())
          .filter(Boolean),
        ...(tiposComprasData || [])
          .map((item) => String(item.tipo_dte || "").trim().toUpperCase())
          .filter(Boolean),
      ]),
    ].sort();

    const cuentasData = await cargarCuentasCatalogo();

    setTiposDocumento(tiposUnicos);

    setParametros(parametrosData || []);
    setCuentas(cuentasData || []);
    setLoading(false);
  };

  useEffect(() => {
    cargarTodo();
  }, [empresaId]);

  const guardar = async () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return;
    }

    if (!form.nombre.trim() || !form.cuenta_contable.trim()) {
      alert("Completa nombre y cuenta contable.");
      return;
    }


    const payload = {
      empresa_id: empresaId,
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      tipo_documento: form.tipo_documento.trim() || null,
      cuenta_contable: form.cuenta_contable.trim(),
      activo: true,
    };

    const { error } = await supabase.from("parametros_contables").insert([payload]);

    if (error) {
      console.error(error);
      alert("No se pudo guardar el parámetro contable.");
      return;
    }

    setForm({
      nombre: "",
      tipo_operacion: "compra",
      tipo: "impuesto",
      tipo_documento: "",
      cuenta_contable: "",
    });

    setFiltroOperacion("compra");

    setMostrarSugerencias(false);
    cargarTodo();
  };

  const seleccionarCuenta = (c) => {
    setForm({
      ...form,
      cuenta_contable: `${c.codigo} - ${c.cuenta}`,
    });
    setMostrarSugerencias(false);
  };

  const eliminarParametro = async (id) => {
    if (!confirm("¿Eliminar este parámetro contable?")) return;

    const { error } = await supabase
      .from("parametros_contables")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar el parámetro.");
      return;
    }

    cargarTodo();
  };

  const textoCuenta = normalizar(form.cuenta_contable);

  const documentosSeleccionados = form.tipo_documento
    ? form.tipo_documento
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    : [];

  const alternarDocumento = (tipo) => {
    const doc = String(tipo || "").trim().toUpperCase();
    if (!doc) return;

    let nuevos;

    if (documentosSeleccionados.includes(doc)) {
      nuevos = documentosSeleccionados.filter((item) => item !== doc);
    } else {
      nuevos = [...documentosSeleccionados, doc];
    }

    setForm({
      ...form,
      tipo_documento: nuevos.join(","),
    });
  };

  const filtradas = cuentas
    .filter((c) => {
      if (!textoCuenta) return true;
      const texto = normalizar(`${c.codigo} ${c.cuenta}`);
      const codigo = normalizar(c.codigo);
      const cuenta = normalizar(c.cuenta);
      return texto.includes(textoCuenta) || codigo.includes(textoCuenta) || cuenta.includes(textoCuenta);
    })
    .slice(0, 60);

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">⚙️ Parámetros Contables</h1>
            <p className="subtitle">
              Configura impuestos, bancos, cajas, retenciones y percepciones
              {empresaActual ? ` • ${empresaActual.nombre}` : " • Sin empresa seleccionada"}
            </p>
          </div>

          <div className="actions">
            <button className="btn btn-secondary" style={thinButtonStyle} onClick={() => navigate("/inicio")}>
              🏠 Inicio
            </button>

            <button className="btn btn-secondary" style={thinButtonStyle} onClick={() => navigate("/catalogo-contable")}>
              📚 Catálogo
            </button>

            <button className="btn btn-secondary" style={thinButtonStyle} onClick={() => navigate("/clasificacion-compras")}>
              🧾 Clasificación compras
            </button>

            <button className="btn btn-secondary" style={thinButtonStyle} onClick={cargarTodo} disabled={!empresaId || loading}>
              🔄 Actualizar
            </button>
          </div>
        </div>

        {!empresaId && (
          <div className="card" style={{ marginBottom: "20px", border: "1px solid #fecaca" }}>
            <p style={{ margin: 0, color: "#991b1b", fontWeight: 600 }}>
              Debes seleccionar una empresa antes de crear parámetros contables.
            </p>
          </div>
        )}

        <div className="card" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0 }}>Crear parámetro</h3>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
            {[
              { nombre: "IVA crédito fiscal compras", tipo_operacion: "compra", tipo: "impuesto", tipo_documento: "CCF" },
              { nombre: "Retención renta compras", tipo_operacion: "compra", tipo: "retencion", tipo_documento: "FSE,SUJETO EXCLUIDO" },
              { nombre: "Cuenta por pagar compras", tipo_operacion: "compra", tipo: "cuenta_por_pagar", tipo_documento: "" },
              { nombre: "IVA débito CF ventas", tipo_operacion: "venta", tipo: "impuesto", tipo_documento: "CF" },
              { nombre: "IVA débito CCF ventas", tipo_operacion: "venta", tipo: "impuesto", tipo_documento: "CCF" },
            ].map((s) => (
              <button
                key={s.nombre}
                className="btn btn-secondary"
                style={thinButtonStyle}
                onClick={() => {
                  setForm({ ...form, ...s, cuenta_contable: "" });
                  setFiltroOperacion(s.tipo_operacion);
                }}
                disabled={!empresaId}
              >
                {s.nombre}
              </button>
            ))}
          </div>

          <div className="grid grid-4">
            <div>
              <label className="label">Operación</label>
              <select
                className="select"
                style={thinInputStyle}
                value={form.tipo_operacion}
                onChange={(e) => {
                  setForm({ ...form, tipo_operacion: e.target.value, tipo_documento: "" });
                  setFiltroOperacion(e.target.value);
                }}
                disabled={!empresaId}
              >
                <option value="compra">Compra</option>
                <option value="venta">Venta</option>
                <option value="banco">Banco</option>
                <option value="planilla">Planilla</option>
                <option value="general">General</option>
              </select>
            </div>

            <div>
              <label className="label">Nombre</label>
              <input
                className="input"
                style={thinInputStyle}
                placeholder="Ej: IVA débito CF"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                disabled={!empresaId}
              />
            </div>

            <div>
              <label className="label">Tipo</label>
              <select
                className="select"
                style={thinInputStyle}
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                disabled={!empresaId}
              >
                <option value="impuesto">Impuesto</option>
                <option value="banco">Banco</option>
                <option value="caja">Caja</option>
                <option value="retencion">Retención</option>
                <option value="percepcion">Percepción</option>
                <option value="cuenta_por_cobrar">Cuenta por cobrar</option>
                <option value="cuenta_por_pagar">Cuenta por pagar</option>
                <option value="gasto">Gasto</option>
                <option value="ingreso">Ingreso</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div>
              <label className="label">Documentos aplica</label>

              <div
                style={{
                  border: "1px solid #ddd6fe",
                  borderRadius: "12px",
                  padding: "10px",
                  minHeight: "40px",
                  background: "#fff",
                }}
              >
                {tiposDocumento.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    {tiposDocumento.map((tipo) => {
                      const activo = documentosSeleccionados.includes(tipo);

                      return (
                        <label
                          key={tipo}
                          style={{
                            display: "flex",
                            gap: "6px",
                            alignItems: "center",
                            padding: "6px 10px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "999px",
                            cursor: "pointer",
                            background: activo ? "#ede9fe" : "#fff",
                            color: activo ? "#5b21b6" : "#334155",
                            fontWeight: activo ? 700 : 500,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={activo}
                            onChange={() => alternarDocumento(tipo)}
                            disabled={!empresaId}
                          />
                          {tipo}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <span style={{ color: "#64748b", fontSize: "13px" }}>
                    No hay tipos cargados todavía. Si queda vacío, aplica para todos.
                  </span>
                )}
              </div>

              <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                CCF compra y CCF venta se separan por operación.
              </p>
            </div>

            <div style={{ position: "relative" }}>
              <label className="label">Cuenta contable</label>
              <input
                className="input"
                style={thinInputStyle}
                placeholder="Escribe código o cuenta..."
                value={form.cuenta_contable}
                onFocus={() => setMostrarSugerencias(true)}
                onChange={(e) => {
                  setForm({ ...form, cuenta_contable: e.target.value });
                  setMostrarSugerencias(true);
                }}
                disabled={!empresaId}
              />

              {mostrarSugerencias && empresaId && (
                <div
                  style={{
                    marginTop: "8px",
                    background: "#ffffff",
                    border: "1px solid #dbeafe",
                    borderRadius: "12px",
                    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
                    maxHeight: "260px",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                  {filtradas.length > 0 ? (
                    filtradas.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          seleccionarCuenta(c);
                        }}
                        style={{
                          width: "100%",
                          display: "block",
                          textAlign: "left",
                          padding: "10px 12px",
                          border: "none",
                          background: "white",
                          cursor: "pointer",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#334155" }}>{c.codigo}</div>
                        <div style={{ fontSize: "13px", color: "#64748b" }}>{c.cuenta}</div>
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: "12px", color: "#64748b" }}>
                      No se encontraron cuentas de movimiento.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="actions" style={{ marginTop: "14px" }}>
            <button className="btn btn-primary" style={thinButtonStyle} onClick={guardar} disabled={!empresaId}>
              Guardar parámetro
            </button>

            <button className="btn btn-secondary" style={thinButtonStyle} onClick={() => setMostrarSugerencias(false)} disabled={!empresaId}>
              Cerrar lista
            </button>
          </div>

          <p className="subtitle" style={{ marginTop: "12px" }}>
            Cuentas de movimiento cargadas: {cuentas.length}
          </p>
        </div>

        <div className="card">
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            {["compra", "venta", "banco", "planilla", "general", "todos"].map((op) => (
              <button
                key={op}
                className={filtroOperacion === op ? "btn btn-primary" : "btn btn-secondary"}
                style={thinButtonStyle}
                onClick={() => setFiltroOperacion(op)}
              >
                {op.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Operación</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Documento</th>
                  <th>Cuenta</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {parametros.length > 0 ? (
                  parametros
                    .filter((p) => filtroOperacion === "todos" || String(p.tipo_operacion || "venta") === filtroOperacion)
                    .map((p) => (
                    <tr key={p.id}>
                      <td><span className="badge">{p.tipo_operacion || "venta"}</span></td>
                      <td>{p.nombre}</td>
                      <td>{p.tipo}</td>
                      <td>{p.tipo_documento || "-"}</td>
                      <td>{p.cuenta_contable}</td>
                      <td>
                        <button className="btn btn-secondary" style={thinButtonStyle} onClick={() => eliminarParametro(p.id)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", color: "#64748b" }}>
                      No hay parámetros contables creados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && <p style={{ marginTop: "12px", color: "#64748b" }}>Cargando...</p>}
        </div>
      </div>
    </div>
  );
}
