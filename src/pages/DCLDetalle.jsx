import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient";

const hoy = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const inicioMes = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
};

const dinero = (n) => Number(n || 0).toFixed(2);

const normalizarClave = (obj) => {
  const nuevo = {};
  Object.keys(obj || {}).forEach((key) => {
    const limpia = String(key).trim().toUpperCase().replace(/\s+/g, "_");
    nuevo[limpia] = obj[key];
  });
  return nuevo;
};

const numeroSeguro = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const limpio = String(v).replace(/\$/g, "").replace(/,/g, "").trim();
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
};

const inferirBanco = (emisor = "") => {
  const t = String(emisor || "").toLowerCase();
  if (t.includes("credomatic") || t.includes("bac")) return "BAC";
  if (t.includes("serfinsa")) return "SERFINSA";
  return "OTRO";
};


const deduplicarDCLPorId = (lista = []) => {
  const mapa = new Map();

  lista.forEach((item) => {
    const id = Number(item.id);
    if (!id) return;

    if (!mapa.has(id)) {
      mapa.set(id, item);
      return;
    }

    const anterior = mapa.get(id);

    mapa.set(id, {
      ...anterior,
      ...item,
      conciliado: Boolean(anterior.conciliado || item.conciliado),
      valor_operaciones:
        Number(item.valor_operaciones || 0) > 0
          ? item.valor_operaciones
          : anterior.valor_operaciones,
      liquido_pagar:
        Number(item.liquido_pagar || 0) > 0
          ? item.liquido_pagar
          : anterior.liquido_pagar,
      comision:
        Number(item.comision || 0) > 0 ? item.comision : anterior.comision,
      iva_comision:
        Number(item.iva_comision || 0) > 0
          ? item.iva_comision
          : anterior.iva_comision,
      iva_percibido:
        Number(item.iva_percibido || 0) > 0
          ? item.iva_percibido
          : anterior.iva_percibido,
    });
  });

  return Array.from(mapa.values());
};

const parsearJsonDCL = (json, empresaId, archivoNombre = "") => {
  const id = json?.identificacion || {};
  const emisor = json?.emisor || {};
  const receptor = json?.receptor || {};
  const cuerpo = json?.cuerpoDocumento || {};

  return {
    empresa_id: Number(empresaId),
    fecha_emision: id.fecEmi || null,
    emisor_nombre: emisor.nombre || emisor.nombreComercial || null,
    emisor_nit: emisor.nit || null,
    receptor_nombre: receptor.nombre || receptor.nombreComercial || null,
    receptor_nit: receptor.nit || null,
    numero_control: id.numeroControl || null,
    codigo_generacion: id.codigoGeneracion || null,
    tipo_dte: id.tipoDte || "09",
    valor_operaciones: numeroSeguro(cuerpo.valorOperaciones),
    sub_total: numeroSeguro(cuerpo.subTotal),
    iva_operacion: numeroSeguro(cuerpo.iva),
    monto_sujeto_percepcion: numeroSeguro(cuerpo.montoSujetoPercepcion),
    iva_percibido: numeroSeguro(cuerpo.ivaPercibido),
    comision: numeroSeguro(cuerpo.comision),
    porcent_comision: numeroSeguro(cuerpo.porcentComision),
    iva_comision: numeroSeguro(cuerpo.ivaComision),
    liquido_pagar: numeroSeguro(cuerpo.liquidoApagar),
    cod_liquidacion: cuerpo.codLiquidacion || null,
    cantidad_doc: parseInt(cuerpo.cantidadDoc || 0, 10) || 0,
    observaciones: cuerpo.observaciones || null,
    banco_sugerido: inferirBanco(emisor.nombre || emisor.nombreComercial || ""),
    fuente: "json",
    archivo_nombre: archivoNombre || null,
    json_completo: json,
  };
};

