import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

const dinero = (n) =>
  new Intl.NumberFormat("es-SV", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(n || 0));

const numero = (n) => Number(n || 0);

export default function ClasificacionCompras() {
  const navigate = useNavigate();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [compras, setCompras] = useState([]);
  const [etiquetas, setEtiquetas] = useState([]);
  const [reglas, setReglas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [parametros, setParametros] = useState([]);
  const [loading, setLoading] = useState(false);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [buscar, setBuscar] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("pendientes");

  const [modal, setModal] = useState(false);
  const [compraActiva, setCompraActiva] = useState(null);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  const [form, setForm] = useState({
    etiqueta_id: "",
    cuenta_contable: "",
    observacion_clasificacion: "",
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

  const compararCodigos = (a, b) => {
    const ca = String(a.codigo || "");
    const cb = String(b.codigo || "");
    return ca.localeCompare(cb, "es", { numeric: true, sensitivity: "base" });
  };

  const cargarCatalogo = async () => {
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
    if (!empresaId) return;

    setLoading(true);

    let queryCompras = supabase
      .from("compras_detalle")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false });

    if (desde) queryCompras = queryCompras.gte("fecha", desde);
    if (hasta) queryCompras = queryCompras.lte("fecha", hasta);

    const [comprasRes, etiquetasRes, reglasRes, parametrosRes, cuentasData] =
      await Promise.all([
        queryCompras,
        supabase
          .from("etiquetas_contables")
          .select("*")
          .eq("empresa_id", empresaId)
          .eq("tipo", "gasto")
          .eq("activo", true)
          .order("nombre", { ascending: true }),
        supabase
          .from("reglas_contables")
          .select("*, etiquetas_contables(nombre)")
          .eq("empresa_id", empresaId)
          .eq("tipo", "gasto")
          .eq("activo", true)
          .order("id", { ascending: false }),
        supabase
          .from("parametros_contables")
          .select("*")
          .eq("empresa_id", empresaId)
          .eq("tipo_operacion", "compra")
          .eq("activo", true),
        cargarCatalogo(),
      ]);

    if (comprasRes.error) {
      console.error(comprasRes.error);
      alert("No se pudieron cargar las compras. Verifica compras_detalle y las columnas de clasificación.");
    }

    if (etiquetasRes.error) console.error(etiquetasRes.error);
    if (reglasRes.error) console.error(reglasRes.error);
    if (parametrosRes.error) console.error(parametrosRes.error);

    setCompras(comprasRes.data || []);
    setEtiquetas(etiquetasRes.data || []);
    setReglas(reglasRes.data || []);
    setParametros(parametrosRes.data || []);
    setCuentas(cuentasData || []);
    setLoading(false);
  };

  useEffect(() => {
    if (empresaId) cargarTodo();
  }, [empresaId]);

  const textoCompra = (compra) =>
    normalizar(`
      ${compra.proveedor || ""}
      ${compra.nombre || ""}
      ${compra.descripcion || ""}
      ${compra.detalle || ""}
      ${compra.codigo_generacion || ""}
      ${compra.numero_control || ""}
      ${compra.tipo_dte || ""}
      ${compra.nit || ""}
    `);

  const obtenerCampoCompra = (compra, campo) => {
    if (campo === "proveedor" || campo === "nombre") {
      return compra.proveedor || compra.nombre || "";
    }

    if (campo === "documento" || campo === "codigo") {
      return `${compra.codigo_generacion || ""} ${compra.numero_control || ""} ${compra.tipo_dte || ""}`;
    }

    if (campo === "nit") {
      return compra.nit || compra.dui || "";
    }

    return `${compra.descripcion || ""} ${compra.detalle || ""} ${compra.proveedor || ""}`;
  };

  const cumpleRegla = (compra, regla) => {
    const base = normalizar(obtenerCampoCompra(compra, regla.campo));
    const valor = normalizar(regla.valor);

    if (!valor) return false;

    if (regla.operador === "igual") return base === valor;
    if (regla.operador === "inicia_con") return base.startsWith(valor);
    if (regla.operador === "termina_con") return base.endsWith(valor);

    return base.includes(valor);
  };

  const reglaSugerida = (compra) => {
    return reglas.find((regla) => cumpleRegla(compra, regla)) || null;
  };

  const clasificacionActual = (compra) => {
    const regla = reglaSugerida(compra);
    const etiquetaDirecta = etiquetas.find(
      (e) => Number(e.id) === Number(compra.etiqueta_id)
    );

    return {
      regla,
      etiqueta_id: compra.etiqueta_id || regla?.etiqueta_id || "",
      etiqueta_nombre:
        compra.etiqueta_nombre ||
        etiquetaDirecta?.nombre ||
        regla?.etiquetas_contables?.nombre ||
        "",
      cuenta_contable: compra.cuenta_contable || regla?.cuenta_contable || "",
    };
  };

  const comprasFiltradas = useMemo(() => {
    const t = normalizar(buscar);

    return compras.filter((compra) => {
      const cls = clasificacionActual(compra);
      const estaClasificada = Boolean(compra.etiqueta_id && compra.cuenta_contable);

      if (estadoFiltro === "pendientes" && estaClasificada) return false;
      if (estadoFiltro === "clasificadas" && !estaClasificada) return false;

      if (!t) return true;

      return (
        textoCompra(compra).includes(t) ||
        normalizar(cls.etiqueta_nombre).includes(t) ||
        normalizar(cls.cuenta_contable).includes(t)
      );
    });
  }, [compras, buscar, estadoFiltro, reglas, etiquetas]);

  const resumen = useMemo(() => {
    const total = compras.length;
    const clasificadas = compras.filter((c) => c.etiqueta_id && c.cuenta_contable).length;
    const sugeridas = compras.filter((c) => !c.cuenta_contable && reglaSugerida(c)).length;

    return {
      total,
      clasificadas,
      pendientes: total - clasificadas,
      sugeridas,
      monto: compras.reduce((acc, c) => acc + numero(c.total), 0),
    };
  }, [compras, reglas]);

  const abrirModal = (compra) => {
    const cls = clasificacionActual(compra);

    setCompraActiva(compra);
    setForm({
      etiqueta_id: cls.etiqueta_id ? String(cls.etiqueta_id) : "",
      cuenta_contable: cls.cuenta_contable || "",
      observacion_clasificacion: compra.observacion_clasificacion || "",
    });
    setMostrarSugerencias(false);
    setModal(true);
  };

  const seleccionarCuenta = (cuenta) => {
    setForm({ ...form, cuenta_contable: `${cuenta.codigo} - ${cuenta.cuenta}` });
    setMostrarSugerencias(false);
  };

  const guardarClasificacion = async () => {
    if (!compraActiva) return;

    if (!form.etiqueta_id || !form.cuenta_contable.trim()) {
      alert("Selecciona etiqueta y cuenta contable.");
      return;
    }

    const etiqueta = etiquetas.find((e) => Number(e.id) === Number(form.etiqueta_id));

    const { error } = await supabase
      .from("compras_detalle")
      .update({
        etiqueta_id: Number(form.etiqueta_id),
        etiqueta_nombre: etiqueta?.nombre || null,
        cuenta_contable: form.cuenta_contable.trim(),
        observacion_clasificacion: form.observacion_clasificacion || null,
        clasificacion_estado: "clasificada",
      })
      .eq("id", compraActiva.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo guardar la clasificación. Verifica que corriste el SQL.");
      return;
    }

    setModal(false);
    await cargarTodo();
  };

  const aplicarReglaACompra = async (compra) => {
    const regla = reglaSugerida(compra);
    if (!regla) return alert("No hay regla sugerida para esta compra.");

    const etiqueta = etiquetas.find((e) => Number(e.id) === Number(regla.etiqueta_id));

    const { error } = await supabase
      .from("compras_detalle")
      .update({
        etiqueta_id: Number(regla.etiqueta_id),
        etiqueta_nombre: etiqueta?.nombre || regla.etiquetas_contables?.nombre || null,
        cuenta_contable: regla.cuenta_contable,
        observacion_clasificacion: `Aplicado por regla: ${regla.campo} ${regla.operador} ${regla.valor}`,
        clasificacion_estado: "clasificada",
      })
      .eq("id", compra.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo aplicar la regla.");
      return;
    }

    await cargarTodo();
  };

  const aplicarReglasVisibles = async () => {
    const pendientesConRegla = comprasFiltradas.filter(
      (compra) => !compra.cuenta_contable && reglaSugerida(compra)
    );

    if (pendientesConRegla.length === 0) return alert("No hay compras visibles con regla sugerida.");
    if (!confirm(`¿Aplicar reglas a ${pendientesConRegla.length} compras?`)) return;

    for (const compra of pendientesConRegla) {
      const regla = reglaSugerida(compra);
      const etiqueta = etiquetas.find((e) => Number(e.id) === Number(regla.etiqueta_id));

      await supabase
        .from("compras_detalle")
        .update({
          etiqueta_id: Number(regla.etiqueta_id),
          etiqueta_nombre: etiqueta?.nombre || regla.etiquetas_contables?.nombre || null,
          cuenta_contable: regla.cuenta_contable,
          observacion_clasificacion: `Aplicado por regla: ${regla.campo} ${regla.operador} ${regla.valor}`,
          clasificacion_estado: "clasificada",
        })
        .eq("id", compra.id)
        .eq("empresa_id", empresaId);
    }

    await cargarTodo();
  };

  const textoCuenta = normalizar(form.cuenta_contable);

  const cuentasFiltradas = cuentas
    .filter((cuenta) => {
      if (!textoCuenta) return true;
      const codigo = normalizar(cuenta.codigo);
      const nombre = normalizar(cuenta.cuenta);
      const completo = normalizar(`${cuenta.codigo} ${cuenta.cuenta}`);
      return codigo.includes(textoCuenta) || nombre.includes(textoCuenta) || completo.includes(textoCuenta);
    })
    .slice(0, 80);

  const parametroCompra = (tipo, documento = "") => {
    const doc = normalizar(documento);

    return parametros.find((p) => {
      if (p.tipo !== tipo) return false;
      const docs = String(p.tipo_documento || "")
        .split(",")
        .map((d) => normalizar(d))
        .filter(Boolean);
      if (docs.length === 0) return true;
      return docs.some((d) => d === doc || doc.includes(d));
    });
  };

  const ivaCredito = parametroCompra("impuesto", "CCF");
  const retencionCompra = parametroCompra("retencion", "");
  const cxpCompra = parametroCompra("cuenta_por_pagar", "");

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🧾 Clasificación de Compras</h1>
            <p className="subtitle">
              Etiqueta analítica y cuenta financiera para compras
              {empresaActual ? ` • ${empresaActual.nombre}` : " • Sin empresa seleccionada"}
            </p>
          </div>
          <div className="actions">
            <button className="btn btn-secondary" style={thinButtonStyle} onClick={() => navigate("/inicio")}>🏠 Inicio</button>
            <button className="btn btn-secondary" style={thinButtonStyle} onClick={() => navigate("/parametros-contables")}>⚙️ Parámetros</button>
            <button className="btn btn-secondary" style={thinButtonStyle} onClick={() => navigate("/reglas-contables")}>🏷️ Reglas</button>
            <button className="btn btn-secondary" style={thinButtonStyle} onClick={cargarTodo} disabled={!empresaId || loading}>🔄 Actualizar</button>
          </div>
        </div>

        {!empresaId && (
          <div className="card" style={{ marginBottom: "20px", border: "1px solid #fecaca" }}>
            <p style={{ margin: 0, color: "#991b1b", fontWeight: 700 }}>Debes seleccionar una empresa antes de clasificar compras.</p>
          </div>
        )}

        <div className="grid grid-4" style={{ marginBottom: "18px" }}>
          <div className="stat-card"><p className="stat-title">Compras</p><p className="stat-value">{resumen.total}</p></div>
          <div className="stat-card"><p className="stat-title">Clasificadas</p><p className="stat-value">{resumen.clasificadas}</p></div>
          <div className="stat-card"><p className="stat-title">Pendientes</p><p className="stat-value">{resumen.pendientes}</p></div>
          <div className="stat-card"><p className="stat-title">Monto</p><p className="stat-value">{dinero(resumen.monto)}</p></div>
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
          <h3 style={{ marginTop: 0 }}>Parámetros de compra detectados</h3>
          <div className="grid grid-3">
            <div><p className="stat-title">IVA crédito fiscal CCF compras</p><b>{ivaCredito?.cuenta_contable || "No configurado"}</b></div>
            <div><p className="stat-title">Retención compras / sujeto excluido</p><b>{retencionCompra?.cuenta_contable || "No configurado"}</b></div>
            <div><p className="stat-title">Cuenta por pagar compras</p><b>{cxpCompra?.cuenta_contable || "No configurado"}</b></div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
          <div className="grid grid-4">
            <div><label className="label">Desde</label><input className="input" style={thinInputStyle} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
            <div><label className="label">Hasta</label><input className="input" style={thinInputStyle} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
            <div><label className="label">Estado</label><select className="select" style={thinInputStyle} value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}><option value="pendientes">Pendientes</option><option value="clasificadas">Clasificadas</option><option value="todas">Todas</option></select></div>
            <div><label className="label">Buscar</label><input className="input" style={thinInputStyle} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="proveedor, documento, cuenta..." /></div>
          </div>
          <div className="actions" style={{ marginTop: "14px" }}>
            <button className="btn btn-primary" style={thinButtonStyle} onClick={cargarTodo} disabled={!empresaId}>Filtrar</button>
            <button className="btn btn-success" style={thinButtonStyle} onClick={aplicarReglasVisibles} disabled={!empresaId}>Aplicar reglas visibles ({resumen.sugeridas})</button>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Proveedor</th><th>Documento</th><th>Total</th><th>IVA</th><th>Retención</th><th>Etiqueta</th><th>Cuenta</th><th>Acciones</th></tr></thead>
              <tbody>
                {comprasFiltradas.length > 0 ? comprasFiltradas.map((compra) => {
                  const cls = clasificacionActual(compra);
                  const regla = cls.regla;
                  const clasificada = Boolean(compra.etiqueta_id && compra.cuenta_contable);
                  return (
                    <tr key={compra.id}>
                      <td>{compra.fecha || "-"}</td>
                      <td>{compra.tipo_dte || "-"}</td>
                      <td>{compra.proveedor || compra.nombre || "-"}</td>
                      <td><div>{compra.numero_control || "-"}</div><small>{compra.codigo_generacion || ""}</small></td>
                      <td>{dinero(compra.total)}</td>
                      <td>{dinero(compra.iva)}</td>
                      <td>{dinero(compra.retencion)}</td>
                      <td>{cls.etiqueta_nombre ? <span className="badge">{cls.etiqueta_nombre}</span> : regla ? <span className="badge">Sugerida: {regla.etiquetas_contables?.nombre}</span> : <span style={{ color: "#991b1b", fontWeight: 700 }}>Pendiente</span>}</td>
                      <td>{cls.cuenta_contable ? <span>{cls.cuenta_contable}</span> : <span style={{ color: "#991b1b", fontWeight: 700 }}>Pendiente</span>}</td>
                      <td><div className="actions">{regla && !clasificada && <button className="btn btn-success" style={thinButtonStyle} onClick={() => aplicarReglaACompra(compra)}>Aplicar regla</button>}<button className="btn btn-primary" style={thinButtonStyle} onClick={() => abrirModal(compra)}>Editar</button></div></td>
                    </tr>
                  );
                }) : <tr><td colSpan="10" style={{ textAlign: "center", color: "#64748b" }}>No hay compras para mostrar</td></tr>}
              </tbody>
            </table>
          </div>
          {loading && <p style={{ marginTop: "12px", color: "#64748b" }}>Cargando...</p>}
        </div>

        {modal && compraActiva && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }} onClick={() => setModal(false)}>
            <div className="card" style={{ width: "min(900px, 96vw)", maxHeight: "90vh", overflow: "auto", borderRadius: "20px" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", marginBottom: "16px" }}>
                <div><h2 className="module-title" style={{ marginBottom: "4px" }}>Clasificar compra</h2><p className="module-text" style={{ margin: 0 }}>{compraActiva.proveedor || compraActiva.nombre || "Proveedor"} · {compraActiva.tipo_dte || "Documento"} · {dinero(compraActiva.total)}</p></div>
                <button className="btn btn-secondary" style={thinButtonStyle} onClick={() => setModal(false)}>Cerrar</button>
              </div>
              <div className="grid grid-2">
                <div><label className="label">Etiqueta analítica</label><select className="select" style={thinInputStyle} value={form.etiqueta_id} onChange={(e) => setForm({ ...form, etiqueta_id: e.target.value })}><option value="">Seleccionar etiqueta</option>{etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                <div style={{ position: "relative" }}><label className="label">Cuenta contable financiera</label><input className="input" style={thinInputStyle} value={form.cuenta_contable} placeholder="Escribe código o cuenta..." onFocus={() => setMostrarSugerencias(true)} onChange={(e) => { setForm({ ...form, cuenta_contable: e.target.value }); setMostrarSugerencias(true); }} />
                  {mostrarSugerencias && <div style={{ position: "absolute", top: "74px", left: 0, right: 0, background: "#fff", border: "1px solid #ddd6fe", borderRadius: "12px", boxShadow: "0 10px 25px rgba(15, 23, 42, 0.15)", zIndex: 50, maxHeight: "320px", overflowY: "auto" }}>{cuentasFiltradas.length > 0 ? cuentasFiltradas.map((cuenta) => <button key={cuenta.id} type="button" onMouseDown={(ev) => { ev.preventDefault(); seleccionarCuenta(cuenta); }} style={{ width: "100%", textAlign: "left", padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}><div style={{ fontWeight: 700, color: "#334155" }}>{cuenta.codigo}</div><div style={{ fontSize: "13px", color: "#64748b" }}>{cuenta.cuenta}</div></button>) : <div style={{ padding: "12px", color: "#64748b" }}>No se encontraron cuentas.</div>}</div>}
                </div>
                <div style={{ gridColumn: "1 / -1" }}><label className="label">Observación</label><input className="input" style={thinInputStyle} value={form.observacion_clasificacion} onChange={(e) => setForm({ ...form, observacion_clasificacion: e.target.value })} placeholder="Comentario interno" /></div>
              </div>
              <div className="actions" style={{ marginTop: "16px", justifyContent: "flex-end" }}><button className="btn btn-secondary" style={thinButtonStyle} onClick={() => setMostrarSugerencias(false)}>Cerrar lista</button><button className="btn btn-success" style={thinButtonStyle} onClick={guardarClasificacion}>Guardar clasificación</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
