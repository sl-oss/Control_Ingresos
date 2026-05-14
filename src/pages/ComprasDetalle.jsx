import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function ComprasDetalle() {
  const navigate = useNavigate();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [compras, setCompras] = useState([]);
  const [mapeosPago, setMapeosPago] = useState([]);
  const [itemsCompra, setItemsCompra] = useState([]);
  const [compraSeleccionada, setCompraSeleccionada] = useState(null);
  const [modalItems, setModalItems] = useState(false);
  const [loading, setLoading] = useState(false);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtro, setFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [metodosSeleccionados, setMetodosSeleccionados] = useState({});

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

  const normalizarTexto = (valor = "") => {
    return String(valor || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const numero = (valor) => {
    const n = Number(valor || 0);
    return Number.isFinite(n) ? n : 0;
  };

  const formatoMoneda = (valor) => `$${numero(valor).toFixed(2)}`;

  const validarEmpresa = () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return false;
    }

    return true;
  };

  const obtenerTipoCompra = (json) => {
    const tipoDte = String(json.identificacion?.tipoDte || "").trim();

    if (tipoDte === "03") return "CCF";
    if (tipoDte === "14") return "FSE";

    return tipoDte || "OTRO";
  };

  const obtenerIvaCCF = (json) => {
    const tributos = json.resumen?.tributos || [];
    const ivaTributo = tributos.find((t) => String(t.codigo) === "20");
    return numero(ivaTributo?.valor || 0);
  };

  const obtenerFormaPago = (json) => {
    const pago = json.resumen?.pagos?.[0];

    if (!pago) return "";

    return String(pago.codigo || "");
  };

  const cargarCompras = async () => {
    if (!empresaId) {
      setCompras([]);
      setMapeosPago([]);
      return;
    }

    setLoading(true);

    let query = supabase
      .from("compras_detalle")
      .select("*, mapeo_cobros_contables(id, metodo_cobro, parametros_contables(nombre, tipo, cuenta_contable))")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false })
      .order("id", { ascending: false });

    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);
    if (tipoFiltro) query = query.eq("tipo_dte", tipoFiltro);

    const { data, error } = await query;

    if (error) {
      console.error(error);
      alert("No se pudieron cargar las compras.");
      setLoading(false);
      return;
    }

    const { data: mapeosData, error: errorMapeos } = await supabase
      .from("mapeo_cobros_contables")
      .select("id, metodo_cobro, activo, parametros_contables(nombre, tipo, cuenta_contable)")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("metodo_cobro", { ascending: true });

    if (errorMapeos) {
      console.error(errorMapeos);
      alert("No se pudieron cargar los métodos de pago contables.");
      setLoading(false);
      return;
    }

    const seleccionInicial = {};
    (data || []).forEach((compra) => {
      if (compra.metodo_pago_id) {
        seleccionInicial[compra.id] = String(compra.metodo_pago_id);
      }
    });

    setCompras(data || []);
    setMapeosPago(mapeosData || []);
    setMetodosSeleccionados(seleccionInicial);
    setLoading(false);
  };

  useEffect(() => {
    cargarCompras();
  }, [empresaId]);

  const leerJSON = async (file) => {
    const text = await file.text();
    return JSON.parse(text);
  };

  const existeCompra = async (codigoGeneracion) => {
    const { data, error } = await supabase
      .from("compras_detalle")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("codigo_generacion", codigoGeneracion)
      .limit(1);

    if (error) {
      console.error(error);
      return false;
    }

    return (data || []).length > 0;
  };

  const prepararCompraDesdeJSON = (json) => {
    const tipo = obtenerTipoCompra(json);
    const identificacion = json.identificacion || {};
    const resumen = json.resumen || {};

    if (tipo === "CCF") {
      return {
        encabezado: {
          empresa_id: empresaId,
          codigo_generacion: identificacion.codigoGeneracion,
          numero_control: identificacion.numeroControl,
          tipo_dte: "CCF",
          fecha: identificacion.fecEmi,
          proveedor: json.emisor?.nombre || "",
          nit: json.emisor?.nit || "",
          total: numero(resumen.totalPagar || resumen.montoTotalOperacion || 0),
          iva: obtenerIvaCCF(json),
          retencion: numero(resumen.ivaRete1 || resumen.reteRenta || 0),
          forma_pago: obtenerFormaPago(json),
          metodo_pago_id: null,
        },
        items: (json.cuerpoDocumento || []).map((item) => ({
          empresa_id: empresaId,
          descripcion: item.descripcion || "",
          cantidad: numero(item.cantidad || 1),
          precio_unitario: numero(item.precioUni || 0),
          compra_gravada: numero(item.ventaGravada || 0),
          compra_exenta: numero(item.ventaExenta || 0),
          compra_no_sujeta: numero(item.ventaNoSuj || 0),
          iva: 0,
          total:
            numero(item.ventaGravada || 0) +
            numero(item.ventaExenta || 0) +
            numero(item.ventaNoSuj || 0),
          etiqueta: "Pendiente de clasificar",
          cuenta_contable: null,
          regla_id: null,
        })),
      };
    }

    if (tipo === "FSE") {
      return {
        encabezado: {
          empresa_id: empresaId,
          codigo_generacion: identificacion.codigoGeneracion,
          numero_control: identificacion.numeroControl,
          tipo_dte: "FSE",
          fecha: identificacion.fecEmi,
          proveedor: json.sujetoExcluido?.nombre || "",
          nit: json.sujetoExcluido?.numDocumento || "",
          total: numero(resumen.totalCompra || resumen.subTotal || 0),
          iva: 0,
          retencion: numero(resumen.reteRenta || resumen.ivaRete1 || 0),
          forma_pago: obtenerFormaPago(json),
          metodo_pago_id: null,
        },
        items: (json.cuerpoDocumento || []).map((item) => ({
          empresa_id: empresaId,
          descripcion: item.descripcion || "",
          cantidad: numero(item.cantidad || 1),
          precio_unitario: numero(item.precioUni || 0),
          compra_gravada: numero(item.compra || 0),
          compra_exenta: 0,
          compra_no_sujeta: 0,
          iva: 0,
          total: numero(item.compra || 0),
          etiqueta: "Pendiente de clasificar",
          cuenta_contable: null,
          regla_id: null,
        })),
      };
    }

    throw new Error(`Tipo de documento no soportado todavía: ${tipo}`);
  };

  const importarArchivo = async (e) => {
    if (!validarEmpresa()) {
      e.target.value = "";
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const json = await leerJSON(file);
      const { encabezado, items } = prepararCompraDesdeJSON(json);

      if (!encabezado.codigo_generacion) {
        alert("El JSON no tiene código de generación.");
        setLoading(false);
        e.target.value = "";
        return;
      }

      const yaExiste = await existeCompra(encabezado.codigo_generacion);

      if (yaExiste) {
        alert("Esta compra ya fue importada.");
        setLoading(false);
        e.target.value = "";
        return;
      }

      const { data: compraInsertada, error: errorCompra } = await supabase
        .from("compras_detalle")
        .insert([encabezado])
        .select()
        .single();

      if (errorCompra) {
        console.error(errorCompra);
        alert(`No se pudo importar la compra: ${errorCompra.message}`);
        setLoading(false);
        e.target.value = "";
        return;
      }

      const itemsConCompra = items.map((item) => ({
        ...item,
        compra_id: compraInsertada.id,
      }));

      if (itemsConCompra.length > 0) {
        const { error: errorItems } = await supabase
          .from("compras_items")
          .insert(itemsConCompra);

        if (errorItems) {
          console.error(errorItems);
          alert("La compra se guardó, pero falló el detalle de items.");
          setLoading(false);
          e.target.value = "";
          return;
        }
      }

      await cargarCompras();
      alert(`Compra importada correctamente: ${encabezado.codigo_generacion}`);
    } catch (error) {
      console.error(error);
      alert(`Error importando JSON: ${error.message}`);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const guardarMetodoPago = async (compra) => {
    if (!validarEmpresa()) return;

    const metodoId = metodosSeleccionados[compra.id];

    if (!metodoId) {
      alert("Selecciona un método de pago contable.");
      return;
    }

    const { error } = await supabase
      .from("compras_detalle")
      .update({ metodo_pago_id: Number(metodoId) })
      .eq("id", compra.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo guardar el método de pago.");
      return;
    }

    await cargarCompras();
    alert("Método de pago guardado.");
  };

  const verItems = async (compra) => {
    setCompraSeleccionada(compra);
    setItemsCompra([]);
    setModalItems(true);

    const { data, error } = await supabase
      .from("compras_items")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("compra_id", compra.id)
      .order("id", { ascending: true });

    if (error) {
      console.error(error);
      alert("No se pudieron cargar los items de la compra.");
      return;
    }

    setItemsCompra(data || []);
  };

  const eliminarCompra = async (compra) => {
    if (!confirm(`¿Eliminar la compra ${compra.codigo_generacion}?`)) return;

    const { error } = await supabase
      .from("compras_detalle")
      .delete()
      .eq("id", compra.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar la compra.");
      return;
    }

    if (compraSeleccionada?.id === compra.id) {
      setModalItems(false);
      setCompraSeleccionada(null);
      setItemsCompra([]);
    }

    cargarCompras();
  };

  const limpiarFiltros = () => {
    setDesde("");
    setHasta("");
    setFiltro("");
    setTipoFiltro("");
  };

  const texto = normalizarTexto(filtro);

  const comprasFiltradas = compras.filter((compra) => {
    if (!texto) return true;

    const busqueda = normalizarTexto(
      [
        compra.fecha,
        compra.tipo_dte,
        compra.numero_control,
        compra.codigo_generacion,
        compra.proveedor,
        compra.nit,
        compra.total,
        compra.iva,
        compra.retencion,
        compra.forma_pago,
        compra.mapeo_cobros_contables?.metodo_cobro,
        compra.mapeo_cobros_contables?.parametros_contables?.cuenta_contable,
      ].join(" ")
    );

    return busqueda.includes(texto);
  });

  const totales = comprasFiltradas.reduce(
    (acc, compra) => {
      acc.total += numero(compra.total);
      acc.iva += numero(compra.iva);
      acc.retencion += numero(compra.retencion);
      return acc;
    },
    { total: 0, iva: 0, retencion: 0 }
  );

  const tiposDisponibles = [...new Set(compras.map((c) => c.tipo_dte).filter(Boolean))];

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">📥 Compras y Gastos</h1>
            <p className="subtitle">
              Importa CCF de compras y Facturas de Sujeto Excluido
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
              onClick={() => navigate("/mapeo-cobros-contables")}
            >
              💳 Mapeo pagos
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={cargarCompras}
              disabled={!empresaId || loading}
            >
              🔄 Actualizar
            </button>
          </div>
        </div>

        {!empresaId && (
          <div
            className="card"
            style={{ marginBottom: "20px", border: "1px solid #fecaca" }}
          >
            <p style={{ margin: 0, color: "#991b1b", fontWeight: 600 }}>
              Debes seleccionar una empresa antes de importar compras.
            </p>
          </div>
        )}

        <div className="card" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0 }}>Importar JSON de compra</h3>

          <div className="actions">
            <label
              className="btn btn-success"
              style={{
                ...thinButtonStyle,
                opacity: empresaId ? 1 : 0.5,
                pointerEvents: empresaId ? "auto" : "none",
                textAlign: "center",
              }}
            >
              📥 Subir JSON CCF / FSE
              <input
                type="file"
                hidden
                accept=".json,application/json"
                onChange={importarArchivo}
              />
            </label>

            {loading && (
              <span style={{ color: "#64748b", alignSelf: "center" }}>
                Procesando...
              </span>
            )}
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
              <label className="label">Tipo</label>
              <select
                className="select"
                style={thinInputStyle}
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                disabled={!empresaId}
              >
                <option value="">Todos</option>
                {tiposDisponibles.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Buscar</label>
              <input
                className="input"
                style={thinInputStyle}
                placeholder="Proveedor, NIT, documento, código..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                disabled={!empresaId}
              />
            </div>
          </div>

          <div className="actions" style={{ marginTop: "14px" }}>
            <button
              className="btn btn-primary"
              style={thinButtonStyle}
              onClick={cargarCompras}
              disabled={!empresaId || loading}
            >
              Aplicar filtros
            </button>

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

        <div className="grid grid-3" style={{ marginBottom: "20px" }}>
          <div className="stat-card">
            <p className="stat-title">Total visible</p>
            <h2 className="stat-value">{formatoMoneda(totales.total)}</h2>
          </div>

          <div className="stat-card">
            <p className="stat-title">IVA crédito visible</p>
            <h2 className="stat-value">{formatoMoneda(totales.iva)}</h2>
          </div>

          <div className="stat-card">
            <p className="stat-title">Retención visible</p>
            <h2 className="stat-value">{formatoMoneda(totales.retencion)}</h2>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Compras cargadas</h3>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Código generación</th>
                  <th>Proveedor</th>
                  <th>NIT / Documento</th>
                  <th>Total</th>
                  <th>IVA</th>
                  <th>Retención</th>
                  <th>Pago JSON</th>
                  <th>Método pago contable</th>
                  <th>Cuenta pago</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {comprasFiltradas.length > 0 ? (
                  comprasFiltradas.map((compra) => (
                    <tr key={compra.id}>
                      <td>{compra.fecha || "-"}</td>
                      <td>
                        <span className="badge">{compra.tipo_dte || "-"}</span>
                      </td>
                      <td>{compra.codigo_generacion || "-"}</td>
                      <td>{compra.proveedor || "-"}</td>
                      <td>{compra.nit || "-"}</td>
                      <td>{formatoMoneda(compra.total)}</td>
                      <td>{formatoMoneda(compra.iva)}</td>
                      <td>{formatoMoneda(compra.retencion)}</td>
                      <td>{compra.forma_pago || "-"}</td>
                      <td style={{ minWidth: "260px" }}>
                        <select
                          className="select"
                          style={thinInputStyle}
                          value={metodosSeleccionados[compra.id] || ""}
                          onChange={(e) =>
                            setMetodosSeleccionados({
                              ...metodosSeleccionados,
                              [compra.id]: e.target.value,
                            })
                          }
                        >
                          <option value="">Seleccionar método</option>
                          {mapeosPago.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.metodo_cobro}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ minWidth: "260px" }}>
                        {compra.mapeo_cobros_contables?.parametros_contables
                          ?.cuenta_contable || "-"}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="btn btn-success"
                            style={thinButtonStyle}
                            onClick={() => guardarMetodoPago(compra)}
                          >
                            Guardar pago
                          </button>
                          <button
                            className="btn btn-primary"
                            style={thinButtonStyle}
                            onClick={() => verItems(compra)}
                          >
                            Ver items
                          </button>

                          <button
                            className="btn btn-secondary"
                            style={thinButtonStyle}
                            onClick={() => eliminarCompra(compra)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="12"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      No hay compras para mostrar
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {modalItems && compraSeleccionada && (
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
                maxWidth: "1200px",
                maxHeight: "88vh",
                overflow: "auto",
              }}
            >
              <div className="topbar" style={{ marginBottom: "16px" }}>
                <div>
                  <h2 className="title" style={{ fontSize: "22px" }}>
                    Items de compra
                  </h2>
                  <p className="subtitle">
                    {compraSeleccionada.proveedor} • {compraSeleccionada.codigo_generacion}
                  </p>
                </div>

                <div className="actions">
                  <button
                    className="btn btn-secondary"
                    style={thinButtonStyle}
                    onClick={() => {
                      setModalItems(false);
                      setCompraSeleccionada(null);
                      setItemsCompra([]);
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
                      <th>Descripción</th>
                      <th>Cantidad</th>
                      <th>Precio unitario</th>
                      <th>Gravada / Compra</th>
                      <th>Exenta</th>
                      <th>No sujeta</th>
                      <th>Total</th>
                      <th>Etiqueta</th>
                      <th>Cuenta</th>
                    </tr>
                  </thead>

                  <tbody>
                    {itemsCompra.length > 0 ? (
                      itemsCompra.map((item) => (
                        <tr key={item.id}>
                          <td>{item.descripcion || "-"}</td>
                          <td>{numero(item.cantidad).toFixed(2)}</td>
                          <td>{formatoMoneda(item.precio_unitario)}</td>
                          <td>{formatoMoneda(item.compra_gravada)}</td>
                          <td>{formatoMoneda(item.compra_exenta)}</td>
                          <td>{formatoMoneda(item.compra_no_sujeta)}</td>
                          <td>{formatoMoneda(item.total)}</td>
                          <td>
                            <span className="badge">
                              {item.etiqueta || "Pendiente de clasificar"}
                            </span>
                          </td>
                          <td>{item.cuenta_contable || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="9"
                          style={{ textAlign: "center", color: "#64748b" }}
                        >
                          Esta compra no tiene items
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="actions" style={{ marginTop: "14px" }}>
                <button
                  className="btn btn-primary"
                  style={thinButtonStyle}
                  onClick={() => navigate("/clasificacion-compras")}
                >
                  Ir a clasificación de compras
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
