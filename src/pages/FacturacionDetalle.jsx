import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function FacturacionDetalle() {
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [empresaActual, setEmpresaActual] = useState(null);
  const [clasificaciones, setClasificaciones] = useState([]);

  const [clasificacionImportCF, setClasificacionImportCF] = useState("");
  const [clasificacionImportCCF, setClasificacionImportCCF] = useState("");
  const [clasificacionImportJSON, setClasificacionImportJSON] = useState("");
  const [reglasContables, setReglasContables] = useState([]);

  const [form, setForm] = useState({
    tipo_libro: "CF",
    fecha: "",
    documento: "",
    nombre: "",
    total: "",
    clasificacion_ingreso_id: "",
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

  const normalizarClave = (obj) => {
    const nuevo = {};
    Object.keys(obj || {}).forEach((key) => {
      const limpia = String(key).replace(/\s+/g, "").toUpperCase();
      nuevo[limpia] = obj[key];
    });
    return nuevo;
  };

  const convertirFecha = (valor) => {
    if (!valor) return null;

    if (typeof valor === "number") {
      const fecha = XLSX.SSF.parse_date_code(valor);
      if (!fecha) return null;

      const y = fecha.y;
      const m = String(fecha.m).padStart(2, "0");
      const d = String(fecha.d).padStart(2, "0");

      return `${y}-${m}-${d}`;
    }

    const texto = String(valor).trim();
    if (!texto) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      return texto;
    }

    const match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      let [, dd, mm, yy] = match;

      let year = Number(yy);
      if (yy.length === 2) {
        year = year >= 50 ? 1900 + year : 2000 + year;
      }

      return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(
        2,
        "0"
      )}`;
    }

    return null;
  };

  const numeroSeguro = (valor) => {
    if (valor === null || valor === undefined || valor === "") return 0;

    const limpio = String(valor)
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .trim();

    const n = parseFloat(limpio);
    return isNaN(n) ? 0 : n;
  };

  const validarEmpresaSeleccionada = () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return false;
    }
    return true;
  };

  const redondear = (valor) => {
    return Math.round(Number(valor || 0) * 100) / 100;
  };

  const obtenerIvaDte = (dte) => {
    const tipoDte = dte?.identificacion?.tipoDte;

    if (tipoDte === "01") {
      return redondear(dte?.resumen?.totalIva || 0);
    }

    const tributos = dte?.resumen?.tributos || [];
    const iva = tributos.find((t) => String(t.codigo) === "20");

    return redondear(iva?.valor || 0);
  };

  const obtenerDocumentoReceptor = (dte) => {
    return (
      dte?.receptor?.nit ||
      dte?.receptor?.numDocumento ||
      dte?.receptor?.nrc ||
      null
    );
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

const clasificarItem = ({
  descripcion = "",
  nombre = "",
  nit = "",
  codigo = "",
} = {}) => {
  for (const regla of reglasContables) {
    let textoCampo = "";

    if (regla.campo === "descripcion") textoCampo = descripcion;
    if (regla.campo === "nombre") textoCampo = nombre;
    if (regla.campo === "nit") textoCampo = nit;
    if (regla.campo === "codigo") textoCampo = codigo;

    if (cumpleRegla(textoCampo, regla.operador, regla.valor)) {
      return {
        etiqueta: regla.etiquetas_contables?.nombre || "Sin etiqueta",
        cuenta_contable: regla.cuenta_contable || null,
      };
    }
  }

  return {
    etiqueta: "Pendiente de clasificar",
    cuenta_contable: null,
  };
};

  // ✅ ESTA VA PRIMERO
const cargarReglasContables = async () => {
  if (!empresaId) {
    setReglasContables([]);
    return;
  }

  const { data, error } = await supabase
    .from("reglas_contables")
    .select("*, etiquetas_contables(nombre)")
    .eq("empresa_id", empresaId)
    .eq("tipo", "ingreso")
    .eq("activo", true)
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    setReglasContables([]);
    return;
  }

  setReglasContables(data || []);
};

// ✅ ESTA DESPUÉS
const cargarClasificaciones = async () => {
  if (!empresaId) {
    setClasificaciones([]);
    return;
  }

  const { data, error } = await supabase
    .from("clasificaciones_ingresos")
    .select("id, nombre, modo_reporte, activo")
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  setClasificaciones(data || []);
};

  const cargarDatos = async () => {
    if (!empresaId) {
      setData([]);
      return;
    }

    let query = supabase
      .from("facturacion_detalle")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false })
      .order("id", { ascending: false });

    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);

    const { data, error } = await query;

    if (error) {
      console.error(error);
      alert("No se pudieron cargar los datos");
      return;
    }

    setData(data || []);
  };

  useEffect(() => {
  cargarDatos();
  cargarClasificaciones();
  cargarReglasContables();
}, [empresaId, desde, hasta]);

  const obtenerClasificacion = (id) => {
    return clasificaciones.find((c) => String(c.id) === String(id)) || null;
  };

  const insertarItemsGlobalesDesdeFacturas = async (facturasInsertadas) => {
    const items = (facturasInsertadas || []).map((factura) => {
     const clasificacion = clasificarItem({
  descripcion: factura.clasificacion_ingreso_nombre || "Ingreso global",
  nombre: factura.nombre || "",
  nit: factura.nitprov || "",
  codigo: "",
});

      return {
        empresa_id: factura.empresa_id,
        facturacion_id: factura.id,
        descripcion: "Ingreso global",
        cantidad: 1,
        precio_unitario: Number(factura.totalvent || 0),
        venta_gravada: Number(factura.vgravadas || 0),
        venta_exenta: Number(factura.vexentas || 0),
        venta_no_sujeta: 0,
        iva: Number(factura.debitofis || 0),
        total: Number(factura.totalvent || 0),
        etiqueta: factura.clasificacion_ingreso_nombre || clasificacion.etiqueta,
        cuenta_contable: clasificacion.cuenta_contable,
      };
    });

    if (items.length > 0) {
      const { error } = await supabase.from("facturacion_items").insert(items);

      if (error) {
        console.error(error);
        alert("La factura se importó, pero no se pudieron guardar los items.");
      }
    }
  };

  const handleImport = async (e, tipo) => {
    if (!validarEmpresaSeleccionada()) {
      e.target.value = "";
      return;
    }

    const clasificacionSeleccionada =
      tipo === "CF" ? clasificacionImportCF : clasificacionImportCCF;

    if (!clasificacionSeleccionada) {
      alert("Primero selecciona la clasificación de ingreso para este archivo.");
      e.target.value = "";
      return;
    }

    const clasificacionObj = obtenerClasificacion(clasificacionSeleccionada);
    if (!clasificacionObj) {
      alert("La clasificación seleccionada no es válida.");
      e.target.value = "";
      return;
    }

    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const json = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
          raw: false,
        });

        const filasNormalizadas = json.map(normalizarClave);

        const datosProcesados = filasNormalizadas
          .map((row) => {
            const fecha = convertirFecha(row.FECHA || row.FECHADOC);
            if (!fecha) return null;

            if (tipo === "CF") {
              return {
                empresa_id: empresaId,
                tipo_libro: "CF",
                fecha,
                clasedoc: row.CLASEDOC || null,
                tipodocum: row.TIPODOCUM || null,
                numresol: row.NUMRESOL || null,
                numserie: row.NUMSERIE || null,
                numdocal: row.NUMDOCAL || null,
                numdoc: null,
                nitprov: null,
                nombre: null,
                vexentas: numeroSeguro(row.VEXENTAS),
                vgravadas: numeroSeguro(row.VGRAVADAS),
                debitofis: 0,
                debitoter: 0,
                totalvent: numeroSeguro(row.TOTALVENT),
                clasificacion_ingreso_id: Number(clasificacionObj.id),
                clasificacion_ingreso_nombre: clasificacionObj.nombre,
              };
            }

            return {
              empresa_id: empresaId,
              tipo_libro: "CCF",
              fecha,
              clasedoc: row.CLASEDOC || null,
              tipodocum: row.TIPODOCUM || null,
              numresol: row.NUMRESOL || null,
              numserie: row.NUMSERIE || null,
              numdocal: null,
              numdoc: row.NUMDOC || null,
              nitprov: row.NITPROV || null,
              nombre: row.NOMBRE || null,
              vexentas: numeroSeguro(row.VEXENTAS),
              vgravadas: numeroSeguro(row.VGRAVADAS),
              debitofis: numeroSeguro(row.DEBITOFIS),
              debitoter: numeroSeguro(row.DEBITOTER),
              totalvent: numeroSeguro(row.TOTALVENT),
              clasificacion_ingreso_id: Number(clasificacionObj.id),
              clasificacion_ingreso_nombre: clasificacionObj.nombre,
            };
          })
          .filter((item) => item && item.fecha);

        if (datosProcesados.length === 0) {
          alert("No se encontró ninguna fila válida con fecha en el archivo.");
          return;
        }

        const { data: insertados, error } = await supabase
          .from("facturacion_detalle")
          .insert(datosProcesados)
          .select();

        if (error) {
          console.error(error);
          alert(`Error al importar: ${error.message}`);
          return;
        }

        await insertarItemsGlobalesDesdeFacturas(insertados || []);
        await cargarDatos();

        alert(`Se importaron ${datosProcesados.length} registros correctamente.`);
      } catch (error) {
        console.error(error);
        alert("Error al importar el archivo");
      } finally {
        setLoading(false);
        e.target.value = "";
      }
    };

    reader.readAsBinaryString(file);
  };

  const procesarDteJson = (dte, clasificacionObj) => {
    const tipoDte = dte?.identificacion?.tipoDte;
    const tipoLibro = tipoDte === "03" ? "CCF" : "CF";

    const fecha = dte?.identificacion?.fecEmi || null;
    const numeroControl = dte?.identificacion?.numeroControl || null;
    const codigoGeneracion = dte?.identificacion?.codigoGeneracion || null;

    const receptor = dte?.receptor || {};
    const resumen = dte?.resumen || {};

    const totalGravada = redondear(resumen.totalGravada || 0);
    const totalExenta = redondear(resumen.totalExenta || 0);
    const totalNoSuj = redondear(resumen.totalNoSuj || 0);
    const iva = obtenerIvaDte(dte);
    const totalPagar = redondear(
      resumen.totalPagar ||
        resumen.montoTotalOperacion ||
        totalGravada + totalExenta + totalNoSuj + iva
    );

    if (!fecha || !numeroControl) {
      throw new Error("El JSON no tiene fecha o número de control válido.");
    }

    const factura = {
      empresa_id: empresaId,
      tipo_libro: tipoLibro,
      fecha,
      clasedoc: null,
      tipodocum: tipoDte,
      numresol: codigoGeneracion,
      numserie: null,
      numdocal: tipoLibro === "CF" ? codigoGeneracion : null,
      numdoc: tipoLibro === "CCF" ? codigoGeneracion : null,
      nitprov: obtenerDocumentoReceptor(dte),
      nombre: receptor.nombre || null,
      vexentas: totalExenta,
      vgravadas: totalGravada,
      debitofis: iva,
      debitoter: 0,
      totalvent: totalPagar,
      clasificacion_ingreso_id: Number(clasificacionObj.id),
      clasificacion_ingreso_nombre: clasificacionObj.nombre,
    };

    const items = (dte?.cuerpoDocumento || []).map((item) => {
      const clasificacionItem = clasificarItem({
  descripcion: item.descripcion || "",
  nombre: receptor.nombre || "",
  nit: obtenerDocumentoReceptor(dte) || "",
  codigo: item.codigo || "",
});

      const ventaGravada = redondear(item.ventaGravada || 0);
      const ventaExenta = redondear(item.ventaExenta || 0);
      const ventaNoSujeta = redondear(item.ventaNoSuj || 0);

      const ivaItem =
        tipoLibro === "CF"
          ? redondear(item.ivaItem || 0)
          : redondear(ventaGravada * 0.13);

      const totalItem =
        tipoLibro === "CF"
          ? redondear(ventaGravada + ventaExenta + ventaNoSujeta)
          : redondear(ventaGravada + ventaExenta + ventaNoSujeta + ivaItem);

      return {
        empresa_id: empresaId,
        descripcion: item.descripcion || "Sin descripción",
        cantidad: Number(item.cantidad || 0),
        precio_unitario: Number(item.precioUni || 0),
        venta_gravada: ventaGravada,
        venta_exenta: ventaExenta,
        venta_no_sujeta: ventaNoSujeta,
        iva: ivaItem,
        total: totalItem,
        etiqueta: clasificacionItem.etiqueta,
        cuenta_contable: clasificacionItem.cuenta_contable,
      };
    });

    return { factura, items };
  };

  const handleImportJson = async (e) => {
    if (!validarEmpresaSeleccionada()) {
      e.target.value = "";
      return;
    }

    if (!clasificacionImportJSON) {
      alert("Primero selecciona la clasificación de ingreso para los JSON.");
      e.target.value = "";
      return;
    }

    const clasificacionObj = obtenerClasificacion(clasificacionImportJSON);
    if (!clasificacionObj) {
      alert("La clasificación seleccionada no es válida.");
      e.target.value = "";
      return;
    }

    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setLoading(true);

    try {
      let facturasImportadas = 0;
      let itemsImportados = 0;

      for (const file of files) {
        const texto = await file.text();
        const dte = JSON.parse(texto);

        const { factura, items } = procesarDteJson(dte, clasificacionObj);

        const { data: facturaInsertada, error: errorFactura } = await supabase
          .from("facturacion_detalle")
          .insert([factura])
          .select()
          .single();

        if (errorFactura) {
          console.error(errorFactura);
          alert(`Error importando ${file.name}: ${errorFactura.message}`);
          continue;
        }

        facturasImportadas += 1;

        const itemsConFactura = items.map((item) => ({
          ...item,
          empresa_id: empresaId,
          facturacion_id: facturaInsertada.id,
        }));

        if (itemsConFactura.length > 0) {
          const { error: errorItems } = await supabase
            .from("facturacion_items")
            .insert(itemsConFactura);

          if (errorItems) {
            console.error(errorItems);
            alert(
              `La factura ${file.name} se importó, pero falló el detalle de productos.`
            );
          } else {
            itemsImportados += itemsConFactura.length;
          }
        }
      }

      await cargarDatos();

      alert(
        `Importación JSON finalizada.\nFacturas: ${facturasImportadas}\nItems: ${itemsImportados}`
      );
    } catch (error) {
      console.error(error);
      alert("Error leyendo JSON DTE. Revisa que el archivo sea válido.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const limpiarFormulario = () => {
    setForm({
      tipo_libro: "CF",
      fecha: "",
      documento: "",
      nombre: "",
      total: "",
      clasificacion_ingreso_id: "",
    });
    setEditandoId(null);
  };

  const abrirNuevo = () => {
    if (!validarEmpresaSeleccionada()) return;
    limpiarFormulario();
    setMostrarForm(true);
  };

  const guardarManual = async () => {
    if (!validarEmpresaSeleccionada()) return;

    if (!form.fecha || !form.total || !form.clasificacion_ingreso_id) {
      alert("Completa los campos obligatorios");
      return;
    }

    const clasificacionObj = obtenerClasificacion(form.clasificacion_ingreso_id);
    if (!clasificacionObj) {
      alert("Selecciona una clasificación válida.");
      return;
    }

    const nuevo = {
      empresa_id: empresaId,
      tipo_libro: form.tipo_libro,
      fecha: form.fecha,
      totalvent: parseFloat(form.total || 0),
      nombre: form.nombre || null,
      numdoc: form.tipo_libro === "CCF" ? form.documento || null : null,
      numdocal: form.tipo_libro === "CF" ? form.documento || null : null,
      clasificacion_ingreso_id: Number(clasificacionObj.id),
      clasificacion_ingreso_nombre: clasificacionObj.nombre,
    };

    const { data: insertado, error } = await supabase
      .from("facturacion_detalle")
      .insert([nuevo])
      .select()
      .single();

    if (error) {
      console.error(error);
      alert("No se pudo guardar el registro");
      return;
    }

    await insertarItemsGlobalesDesdeFacturas([insertado]);

    setMostrarForm(false);
    limpiarFormulario();
    cargarDatos();
  };

  const iniciarEdicion = (row) => {
    setEditandoId(row.id);
    setForm({
      tipo_libro: row.tipo_libro || "CF",
      fecha: row.fecha || "",
      documento: row.numdoc || row.numdocal || "",
      nombre: row.nombre || "",
      total: row.totalvent ?? "",
      clasificacion_ingreso_id: row.clasificacion_ingreso_id
        ? String(row.clasificacion_ingreso_id)
        : "",
    });
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const guardarEdicion = async () => {
    if (!validarEmpresaSeleccionada()) return;
    if (!editandoId) return;

    if (!form.fecha || !form.total || !form.clasificacion_ingreso_id) {
      alert("Completa los campos obligatorios");
      return;
    }

    const clasificacionObj = obtenerClasificacion(form.clasificacion_ingreso_id);
    if (!clasificacionObj) {
      alert("Selecciona una clasificación válida.");
      return;
    }

    const actualizado = {
      empresa_id: empresaId,
      tipo_libro: form.tipo_libro,
      fecha: form.fecha,
      nombre: form.nombre || null,
      totalvent: parseFloat(form.total || 0),
      numdoc: form.tipo_libro === "CCF" ? form.documento || null : null,
      numdocal: form.tipo_libro === "CF" ? form.documento || null : null,
      clasificacion_ingreso_id: Number(clasificacionObj.id),
      clasificacion_ingreso_nombre: clasificacionObj.nombre,
    };

    const { error } = await supabase
      .from("facturacion_detalle")
      .update(actualizado)
      .eq("id", editandoId)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo guardar la edición");
      return;
    }

    setMostrarForm(false);
    limpiarFormulario();
    cargarDatos();
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

    cargarDatos();
  };

  const cancelarFormulario = () => {
    setMostrarForm(false);
    limpiarFormulario();
  };

  const limpiarFiltros = () => {
    setDesde("");
    setHasta("");
    setFiltro("");
  };

  const texto = filtro.trim().toLowerCase();

  const dataFiltrada = data.filter((d) => {
    if (!texto) return true;

    return (
      (d.nombre || "").toLowerCase().includes(texto) ||
      String(d.numdoc || "").toLowerCase().includes(texto) ||
      String(d.numdocal || "").toLowerCase().includes(texto) ||
      String(d.tipo_libro || "").toLowerCase().includes(texto) ||
      String(d.fecha || "").toLowerCase().includes(texto) ||
      String(d.clasificacion_ingreso_nombre || "")
        .toLowerCase()
        .includes(texto)
    );
  });

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">📊 Facturación</h1>
            <p className="subtitle">
              Gestión de libros de ventas CF, CCF y JSON DTE
              {empresaActual
                ? ` • ${empresaActual.nombre}`
                : " • Sin empresa seleccionada"}
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
              onClick={() => navigate("/resumen")}
            >
              💰 Resumen
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={() => navigate("/clasificaciones-ingresos")}
            >
              🏷️ Clasificaciones
            </button>

            <button
              className="btn btn-primary"
              style={{
                ...thinButtonStyle,
                opacity: empresaId ? 1 : 0.5,
              }}
              onClick={abrirNuevo}
              disabled={!empresaId}
            >
              ➕ Agregar
            </button>
          </div>
        </div>

        {!empresaId && (
          <div
            className="card"
            style={{ marginBottom: "20px", border: "1px solid #fecaca" }}
          >
            <p style={{ margin: 0, color: "#991b1b", fontWeight: 600 }}>
              Debes seleccionar una empresa antes de importar, agregar o editar
              registros.
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

            <div>
              <label className="label">Buscar</label>
              <input
                type="text"
                placeholder="Nombre, documento, tipo, fecha o clasificación..."
                className="input"
                style={thinInputStyle}
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                disabled={!empresaId}
              />
            </div>
          </div>

          <div className="actions" style={{ marginTop: "14px" }}>
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
          <h3 style={{ marginTop: 0, marginBottom: "14px" }}>
            Importación por clasificación
          </h3>

          <div className="grid grid-3">
            <div className="card" style={{ marginBottom: 0 }}>
              <h4 style={{ marginTop: 0 }}>Importar CF Excel</h4>

              <div className="grid">
                <div>
                  <label className="label">
                    Clasificación de ingreso para este archivo
                  </label>
                  <select
                    className="select"
                    style={thinInputStyle}
                    value={clasificacionImportCF}
                    onChange={(e) => setClasificacionImportCF(e.target.value)}
                    disabled={!empresaId}
                  >
                    <option value="">Seleccionar clasificación</option>
                    {clasificaciones.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre} • {item.modo_reporte}
                      </option>
                    ))}
                  </select>
                </div>

                <label
                  className="btn btn-primary"
                  style={{
                    ...thinButtonStyle,
                    opacity: empresaId ? 1 : 0.5,
                    pointerEvents: empresaId ? "auto" : "none",
                  }}
                >
                  Importar archivo CF
                  <input
                    type="file"
                    hidden
                    accept=".xlsx,.xls"
                    onChange={(e) => handleImport(e, "CF")}
                  />
                </label>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <h4 style={{ marginTop: 0 }}>Importar CCF Excel</h4>

              <div className="grid">
                <div>
                  <label className="label">
                    Clasificación de ingreso para este archivo
                  </label>
                  <select
                    className="select"
                    style={thinInputStyle}
                    value={clasificacionImportCCF}
                    onChange={(e) => setClasificacionImportCCF(e.target.value)}
                    disabled={!empresaId}
                  >
                    <option value="">Seleccionar clasificación</option>
                    {clasificaciones.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre} • {item.modo_reporte}
                      </option>
                    ))}
                  </select>
                </div>

                <label
                  className="btn btn-success"
                  style={{
                    ...thinButtonStyle,
                    opacity: empresaId ? 1 : 0.5,
                    pointerEvents: empresaId ? "auto" : "none",
                  }}
                >
                  Importar archivo CCF
                  <input
                    type="file"
                    hidden
                    accept=".xlsx,.xls"
                    onChange={(e) => handleImport(e, "CCF")}
                  />
                </label>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <h4 style={{ marginTop: 0 }}>Importar JSON DTE</h4>

              <div className="grid">
                <div>
                  <label className="label">
                    Clasificación general para estos JSON
                  </label>
                  <select
                    className="select"
                    style={thinInputStyle}
                    value={clasificacionImportJSON}
                    onChange={(e) => setClasificacionImportJSON(e.target.value)}
                    disabled={!empresaId}
                  >
                    <option value="">Seleccionar clasificación</option>
                    {clasificaciones.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre} • {item.modo_reporte}
                      </option>
                    ))}
                  </select>
                </div>

                <label
                  className="btn btn-primary"
                  style={{
                    ...thinButtonStyle,
                    opacity: empresaId ? 1 : 0.5,
                    pointerEvents: empresaId ? "auto" : "none",
                    background: "#7c3aed",
                  }}
                >
                  Importar JSON DTE
                  <input
                    type="file"
                    hidden
                    multiple
                    accept=".json,application/json"
                    onChange={handleImportJson}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {mostrarForm && (
          <div className="card" style={{ marginBottom: "20px" }}>
            <div style={{ marginBottom: "14px" }}>
              <h3 style={{ margin: 0 }}>
                {editandoId ? "Editar factura" : "Agregar factura"}
              </h3>
            </div>

            <div className="grid grid-3">
              <div>
                <label className="label">Tipo</label>
                <select
                  className="select"
                  style={thinInputStyle}
                  value={form.tipo_libro}
                  onChange={(e) =>
                    setForm({ ...form, tipo_libro: e.target.value })
                  }
                >
                  <option value="CF">Consumidor Final</option>
                  <option value="CCF">Contribuyente</option>
                </select>
              </div>

              <div>
                <label className="label">Fecha</label>
                <input
                  type="date"
                  className="input"
                  style={thinInputStyle}
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Documento</label>
                <input
                  className="input"
                  style={thinInputStyle}
                  value={form.documento}
                  onChange={(e) =>
                    setForm({ ...form, documento: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="label">Nombre</label>
                <input
                  className="input"
                  style={thinInputStyle}
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Total</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  style={thinInputStyle}
                  value={form.total}
                  onChange={(e) => setForm({ ...form, total: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Clasificación de ingreso</label>
                <select
                  className="select"
                  style={thinInputStyle}
                  value={form.clasificacion_ingreso_id}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      clasificacion_ingreso_id: e.target.value,
                    })
                  }
                >
                  <option value="">Seleccionar clasificación</option>
                  {clasificaciones.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre} • {item.modo_reporte}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="actions" style={{ marginTop: "15px" }}>
              {editandoId ? (
                <button
                  className="btn btn-success"
                  style={thinButtonStyle}
                  onClick={guardarEdicion}
                >
                  Guardar cambios
                </button>
              ) : (
                <button
                  className="btn btn-success"
                  style={thinButtonStyle}
                  onClick={guardarManual}
                >
                  Guardar
                </button>
              )}

              <button
                className="btn btn-secondary"
                style={thinButtonStyle}
                onClick={cancelarFormulario}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Documento</th>
                  <th>Nombre</th>
                  <th>Clasificación</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {empresaId ? (
                  dataFiltrada.length > 0 ? (
                    dataFiltrada.map((row) => (
                      <tr key={row.id}>
                        <td>{row.fecha}</td>
                        <td>
                          <span className="badge">{row.tipo_libro}</span>
                        </td>
                        <td>{row.numdoc || row.numdocal}</td>
                        <td>{row.nombre || "-"}</td>
                        <td>{row.clasificacion_ingreso_nombre || "-"}</td>
                        <td>${Number(row.totalvent).toFixed(2)}</td>
                        <td>
                          <div className="actions">
                            <button
                              onClick={() => iniciarEdicion(row)}
                              className="btn btn-primary"
                              style={thinButtonStyle}
                            >
                              Editar
                            </button>

                            <button
                              onClick={() => eliminar(row.id)}
                              className="btn btn-secondary"
                              style={thinButtonStyle}
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
                        colSpan="7"
                        style={{ textAlign: "center", color: "#64748b" }}
                      >
                        No hay registros para mostrar
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td
                      colSpan="7"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      Selecciona una empresa para ver los datos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {loading && (
          <p style={{ marginTop: "12px", color: "#64748b" }}>
            Procesando archivo...
          </p>
        )}
      </div>
    </div>
  );
}