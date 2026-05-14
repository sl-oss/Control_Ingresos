import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function ClasificacionFacturacion() {
  const navigate = useNavigate();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [items, setItems] = useState([]);
  const [etiquetas, setEtiquetas] = useState([]);
  const [reglas, setReglas] = useState([]);
  const [cuentasCatalogo, setCuentasCatalogo] = useState([]);
  const [loading, setLoading] = useState(false);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtro, setFiltro] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);

  const [editandoId, setEditandoId] = useState(null);
  const [formEdit, setFormEdit] = useState({
    etiqueta: "",
    cuenta_contable: "",
    regla_id: null,
  });

  const [mostrarSugerenciasCuenta, setMostrarSugerenciasCuenta] = useState(false);

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

  const validarEmpresa = () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return false;
    }
    return true;
  };

  const normalizarTexto = (valor = "") => {
    return String(valor || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const cumpleRegla = (textoCampo, operador, valorRegla) => {
    const texto = normalizarTexto(textoCampo);
    const valor = normalizarTexto(valorRegla);

    if (!valor) return false;

    if (operador === "igual") return texto === valor;
    if (operador === "inicia_con") return texto.startsWith(valor);
    if (operador === "termina_con") return texto.endsWith(valor);

    return texto.includes(valor);
  };

  const obtenerCampoParaRegla = (item, regla) => {
    const factura = item.facturacion_detalle || {};

    if (regla.campo === "descripcion") return item.descripcion || "";
    if (regla.campo === "nombre") return factura.nombre || "";
    if (regla.campo === "nit") return factura.nitprov || "";
    if (regla.campo === "codigo") return item.codigo || "";

    return "";
  };

  const buscarReglaParaItem = (item) => {
    for (const regla of reglas) {
      const textoCampo = obtenerCampoParaRegla(item, regla);

      if (cumpleRegla(textoCampo, regla.operador, regla.valor)) {
        return regla;
      }
    }

    return null;
  };

  const cargarDatos = async () => {
    if (!empresaId) {
      setItems([]);
      setEtiquetas([]);
      setReglas([]);
      setCuentasCatalogo([]);
      return;
    }

    setLoading(true);

    let query = supabase
      .from("facturacion_items")
      .select(
        `
        *,
        facturacion_detalle:facturacion_id (
          id,
          fecha,
          tipo_libro,
          numdoc,
          numdocal,
          nombre,
          nitprov,
          totalvent
        )
      `
      )
      .eq("empresa_id", empresaId)
      .order("id", { ascending: false });

    const { data: itemsData, error: errorItems } = await query;

    if (errorItems) {
      console.error(errorItems);
      alert("No se pudieron cargar los items de facturación.");
      setLoading(false);
      return;
    }

    const { data: etiquetasData, error: errorEtiquetas } = await supabase
      .from("etiquetas_contables")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("tipo", "ingreso")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (errorEtiquetas) {
      console.error(errorEtiquetas);
      alert("No se pudieron cargar las etiquetas.");
      setLoading(false);
      return;
    }

    const { data: reglasData, error: errorReglas } = await supabase
      .from("reglas_contables")
      .select("*, etiquetas_contables(nombre)")
      .eq("empresa_id", empresaId)
      .eq("tipo", "ingreso")
      .eq("activo", true)
      .order("id", { ascending: true });

    if (errorReglas) {
      console.error(errorReglas);
      alert("No se pudieron cargar las reglas.");
      setLoading(false);
      return;
    }

    const { data: cuentasData, error: errorCuentas } = await supabase
      .from("catalogo_contable")
      .select("id, codigo, cuenta, es_movimiento, activo")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .eq("es_movimiento", true)
      .order("codigo", { ascending: true });

    if (errorCuentas) {
      console.error(errorCuentas);
      alert("No se pudo cargar el catálogo contable.");
      setLoading(false);
      return;
    }

    setItems(itemsData || []);
    setEtiquetas(etiquetasData || []);
    setReglas(reglasData || []);
    setCuentasCatalogo(cuentasData || []);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [empresaId]);

  const aplicarReglaAItem = async (item, silencioso = false) => {
    const regla = buscarReglaParaItem(item);

    if (!regla) {
      if (!silencioso) {
        alert("No se encontró una regla para este item.");
      }

      return false;
    }

    const payload = {
      etiqueta: regla.etiquetas_contables?.nombre || "Sin etiqueta",
      cuenta_contable: regla.cuenta_contable || null,
      regla_id: regla.id,
    };

    const { error } = await supabase
      .from("facturacion_items")
      .update(payload)
      .eq("id", item.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      if (!silencioso) alert("No se pudo aplicar la regla.");
      return false;
    }

    return true;
  };

  const reprocesarTodos = async () => {
    if (!validarEmpresa()) return;

    if (!confirm("¿Aplicar reglas a todos los items visibles?")) return;

    setLoading(true);

    let aplicados = 0;
    let sinRegla = 0;

    for (const item of itemsFiltrados) {
      const ok = await aplicarReglaAItem(item, true);
      if (ok) aplicados += 1;
      else sinRegla += 1;
    }

    await cargarDatos();

    setLoading(false);
    alert(`Proceso finalizado.\nAplicados: ${aplicados}\nSin regla: ${sinRegla}`);
  };

  const iniciarEdicion = (item) => {
    setEditandoId(item.id);
    setFormEdit({
      etiqueta: item.etiqueta || "",
      cuenta_contable: item.cuenta_contable || "",
      regla_id: item.regla_id || null,
    });
    setMostrarSugerenciasCuenta(false);
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setFormEdit({
      etiqueta: "",
      cuenta_contable: "",
      regla_id: null,
    });
    setMostrarSugerenciasCuenta(false);
  };

  const guardarEdicion = async (item) => {
    if (!validarEmpresa()) return;

    const payload = {
      etiqueta: formEdit.etiqueta || "Pendiente de clasificar",
      cuenta_contable: formEdit.cuenta_contable || null,
      regla_id: formEdit.regla_id || null,
    };

    const { error } = await supabase
      .from("facturacion_items")
      .update(payload)
      .eq("id", item.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo guardar la clasificación.");
      return;
    }

    cancelarEdicion();
    cargarDatos();
  };

  const crearReglaDesdeItem = async (item) => {
    if (!validarEmpresa()) return;

    const etiqueta = item.etiqueta || formEdit.etiqueta;
    const cuenta = item.cuenta_contable || formEdit.cuenta_contable;
    const descripcion = item.descripcion || "";

    if (!descripcion.trim()) {
      alert("Este item no tiene descripción para crear una regla.");
      return;
    }

    if (!etiqueta || etiqueta === "Pendiente de clasificar") {
      alert("Primero asigna una etiqueta al item.");
      return;
    }

    if (!cuenta) {
      alert("Primero asigna una cuenta contable al item.");
      return;
    }

    const etiquetaEncontrada = etiquetas.find(
      (e) => normalizarTexto(e.nombre) === normalizarTexto(etiqueta)
    );

    if (!etiquetaEncontrada) {
      alert("La etiqueta del item no existe en etiquetas contables.");
      return;
    }

    const textoRegla = prompt(
      "Texto que debe buscar la regla:",
      descripcion.split(":")[0].trim()
    );

    if (!textoRegla || !textoRegla.trim()) return;

    const payload = {
      empresa_id: empresaId,
      tipo: "ingreso",
      campo: "descripcion",
      operador: "contiene",
      valor: textoRegla.trim(),
      etiqueta_id: etiquetaEncontrada.id,
      cuenta_contable: cuenta,
      activo: true,
    };

    const { data: reglaInsertada, error } = await supabase
      .from("reglas_contables")
      .insert([payload])
      .select("*, etiquetas_contables(nombre)")
      .single();

    if (error) {
      console.error(error);
      alert("No se pudo crear la regla.");
      return;
    }

    await supabase
      .from("facturacion_items")
      .update({
        regla_id: reglaInsertada.id,
        etiqueta: etiquetaEncontrada.nombre,
        cuenta_contable: cuenta,
      })
      .eq("id", item.id)
      .eq("empresa_id", empresaId);

    await cargarDatos();
    alert("Regla creada y aplicada al item.");
  };



  const crearItemsFaltantes = async () => {
    if (!validarEmpresa()) return;

    if (
      !confirm(
        "¿Crear items globales para las facturas que no tienen detalle de productos?"
      )
    ) {
      return;
    }

    setLoading(true);

    try {
      let query = supabase
        .from("facturacion_detalle")
        .select("*, facturacion_items(id)")
        .eq("empresa_id", empresaId)
        .order("id", { ascending: false });

      if (desde) query = query.gte("fecha", desde);
      if (hasta) query = query.lte("fecha", hasta);

      const { data: facturasData, error } = await query;

      if (error) {
        console.error(error);
        alert("No se pudieron buscar las facturas sin items.");
        setLoading(false);
        return;
      }

      const sinItems = (facturasData || []).filter(
        (factura) =>
          !factura.facturacion_items || factura.facturacion_items.length === 0
      );

      if (sinItems.length === 0) {
        alert("No hay facturas sin items en el rango seleccionado.");
        setLoading(false);
        return;
      }

      const nuevosItems = sinItems.map((factura) => {
        const total = Number(factura.totalvent || 0);
        const iva = Number(factura.debitofis || 0);
        const ventaGravada = Number(factura.vgravadas || 0);
        const ventaExenta = Number(factura.vexentas || 0);

        return {
          empresa_id: empresaId,
          facturacion_id: factura.id,
          descripcion: "Ingreso global",
          cantidad: 1,
          precio_unitario: total,
          venta_gravada: ventaGravada,
          venta_exenta: ventaExenta,
          venta_no_sujeta: 0,
          iva,
          total,
          etiqueta: "Pendiente de clasificar",
          cuenta_contable: null,
          regla_id: null,
        };
      });

      const { error: errorInsert } = await supabase
        .from("facturacion_items")
        .insert(nuevosItems);

      if (errorInsert) {
        console.error(errorInsert);
        alert("No se pudieron crear los items faltantes.");
        setLoading(false);
        return;
      }

      await cargarDatos();
      setLoading(false);
      alert(`Se crearon ${nuevosItems.length} item(s) global(es).`);
    } catch (error) {
      console.error(error);
      alert("Error creando items faltantes.");
      setLoading(false);
    }
  };


  const seleccionarCuenta = (cuenta) => {
    setFormEdit({
      ...formEdit,
      cuenta_contable: `${cuenta.codigo} - ${cuenta.cuenta}`,
    });
    setMostrarSugerenciasCuenta(false);
  };

  const textoCuenta = normalizarTexto(formEdit.cuenta_contable);

  const cuentasFiltradas = cuentasCatalogo
    .filter((cuenta) => {
      if (!textoCuenta) return true;

      const codigo = normalizarTexto(cuenta.codigo);
      const nombre = normalizarTexto(cuenta.cuenta);
      const completo = normalizarTexto(`${cuenta.codigo} ${cuenta.cuenta}`);

      return (
        codigo.includes(textoCuenta) ||
        nombre.includes(textoCuenta) ||
        completo.includes(textoCuenta)
      );
    })
    .slice(0, 12);

  const limpiarFiltros = () => {
    setDesde("");
    setHasta("");
    setFiltro("");
    setSoloPendientes(false);
  };

  const texto = normalizarTexto(filtro);

  const itemsFiltrados = items.filter((item) => {
    const factura = item.facturacion_detalle || {};
    const fecha = factura.fecha || "";

    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;

    if (soloPendientes) {
      const etiqueta = normalizarTexto(item.etiqueta);
      if (etiqueta && etiqueta !== "pendiente de clasificar") return false;
    }

    if (!texto) return true;

    const busqueda = normalizarTexto(
      [
        factura.fecha,
        factura.numdoc,
        factura.numdocal,
        factura.nombre,
        factura.nitprov,
        item.descripcion,
        item.etiqueta,
        item.cuenta_contable,
      ].join(" ")
    );

    return busqueda.includes(texto);
  });

  const totalGravada = itemsFiltrados.reduce(
    (acc, item) => acc + Number(item.venta_gravada || 0),
    0
  );

  const totalIva = itemsFiltrados.reduce(
    (acc, item) => acc + Number(item.iva || 0),
    0
  );

  const totalItems = itemsFiltrados.reduce(
    (acc, item) => acc + Number(item.total || 0),
    0
  );

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🏷️ Clasificación de Facturación</h1>
            <p className="subtitle">
              Asigna etiquetas y cuentas contables a los productos facturados
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
              onClick={() => navigate("/reglas-contables")}
            >
              ⚙️ Reglas
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
              Debes seleccionar una empresa antes de clasificar facturación.
            </p>
          </div>
        )}

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
                placeholder="Cliente, documento, descripción, etiqueta..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                disabled={!empresaId}
              />
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: "10px" }}>
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={soloPendientes}
                  onChange={(e) => setSoloPendientes(e.target.checked)}
                  disabled={!empresaId}
                />
                Solo pendientes
              </label>
            </div>
          </div>

          <div className="actions" style={{ marginTop: "14px" }}>
            <button
              className="btn btn-primary"
              style={thinButtonStyle}
              onClick={reprocesarTodos}
              disabled={!empresaId || loading}
            >
              🔄 Aplicar reglas a visibles
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={limpiarFiltros}
              disabled={!empresaId}
            >
              Limpiar filtros
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={cargarDatos}
              disabled={!empresaId}
            >
              Actualizar
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={crearItemsFaltantes}
              disabled={!empresaId || loading}
            >
              🔧 Crear items faltantes
            </button>
          </div>
        </div>

        <div className="grid grid-3" style={{ marginBottom: "20px" }}>
          <div className="stat-card">
            <p className="stat-title">Venta gravada visible</p>
            <h2 className="stat-value">${totalGravada.toFixed(2)}</h2>
          </div>

          <div className="stat-card">
            <p className="stat-title">IVA visible</p>
            <h2 className="stat-value">${totalIva.toFixed(2)}</h2>
          </div>

          <div className="stat-card">
            <p className="stat-title">Total visible</p>
            <h2 className="stat-value">${totalItems.toFixed(2)}</h2>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Documento</th>
                  <th>Cliente</th>
                  <th>Descripción</th>
                  <th>Etiqueta</th>
                  <th>Cuenta</th>
                  <th>Regla</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {empresaId ? (
                  itemsFiltrados.length > 0 ? (
                    itemsFiltrados.map((item) => {
                      const factura = item.facturacion_detalle || {};
                      const esEditando = editandoId === item.id;

                      return (
                        <tr key={item.id}>
                          <td>{factura.fecha || "-"}</td>
                          <td>{factura.numdoc || factura.numdocal || "-"}</td>
                          <td>{factura.nombre || "-"}</td>
                          <td style={{ minWidth: "260px" }}>
                            {item.descripcion || "-"}
                          </td>

                          <td>
                            {esEditando ? (
                              <select
                                className="select"
                                style={thinInputStyle}
                                value={formEdit.etiqueta}
                                onChange={(e) =>
                                  setFormEdit({
                                    ...formEdit,
                                    etiqueta: e.target.value,
                                  })
                                }
                              >
                                <option value="">Pendiente de clasificar</option>
                                {etiquetas.map((etiqueta) => (
                                  <option key={etiqueta.id} value={etiqueta.nombre}>
                                    {etiqueta.nombre}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="badge">
                                {item.etiqueta || "Pendiente de clasificar"}
                              </span>
                            )}
                          </td>

                          <td style={{ minWidth: "260px", position: "relative" }}>
                            {esEditando ? (
                              <>
                                <input
                                  className="input"
                                  style={thinInputStyle}
                                  placeholder="Escribe código o cuenta..."
                                  value={formEdit.cuenta_contable}
                                  onFocus={() => setMostrarSugerenciasCuenta(true)}
                                  onChange={(e) => {
                                    setFormEdit({
                                      ...formEdit,
                                      cuenta_contable: e.target.value,
                                    });
                                    setMostrarSugerenciasCuenta(true);
                                  }}
                                />

                                {mostrarSugerenciasCuenta && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: "48px",
                                      left: 0,
                                      right: 0,
                                      background: "#fff",
                                      border: "1px solid #ddd6fe",
                                      borderRadius: "12px",
                                      boxShadow:
                                        "0 10px 25px rgba(15, 23, 42, 0.15)",
                                      zIndex: 50,
                                      maxHeight: "260px",
                                      overflowY: "auto",
                                    }}
                                  >
                                    {cuentasFiltradas.length > 0 ? (
                                      cuentasFiltradas.map((cuenta) => (
                                        <button
                                          key={cuenta.id}
                                          type="button"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            seleccionarCuenta(cuenta);
                                          }}
                                          style={{
                                            width: "100%",
                                            textAlign: "left",
                                            padding: "10px 12px",
                                            border: "none",
                                            background: "transparent",
                                            cursor: "pointer",
                                            borderBottom: "1px solid #f1f5f9",
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontWeight: 700,
                                              color: "#334155",
                                            }}
                                          >
                                            {cuenta.codigo}
                                          </div>
                                          <div
                                            style={{
                                              fontSize: "13px",
                                              color: "#64748b",
                                            }}
                                          >
                                            {cuenta.cuenta}
                                          </div>
                                        </button>
                                      ))
                                    ) : (
                                      <div
                                        style={{
                                          padding: "12px",
                                          color: "#64748b",
                                        }}
                                      >
                                        No se encontraron cuentas.
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            ) : (
                              item.cuenta_contable || "-"
                            )}
                          </td>

                          <td>{item.regla_id ? `#${item.regla_id}` : "-"}</td>
                          <td>${Number(item.total || 0).toFixed(2)}</td>

                          <td>
                            <div className="actions">
                              {esEditando ? (
                                <>
                                  <button
                                    className="btn btn-success"
                                    style={thinButtonStyle}
                                    onClick={() => guardarEdicion(item)}
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
                                    onClick={() => iniciarEdicion(item)}
                                  >
                                    Editar
                                  </button>

                                  <button
                                    className="btn btn-secondary"
                                    style={thinButtonStyle}
                                    onClick={async () => {
                                      const ok = await aplicarReglaAItem(item);
                                      if (ok) cargarDatos();
                                    }}
                                  >
                                    Aplicar regla
                                  </button>

                                  <button
                                    className="btn btn-secondary"
                                    style={thinButtonStyle}
                                    onClick={() => crearReglaDesdeItem(item)}
                                  >
                                    Crear regla
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan="9"
                        style={{ textAlign: "center", color: "#64748b" }}
                      >
                        No hay items para mostrar
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td
                      colSpan="9"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      Selecciona una empresa para ver los items
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
      </div>
    </div>
  );
}