export default function DCLDetalle() {
  const navigate = useNavigate();

  const [empresaId, setEmpresaId] = useState("");
  const [empresas, setEmpresas] = useState([]);
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [filtro, setFiltro] = useState("");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  const [form, setForm] = useState({
    fecha_emision: hoy(),
    emisor_nombre: "",
    numero_control: "",
    codigo_generacion: "",
    valor_operaciones: "",
    comision: "",
    iva_comision: "",
    iva_percibido: "",
    liquido_pagar: "",
    observaciones: "",
    banco_sugerido: "OTRO",
  });

  useEffect(() => {
    cargarEmpresas();
    cargarEmpresaSeleccionada();
  }, []);

  useEffect(() => {
    if (empresaId) cargarDatos();
    else setData([]);
  }, [empresaId, desde, hasta]);

  const cargarEmpresas = async () => {
    const { data, error } = await supabase
      .from("empresas")
      .select("id, nombre")
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setEmpresas(data || []);
  };

  const cargarEmpresaSeleccionada = () => {
    const empresaGuardada = localStorage.getItem("empresaSeleccionada");
    if (!empresaGuardada) return;

    try {
      const empresaObj = JSON.parse(empresaGuardada);
      if (empresaObj?.id) setEmpresaId(String(empresaObj.id));
    } catch (e) {
      console.error(e);
    }
  };

  const cargarDatos = async () => {
    setLoading(true);

    try {
      let query = supabase
        .from("vw_dcl_resumen")
        .select("*")
        .eq("empresa_id", Number(empresaId))
        .order("fecha_emision", { ascending: false })
        .order("id", { ascending: false });

      if (desde) query = query.gte("fecha_emision", desde);
      if (hasta) query = query.lte("fecha_emision", hasta);

      const { data, error } = await query;
      if (error) throw error;

      setData(deduplicarDCLPorId(data || []));
    } catch (error) {
      console.error(error);
      alert(`Error cargando DCL: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const guardarManual = async () => {
    if (!empresaId) {
      alert("Seleccioná empresa.");
      return;
    }

    if (!form.fecha_emision || !form.valor_operaciones || !form.liquido_pagar) {
      alert("Completá fecha, valor operaciones y líquido a pagar.");
      return;
    }

    setGuardando(true);

    try {
      const payload = {
        empresa_id: Number(empresaId),
        fecha_emision: form.fecha_emision,
        emisor_nombre: form.emisor_nombre || null,
        numero_control: form.numero_control || null,
        codigo_generacion: form.codigo_generacion || null,
        valor_operaciones: numeroSeguro(form.valor_operaciones),
        comision: numeroSeguro(form.comision),
        iva_comision: numeroSeguro(form.iva_comision),
        iva_percibido: numeroSeguro(form.iva_percibido),
        liquido_pagar: numeroSeguro(form.liquido_pagar),
        observaciones: form.observaciones || null,
        banco_sugerido: form.banco_sugerido || "OTRO",
        fuente: "manual",
      };

      if (editandoId) {
        const { error } = await supabase
          .from("dcl_documentos")
          .update(payload)
          .eq("id", editandoId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dcl_documentos")
          .insert([payload]);

        if (error) throw error;
      }

      alert(editandoId ? "DCL actualizado." : "DCL guardado.");
      limpiarForm();
      cargarDatos();
    } catch (error) {
      console.error(error);
      alert(`Error guardando DCL: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const limpiarForm = () => {
    setMostrarForm(false);
    setEditandoId(null);
    setForm({
      fecha_emision: hoy(),
      emisor_nombre: "",
      numero_control: "",
      codigo_generacion: "",
      valor_operaciones: "",
      comision: "",
      iva_comision: "",
      iva_percibido: "",
      liquido_pagar: "",
      observaciones: "",
      banco_sugerido: "OTRO",
    });
  };

  const editar = (row) => {
    setEditandoId(row.id);
    setMostrarForm(true);
    setForm({
      fecha_emision: row.fecha_emision || hoy(),
      emisor_nombre: row.emisor_nombre || "",
      numero_control: row.numero_control || "",
      codigo_generacion: row.codigo_generacion || "",
      valor_operaciones: row.valor_operaciones ?? "",
      comision: row.comision ?? "",
      iva_comision: row.iva_comision ?? "",
      iva_percibido: row.iva_percibido ?? "",
      liquido_pagar: row.liquido_pagar ?? "",
      observaciones: row.observaciones || "",
      banco_sugerido: row.banco_sugerido || "OTRO",
    });
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar DCL?")) return;

    try {
      const { error } = await supabase
        .from("dcl_documentos")
        .delete()
        .eq("id", id);

      if (error) throw error;
      cargarDatos();
    } catch (error) {
      console.error(error);
      alert(`Error eliminando: ${error.message}`);
    }
  };

  const importarJSON = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (!empresaId) {
      alert("Seleccioná empresa.");
      e.target.value = "";
      return;
    }

    setLoading(true);

    try {
      const rows = [];

      for (const file of files) {
        const texto = await file.text();
        const json = JSON.parse(texto);
        rows.push(parsearJsonDCL(json, empresaId, file.name));
      }

      const { error } = await supabase
        .from("dcl_documentos")
        .upsert(rows, { onConflict: "codigo_generacion" });

      if (error) throw error;

      alert(`Se importaron ${rows.length} DCL JSON.`);
      cargarDatos();
    } catch (error) {
      console.error(error);
      alert(`Error importando JSON: ${error.message}`);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const importarExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!empresaId) {
      alert("Seleccioná empresa.");
      e.target.value = "";
      return;
    }

    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const rows = json.map(normalizarClave).map((r) => ({
        empresa_id: Number(empresaId),
        fecha_emision: r.FECHA_EMISION || r.FECHA || hoy(),
        emisor_nombre: r.EMISOR_NOMBRE || r.EMISOR || null,
        numero_control: r.NUMERO_CONTROL || null,
        codigo_generacion: r.CODIGO_GENERACION || null,
        valor_operaciones: numeroSeguro(r.VALOR_OPERACIONES || r.SUB_TOTAL || r.BRUTO),
        comision: numeroSeguro(r.COMISION),
        iva_comision: numeroSeguro(r.IVA_COMISION),
        iva_percibido: numeroSeguro(r.IVA_PERCIBIDO || r.ANTICIPO),
        liquido_pagar: numeroSeguro(r.LIQUIDO_PAGAR || r.NETO),
        observaciones: r.OBSERVACIONES || null,
        banco_sugerido: r.BANCO_SUGERIDO || inferirBanco(r.EMISOR_NOMBRE || r.EMISOR || ""),
        fuente: "excel",
        archivo_nombre: file.name,
      }));

      const { error } = await supabase
        .from("dcl_documentos")
        .upsert(rows, { onConflict: "codigo_generacion" });

      if (error) throw error;

      alert(`Se importaron ${rows.length} DCL desde Excel.`);
      cargarDatos();
    } catch (error) {
      console.error(error);
      alert(`Error importando Excel: ${error.message}`);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const dataFiltrada = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    if (!t) return data;

    return data.filter(
      (row) =>
        String(row.fecha_emision || "").toLowerCase().includes(t) ||
        String(row.emisor_nombre || "").toLowerCase().includes(t) ||
        String(row.numero_control || "").toLowerCase().includes(t) ||
        String(row.codigo_generacion || "").toLowerCase().includes(t) ||
        String(row.banco_sugerido || "").toLowerCase().includes(t)
    );
  }, [data, filtro]);

  const resumenTotales = useMemo(() => {
    return dataFiltrada.reduce(
      (acc, row) => {
        acc.bruto += numeroSeguro(row.valor_operaciones);
        acc.comision += numeroSeguro(row.comision);
        acc.ivaComision += numeroSeguro(row.iva_comision);
        acc.anticipo += numeroSeguro(row.iva_percibido);
        acc.neto += numeroSeguro(row.liquido_pagar);
        acc.deducciones +=
          numeroSeguro(row.comision) +
          numeroSeguro(row.iva_comision) +
          numeroSeguro(row.iva_percibido);

        return acc;
      },
      {
        bruto: 0,
        comision: 0,
        ivaComision: 0,
        anticipo: 0,
        neto: 0,
        deducciones: 0,
      }
    );
  }, [dataFiltrada]);

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">📄 DCL / Liquidaciones POS</h1>
            <p className="subtitle">Sube DCL por JSON, Excel o manual.</p>
          </div>

          <div className="actions">
            <button className="btn btn-secondary" onClick={() => navigate("/inicio")}>
              Ir a Inicio
            </button>
            <button className="btn btn-primary" onClick={() => setMostrarForm(true)}>
              Agregar Manual
            </button>
            <label className="btn btn-secondary">
              Importar JSON
              <input type="file" hidden multiple accept=".json" onChange={importarJSON} />
            </label>
            <label className="btn btn-secondary">
              Importar Excel
              <input type="file" hidden accept=".xlsx,.xls" onChange={importarExcel} />
            </label>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
          <div className="grid grid-4">
            <div>
              <label className="label">Empresa</label>
              <select
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
                className="select"
              >
                <option value="">Seleccionar empresa</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Buscar</label>
              <input
                type="text"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="input"
                placeholder="emisor, control, código..."
              />
            </div>
          </div>
        </div>

        <div className="grid grid-4" style={{ marginBottom: "18px" }}>
          <div className="card">
            <p className="module-text" style={{ margin: 0 }}>Total bruto POS</p>
            <h2 style={{ margin: "8px 0 0 0" }}>${dinero(resumenTotales.bruto)}</h2>
          </div>

          <div className="card">
            <p className="module-text" style={{ margin: 0 }}>Comisión POS</p>
            <h2 style={{ margin: "8px 0 0 0" }}>${dinero(resumenTotales.comision)}</h2>
          </div>

          <div className="card">
            <p className="module-text" style={{ margin: 0 }}>IVA comisión</p>
            <h2 style={{ margin: "8px 0 0 0" }}>${dinero(resumenTotales.ivaComision)}</h2>
          </div>

          <div className="card">
            <p className="module-text" style={{ margin: 0 }}>Anticipo / IVA percibido</p>
            <h2 style={{ margin: "8px 0 0 0" }}>${dinero(resumenTotales.anticipo)}</h2>
          </div>

          <div className="card">
            <p className="module-text" style={{ margin: 0 }}>Total descuentos POS</p>
            <h2 style={{ margin: "8px 0 0 0" }}>${dinero(resumenTotales.deducciones)}</h2>
          </div>

          <div className="card">
            <p className="module-text" style={{ margin: 0 }}>Total neto a banco</p>
            <h2 style={{ margin: "8px 0 0 0" }}>${dinero(resumenTotales.neto)}</h2>
          </div>
        </div>

        {mostrarForm && (
          <div className="card" style={{ marginBottom: "18px" }}>
            <h3 style={{ marginTop: 0 }}>{editandoId ? "Editar DCL" : "Nuevo DCL Manual"}</h3>

            <div className="grid grid-4">
              <div>
                <label className="label">Fecha emisión</label>
                <input
                  type="date"
                  className="input"
                  value={form.fecha_emision}
                  onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Emisor</label>
                <input
                  className="input"
                  value={form.emisor_nombre}
                  onChange={(e) => setForm({ ...form, emisor_nombre: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Número control</label>
                <input
                  className="input"
                  value={form.numero_control}
                  onChange={(e) => setForm({ ...form, numero_control: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Código generación</label>
                <input
                  className="input"
                  value={form.codigo_generacion}
                  onChange={(e) => setForm({ ...form, codigo_generacion: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Valor operaciones</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.valor_operaciones}
                  onChange={(e) => setForm({ ...form, valor_operaciones: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Comisión</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.comision}
                  onChange={(e) => setForm({ ...form, comision: e.target.value })}
                />
              </div>

              <div>
                <label className="label">IVA comisión</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.iva_comision}
                  onChange={(e) => setForm({ ...form, iva_comision: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Anticipo / IVA percibido</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.iva_percibido}
                  onChange={(e) => setForm({ ...form, iva_percibido: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Líquido a pagar</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.liquido_pagar}
                  onChange={(e) => setForm({ ...form, liquido_pagar: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Banco sugerido</label>
                <select
                  className="select"
                  value={form.banco_sugerido}
                  onChange={(e) => setForm({ ...form, banco_sugerido: e.target.value })}
                >
                  <option value="BAC">BAC</option>
                  <option value="SERFINSA">SERFINSA</option>
                  <option value="OTRO">OTRO</option>
                </select>
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label className="label">Observaciones</label>
                <input
                  className="input"
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                />
              </div>
            </div>

            <div className="actions" style={{ marginTop: "14px" }}>
              <button className="btn btn-success" onClick={guardarManual} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar"}
              </button>
              <button className="btn btn-secondary" onClick={limpiarForm}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="card">
          {loading ? (
            <p className="module-text">Cargando...</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Emisor</th>
                    <th>Control</th>
                    <th>Bruto</th>
                    <th>Comisión</th>
                    <th>IVA comisión</th>
                    <th>Anticipo</th>
                    <th>Neto</th>
                    <th>Banco</th>
                    <th>Fuente</th>
                    <th>Conciliado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {dataFiltrada.length > 0 ? (
                    dataFiltrada.map((row) => (
                      <tr key={row.id}>
                        <td>{row.fecha_emision}</td>
                        <td>{row.emisor_nombre || "-"}</td>
                        <td>{row.numero_control || "-"}</td>
                        <td>${dinero(row.valor_operaciones)}</td>
                        <td>${dinero(row.comision)}</td>
                        <td>${dinero(row.iva_comision)}</td>
                        <td>${dinero(row.iva_percibido)}</td>
                        <td>${dinero(row.liquido_pagar)}</td>
                        <td>{row.banco_sugerido || "-"}</td>
                        <td>{row.fuente || "-"}</td>
                        <td>
                          <span className="badge">
                            {row.conciliado ? "Sí" : "No"}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            <button className="btn btn-primary" onClick={() => editar(row)}>
                              Editar
                            </button>
                            <button className="btn btn-secondary" onClick={() => eliminar(row.id)}>
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="12" style={{ textAlign: "center", color: "#64748b" }}>
                        No hay DCL para mostrar
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}