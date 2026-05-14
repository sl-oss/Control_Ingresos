import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function AsientosContables() {
  const navigate = useNavigate();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [facturas, setFacturas] = useState([]);
  const [mapeos, setMapeos] = useState([]);
  const [parametros, setParametros] = useState([]);
  const [asientos, setAsientos] = useState([]);
  const [loading, setLoading] = useState(false);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtro, setFiltro] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(true);

  const [seleccionCobro, setSeleccionCobro] = useState({});
  const [referencias, setReferencias] = useState({});
  const [asientoSeleccionado, setAsientoSeleccionado] = useState(null);
  const [detalleAsiento, setDetalleAsiento] = useState([]);

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

  const extraerCodigoCuenta = (cuentaContable = "") => {
    const texto = String(cuentaContable || "").trim();
    if (!texto) return "";
    return texto.split(" - ")[0]?.trim() || texto;
  };

  const redondear = (valor) => Math.round(Number(valor || 0) * 100) / 100;

  const cargarDatos = async () => {
    if (!empresaId) {
      setFacturas([]);
      setMapeos([]);
      setParametros([]);
      setAsientos([]);
      return;
    }

    setLoading(true);

    let queryFacturas = supabase
      .from("facturacion_detalle")
      .select(
        `
        *,
        facturacion_items (*)
      `
      )
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false })
      .order("id", { ascending: false });

    if (desde) queryFacturas = queryFacturas.gte("fecha", desde);
    if (hasta) queryFacturas = queryFacturas.lte("fecha", hasta);

    const { data: facturasData, error: errorFacturas } = await queryFacturas;

    if (errorFacturas) {
      console.error(errorFacturas);
      alert("No se pudieron cargar las facturas.");
      setLoading(false);
      return;
    }

    const { data: parametrosData, error: errorParametros } = await supabase
      .from("parametros_contables")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("tipo", { ascending: true })
      .order("nombre", { ascending: true });

    if (errorParametros) {
      console.error(errorParametros);
      alert("No se pudieron cargar los parámetros contables.");
      setLoading(false);
      return;
    }

    const { data: mapeosData, error: errorMapeos } = await supabase
      .from("mapeo_cobros_contables")
      .select("*, parametros_contables(nombre, tipo, cuenta_contable)")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("metodo_cobro", { ascending: true });

    if (errorMapeos) {
      console.error(errorMapeos);
      alert("No se pudieron cargar los mapeos de cobro.");
      setLoading(false);
      return;
    }

    const { data: asientosData, error: errorAsientos } = await supabase
      .from("asientos_contables")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("id", { ascending: false });

    if (errorAsientos) {
      console.error(errorAsientos);
      alert("No se pudieron cargar los asientos.");
      setLoading(false);
      return;
    }

    setFacturas(facturasData || []);
    setParametros(parametrosData || []);
    setMapeos(mapeosData || []);
    setAsientos(asientosData || []);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [empresaId]);

  const idsFacturasConAsiento = useMemo(() => {
    return new Set(
      (asientos || [])
        .filter((a) => a.facturacion_id)
        .map((a) => Number(a.facturacion_id))
    );
  }, [asientos]);

  const obtenerDocumentosParametro = (parametro) => {
    const valor = String(parametro?.tipo_documento || "").toUpperCase().trim();

    if (!valor) return [];

    return valor
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const parametroAplicaDocumento = (parametro, tipoLibro) => {
    const documentos = obtenerDocumentosParametro(parametro);
    const tipo = String(tipoLibro || "").toUpperCase().trim();

    // Si está vacío, aplica para todos como respaldo.
    if (documentos.length === 0) return true;

    return documentos.includes(tipo) || documentos.includes("TODOS");
  };

  const buscarParametroIva = (tipoLibro) => {
    const tipo = String(tipoLibro || "").toUpperCase().trim();

    const posibles = parametros.filter(
      (p) => p.tipo === "impuesto" && normalizarTexto(p.nombre).includes("iva")
    );

    // 1) Primero busca parámetros con documento específico exacto.
    const porDocumento = posibles.find((p) => {
      const documentos = obtenerDocumentosParametro(p);
      return documentos.length > 0 && documentos.includes(tipo);
    });

    if (porDocumento) return porDocumento;

    // 2) Si no hay específico, usa uno general sin documento o con TODOS.
    const general = posibles.find((p) => parametroAplicaDocumento(p, tipo));

    if (general) return general;

    // 3) Respaldo por nombre para parámetros viejos.
    if (tipo === "CF") {
      return (
        posibles.find((p) => normalizarTexto(p.nombre).includes("consumidor")) ||
        posibles.find((p) => normalizarTexto(p.nombre) === "iva debito cf") ||
        posibles.find((p) => normalizarTexto(p.nombre) === "iva débito cf") ||
        null
      );
    }

    if (tipo === "CCF") {
      return (
        posibles.find((p) => normalizarTexto(p.nombre).includes("contribuyente")) ||
        posibles.find((p) => normalizarTexto(p.nombre).includes("ccf")) ||
        null
      );
    }

    return null;
  };

  const obtenerCodigoGeneracion = (factura) => {
    return factura.numresol || factura.numdoc || factura.numdocal || `FACT-${factura.id}`;
  };

  const calcularBaseIngresoItem = (factura, item) => {
    const tipo = String(factura.tipo_libro || "").toUpperCase();

    const gravada = Number(item.venta_gravada || 0);
    const exenta = Number(item.venta_exenta || 0);
    const noSujeta = Number(item.venta_no_sujeta || 0);
    const iva = Number(item.iva || 0);
    const total = Number(item.total || 0);

    const baseNormal = gravada + exenta + noSujeta;

    if (baseNormal > 0) {
      if (tipo === "CF") {
        // Si el item ya trae IVA separado, lo restamos. Si no trae IVA, dejamos base normal.
        return redondear(baseNormal - iva);
      }

      return redondear(baseNormal);
    }

    // Fallback para facturas reparadas sin desglose.
    if (total > 0) {
      if (tipo === "CF") {
        return redondear(total / 1.13);
      }

      return redondear(total - iva);
    }

    return 0;
  };
  const construirDetalleAsiento = (factura, mapeo, parametroIva, referencia = "") => {
    const items = factura.facturacion_items || [];
    const codigoGeneracion = obtenerCodigoGeneracion(factura);

    const totalDebe = redondear(
      Number(factura.totalvent || 0) ||
        items.reduce((acc, item) => acc + Number(item.total || 0), 0)
    );

    let totalIva = redondear(
      items.reduce((acc, item) => acc + Number(item.iva || 0), 0)
    );

    // Fallback para CF reparadas sin IVA separado.
    if (totalIva === 0 && String(factura.tipo_libro || "").toUpperCase() === "CF") {
      const baseCalculada = redondear(
        items.reduce((acc, item) => acc + calcularBaseIngresoItem(factura, item), 0)
      );

      totalIva = redondear(totalDebe - baseCalculada);
    }

    const detalle = [];

    detalle.push({
      empresa_id: empresaId,
      fecha: factura.fecha,
      cod: extraerCodigoCuenta(mapeo.parametros_contables.cuenta_contable),
      nombre: factura.nombre || "Cliente",
      descripcion: `${codigoGeneracion} - Cobro factura`,
      debe: totalDebe,
      haber: 0,
      referencia,
      etiqueta: "Medio de cobro",
      cuenta_contable: mapeo.parametros_contables.cuenta_contable,
      facturacion_item_id: null,
    });

    items.forEach((item) => {
      const baseIngreso = calcularBaseIngresoItem(factura, item);

      if (baseIngreso > 0) {
        detalle.push({
          empresa_id: empresaId,
          fecha: factura.fecha,
          cod: extraerCodigoCuenta(item.cuenta_contable),
          nombre: factura.nombre || "Cliente",
          descripcion: `${codigoGeneracion} - ${item.descripcion || "Item factura"}`,
          debe: 0,
          haber: baseIngreso,
          referencia,
          etiqueta: item.etiqueta || null,
          cuenta_contable: item.cuenta_contable,
          facturacion_item_id: item.id,
        });
      }
    });

    if (totalIva > 0) {
      detalle.push({
        empresa_id: empresaId,
        fecha: factura.fecha,
        cod: extraerCodigoCuenta(parametroIva.cuenta_contable),
        nombre: factura.nombre || "Cliente",
        descripcion: `${codigoGeneracion} - IVA débito ${factura.tipo_libro}`,
        debe: 0,
        haber: totalIva,
        referencia,
        etiqueta: "IVA débito",
        cuenta_contable: parametroIva.cuenta_contable,
        facturacion_item_id: null,
      });
    }

    const totalHaber = redondear(
      detalle.reduce((acc, item) => acc + Number(item.haber || 0), 0)
    );

    return { detalle, totalDebe, totalHaber };
  };

  const validarFacturaParaAsiento = (factura, mapeoId) => {
    if (idsFacturasConAsiento.has(Number(factura.id))) {
      return "Esta factura ya tiene asiento generado.";
    }

    if (!mapeoId) {
      return "Selecciona el método de cobro para esta factura.";
    }

    const mapeo = mapeos.find((m) => String(m.id) === String(mapeoId));
    if (!mapeo?.parametros_contables?.cuenta_contable) {
      return "El método de cobro no tiene una cuenta contable válida.";
    }

    const parametroIva = buscarParametroIva(factura.tipo_libro);
    if (!parametroIva?.cuenta_contable) {
      return `No encontré parámetro de IVA para ${factura.tipo_libro}.`;
    }

    const items = factura.facturacion_items || [];
    if (items.length === 0) {
      return "Esta factura no tiene items para contabilizar.";
    }

    const sinClasificar = items.filter(
      (item) =>
        !item.cuenta_contable ||
        !item.etiqueta ||
        normalizarTexto(item.etiqueta) === "pendiente de clasificar"
    );

    if (sinClasificar.length > 0) {
      return "Hay items sin etiqueta o cuenta contable.";
    }

    const { totalDebe, totalHaber } = construirDetalleAsiento(
      factura,
      mapeo,
      parametroIva,
      referencias[factura.id] || ""
    );

    if (Math.abs(totalDebe - totalHaber) > 0.02) {
      return `El asiento no cuadra. Debe: ${totalDebe.toFixed(
        2
      )}, Haber: ${totalHaber.toFixed(2)}.`;
    }

    return null;
  };

  const generarAsiento = async (factura, silencioso = false) => {
    if (!empresaId) {
      if (!silencioso) alert("Primero debes seleccionar una empresa.");
      return { ok: false, mensaje: "Sin empresa." };
    }

    const mapeoId = seleccionCobro[factura.id];
    const errorValidacion = validarFacturaParaAsiento(factura, mapeoId);

    if (errorValidacion) {
      if (!silencioso) alert(errorValidacion);
      return { ok: false, mensaje: errorValidacion };
    }

    const mapeo = mapeos.find((m) => String(m.id) === String(mapeoId));
    const parametroIva = buscarParametroIva(factura.tipo_libro);
    const referencia = referencias[factura.id] || "";

    const { detalle, totalDebe, totalHaber } = construirDetalleAsiento(
      factura,
      mapeo,
      parametroIva,
      referencia
    );

    const { data: asientoInsertado, error: errorAsiento } = await supabase
      .from("asientos_contables")
      .insert([
        {
          empresa_id: empresaId,
          facturacion_id: factura.id,
          fecha: factura.fecha,
          tipo: "ingreso",
          referencia,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: "generado",
        },
      ])
      .select()
      .single();

    if (errorAsiento) {
      console.error(errorAsiento);
      if (!silencioso) alert("No se pudo generar el encabezado del asiento.");
      return { ok: false, mensaje: errorAsiento.message };
    }

    const detalleConAsiento = detalle.map((linea) => ({
      ...linea,
      asiento_id: asientoInsertado.id,
    }));

    const { error: errorDetalle } = await supabase
      .from("asientos_contables_detalle")
      .insert(detalleConAsiento);

    if (errorDetalle) {
      console.error(errorDetalle);
      if (!silencioso) alert("Se creó el asiento, pero falló el detalle.");
      return { ok: false, mensaje: errorDetalle.message };
    }

    if (!silencioso) {
      await cargarDatos();
      await verDetalleAsiento(asientoInsertado.id);
      alert("Asiento generado correctamente.");
    }

    return { ok: true, mensaje: "Generado." };
  };

  const generarAsientosPeriodo = async () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return;
    }

    const facturasPendientes = facturasFiltradas.filter(
      (factura) => !idsFacturasConAsiento.has(Number(factura.id))
    );

    if (facturasPendientes.length === 0) {
      alert("No hay facturas pendientes visibles para generar.");
      return;
    }

    const sinMetodo = facturasPendientes.filter((f) => !seleccionCobro[f.id]);
    if (sinMetodo.length > 0) {
      alert(
        `Hay ${sinMetodo.length} factura(s) visible(s) sin método de cobro seleccionado.`
      );
      return;
    }

    if (
      !confirm(
        `¿Generar asientos para ${facturasPendientes.length} factura(s) visibles?`
      )
    ) {
      return;
    }

    setLoading(true);

    let generados = 0;
    let fallidos = 0;
    const errores = [];

    for (const factura of facturasPendientes) {
      const resultado = await generarAsiento(factura, true);
      if (resultado.ok) {
        generados += 1;
      } else {
        fallidos += 1;
        errores.push(`Factura ${factura.id}: ${resultado.mensaje}`);
      }
    }

    await cargarDatos();
    setLoading(false);

    alert(
      `Proceso finalizado.\nGenerados: ${generados}\nFallidos: ${fallidos}${
        errores.length > 0 ? "\n\nPrimeros errores:\n" + errores.slice(0, 5).join("\n") : ""
      }`
    );
  };

  const verDetalleAsiento = async (asientoId) => {
    const asiento = asientos.find((a) => Number(a.id) === Number(asientoId));

    const { data, error } = await supabase
      .from("asientos_contables_detalle")
      .select("*")
      .eq("asiento_id", asientoId)
      .order("id", { ascending: true });

    if (error) {
      console.error(error);
      alert("No se pudo cargar el detalle del asiento.");
      return;
    }

    setAsientoSeleccionado(asiento || { id: asientoId });
    setDetalleAsiento(data || []);
  };

  const eliminarAsiento = async (asientoId) => {
    if (!confirm("¿Eliminar este asiento contable?")) return;

    const { error } = await supabase
      .from("asientos_contables")
      .delete()
      .eq("id", asientoId)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar el asiento.");
      return;
    }

    setAsientoSeleccionado(null);
    setDetalleAsiento([]);
    cargarDatos();
  };

  const obtenerAsientoPorFactura = (facturaId) => {
    return asientos.find((a) => Number(a.facturacion_id) === Number(facturaId));
  };

  const abrirAsientoEnLibro = (facturaId) => {
    const asiento = obtenerAsientoPorFactura(facturaId);

    if (!asiento) {
      alert("No encontré el asiento de esta factura.");
      return;
    }

    navigate(`/libro-asientos?asiento=${asiento.id}`);
  };

  const eliminarAsientoFactura = async (facturaId) => {
    const asiento = obtenerAsientoPorFactura(facturaId);

    if (!asiento) {
      alert("No encontré el asiento de esta factura.");
      return;
    }

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

    await cargarDatos();
  };

  const cargarTodosLosDetallesExportacion = async () => {
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

      if (bloque.length < pageSize) {
        seguir = false;
      } else {
        desdeRango += pageSize;
      }
    }

    return todos;
  };

  const exportarAsientosExcel = async () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return;
    }

    setLoading(true);

    const detalles = await cargarTodosLosDetallesExportacion();

    setLoading(false);

    if (detalles.length === 0) {
      alert("No hay asientos generados para exportar en el rango seleccionado.");
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
      header: ["Fecha", "Cod", "Nombre", "Descripcion", "Debe", "Haber", "Referencia"],
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

    const nombreArchivo = `Asientos_${nombreEmpresa}_${desde || "inicio"}_${hasta || "fin"}.xlsx`;

    XLSX.writeFile(wb, nombreArchivo);
  };

  const limpiarFiltros = () => {
    setDesde("");
    setHasta("");
    setFiltro("");
    setSoloPendientes(true);
  };

  const texto = normalizarTexto(filtro);

  const facturasFiltradas = facturas.filter((factura) => {
    if (soloPendientes && idsFacturasConAsiento.has(Number(factura.id))) {
      return false;
    }

    if (!texto) return true;

    const busqueda = normalizarTexto(
      [
        factura.fecha,
        factura.tipo_libro,
        factura.numdoc,
        factura.numdocal,
        factura.numresol,
        factura.nombre,
        factura.nitprov,
        factura.totalvent,
      ].join(" ")
    );

    return busqueda.includes(texto);
  });

  const totalDebeDetalle = detalleAsiento.reduce(
    (acc, item) => acc + Number(item.debe || 0),
    0
  );

  const totalHaberDetalle = detalleAsiento.reduce(
    (acc, item) => acc + Number(item.haber || 0),
    0
  );

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">📘 Asientos Contables</h1>
            <p className="subtitle">
              Genera asientos por factura con contabilidad analítica
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
              onClick={() => navigate("/clasificacion-facturacion")}
            >
              🏷️ Clasificación
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={() => navigate("/mapeo-cobros-contables")}
            >
              💳 Mapeo cobros
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={() => navigate("/libro-asientos")}
            >
              📚 Libro de asientos
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={cargarDatos}
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
              Debes seleccionar una empresa antes de generar asientos.
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
                placeholder="Cliente, documento, código generación..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                disabled={!empresaId}
              />
            </div>

            <div style={{ display: "flex", alignItems: "end" }}>
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={soloPendientes}
                  onChange={(e) => setSoloPendientes(e.target.checked)}
                  disabled={!empresaId}
                />
                Solo facturas sin asiento
              </label>
            </div>
          </div>

          <div className="actions" style={{ marginTop: "14px" }}>
            <button
              className="btn btn-primary"
              style={thinButtonStyle}
              onClick={generarAsientosPeriodo}
              disabled={!empresaId || loading}
            >
              ⚙️ Generar asientos visibles
            </button>

            <button
              className="btn btn-success"
              style={thinButtonStyle}
              onClick={exportarAsientosExcel}
              disabled={!empresaId || loading}
            >
              📤 Exportar asientos Excel
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

        <div className="card" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0 }}>Facturas para contabilizar</h3>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Documento</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Método cobro</th>
                  <th>Referencia</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>

              <tbody>
                {facturasFiltradas.length > 0 ? (
                  facturasFiltradas.map((factura) => {
                    const tieneAsiento = idsFacturasConAsiento.has(Number(factura.id));

                    return (
                      <tr key={factura.id}>
                        <td>{factura.fecha}</td>
                        <td>{factura.tipo_libro}</td>
                        <td>{factura.numdoc || factura.numdocal || factura.numresol || "-"}</td>
                        <td>{factura.nombre || "-"}</td>
                        <td>${Number(factura.totalvent || 0).toFixed(2)}</td>
                        <td>
                          <select
                            className="select"
                            style={thinInputStyle}
                            value={seleccionCobro[factura.id] || ""}
                            onChange={(e) =>
                              setSeleccionCobro({
                                ...seleccionCobro,
                                [factura.id]: e.target.value,
                              })
                            }
                            disabled={tieneAsiento}
                          >
                            <option value="">Seleccionar</option>
                            {mapeos.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.metodo_cobro} • {m.parametros_contables?.cuenta_contable || "Sin cuenta"}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="input"
                            style={thinInputStyle}
                            placeholder="Opcional"
                            value={referencias[factura.id] || ""}
                            onChange={(e) =>
                              setReferencias({
                                ...referencias,
                                [factura.id]: e.target.value,
                              })
                            }
                            disabled={tieneAsiento}
                          />
                        </td>
                        <td>
                          <span className="badge">
                            {tieneAsiento ? "Contabilizada" : "Pendiente"}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            {tieneAsiento ? (
                              <>
                                <button
                                  className="btn btn-primary"
                                  style={thinButtonStyle}
                                  onClick={() => abrirAsientoEnLibro(factura.id)}
                                >
                                  Ver / Editar
                                </button>

                                <button
                                  className="btn btn-secondary"
                                  style={thinButtonStyle}
                                  onClick={() => eliminarAsientoFactura(factura.id)}
                                  disabled={loading}
                                >
                                  Eliminar
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn btn-primary"
                                style={thinButtonStyle}
                                onClick={() => generarAsiento(factura)}
                                disabled={loading}
                              >
                                Generar asiento
                              </button>
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
                      No hay facturas para mostrar
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && (
            <p style={{ marginTop: "12px", color: "#64748b" }}>
              Procesando...
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
