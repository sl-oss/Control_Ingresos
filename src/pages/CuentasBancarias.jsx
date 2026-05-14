import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function CuentasBancarias() {
  const navigate = useNavigate();

  const [empresa, setEmpresa] = useState(null);
  const [data, setData] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarSugerenciasCuenta, setMostrarSugerenciasCuenta] =
    useState(false);

  const [form, setForm] = useState({
    nombre_banco: "",
    nombre_cuenta: "",
    numero_cuenta: "",
    cuenta_contable: "",
    usa_remesa: false,
    permite_pos: false,
    permite_transferencias: true,
    permite_efectivo: true,
    cobra_comision_pos: false,
    comision_pct: 0,
    iva_pct: 13,
    anticipo_pct: 2,
    activo: true,
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
    const emp =
      localStorage.getItem("empresaSeleccionada") ||
      sessionStorage.getItem("empresaSeleccionada");

    if (!emp) {
      navigate("/");
      return;
    }

    try {
      setEmpresa(JSON.parse(emp));
    } catch (error) {
      console.error("Error leyendo empresaSeleccionada:", error);
      navigate("/");
    }
  }, []);

  const empresaId = useMemo(() => empresa?.id || null, [empresa]);

  const normalizar = (txt = "") =>
    String(txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const compararCodigos = (a, b) => {
    const ca = String(a.codigo || "");
    const cb = String(b.codigo || "");

    return ca.localeCompare(cb, "es", {
      numeric: true,
      sensitivity: "base",
    });
  };

  const cargarCatalogoCompleto = async () => {
    if (!empresaId) {
      setCatalogo([]);
      return;
    }

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
        .order("codigo", { ascending: true })
        .range(desde, desde + pageSize - 1);

      if (error) {
        console.error(error);
        alert("No se pudo cargar el catálogo contable.");
        return;
      }

      const bloque = data || [];
      todas.push(...bloque);

      if (bloque.length < pageSize) {
        seguir = false;
      } else {
        desde += pageSize;
      }
    }

    todas.sort(compararCodigos);
    setCatalogo(todas);
  };

  const cargarDatos = async () => {
    if (!empresaId) return;

    const { data, error } = await supabase
      .from("cuentas_bancarias")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("id", { ascending: true });

    if (error) {
      console.error(error);
      alert("No se pudieron cargar las cuentas bancarias.");
      return;
    }

    setData(data || []);
  };

  useEffect(() => {
    if (empresaId) {
      cargarDatos();
      cargarCatalogoCompleto();
    }
  }, [empresaId]);

  const limpiarForm = () => {
    setForm({
      nombre_banco: "",
      nombre_cuenta: "",
      numero_cuenta: "",
      cuenta_contable: "",
      usa_remesa: false,
      permite_pos: false,
      permite_transferencias: true,
      permite_efectivo: true,
      cobra_comision_pos: false,
      comision_pct: 0,
      iva_pct: 13,
      anticipo_pct: 2,
      activo: true,
    });

    setEditandoId(null);
    setMostrarForm(false);
    setMostrarSugerenciasCuenta(false);
  };

  const guardar = async () => {
    if (!form.nombre_banco || !form.nombre_cuenta) {
      alert("Completa banco y nombre de cuenta.");
      return;
    }

    const payload = {
      empresa_id: empresaId,
      nombre_banco: form.nombre_banco || "",
      nombre_cuenta: form.nombre_cuenta || "",
      numero_cuenta: form.numero_cuenta || null,
      cuenta_contable: form.cuenta_contable || null,
      usa_remesa: !!form.usa_remesa,
      permite_pos: !!form.permite_pos,
      permite_transferencias: !!form.permite_transferencias,
      permite_efectivo: !!form.permite_efectivo,
      cobra_comision_pos: !!form.cobra_comision_pos,
      comision_pct: Number(form.comision_pct || 0),
      iva_pct: Number(form.iva_pct || 0),
      anticipo_pct: Number(form.anticipo_pct || 0),
      activo: form.activo ?? true,
    };

    if (editandoId) {
      const { error } = await supabase
        .from("cuentas_bancarias")
        .update(payload)
        .eq("id", editandoId)
        .eq("empresa_id", empresaId);

      if (error) {
        console.error(error);
        alert("No se pudo actualizar la cuenta bancaria.");
        return;
      }
    } else {
      const { error } = await supabase.from("cuentas_bancarias").insert([payload]);

      if (error) {
        console.error(error);
        alert("No se pudo guardar la cuenta bancaria.");
        return;
      }
    }

    limpiarForm();
    cargarDatos();
  };

  const editar = (row) => {
    setEditandoId(row.id);

    setForm({
      nombre_banco: row.nombre_banco || "",
      nombre_cuenta: row.nombre_cuenta || "",
      numero_cuenta: row.numero_cuenta || "",
      cuenta_contable: row.cuenta_contable || "",
      usa_remesa: row.usa_remesa ?? false,
      permite_pos: row.permite_pos ?? false,
      permite_transferencias: row.permite_transferencias ?? true,
      permite_efectivo: row.permite_efectivo ?? true,
      cobra_comision_pos: row.cobra_comision_pos ?? false,
      comision_pct: row.comision_pct ?? 0,
      iva_pct: row.iva_pct ?? 13,
      anticipo_pct: row.anticipo_pct ?? 2,
      activo: row.activo ?? true,
    });

    setMostrarForm(true);
  };

  const eliminar = async (id) => {
    if (!confirm("¿Eliminar esta cuenta bancaria?")) return;

    const { error } = await supabase
      .from("cuentas_bancarias")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar la cuenta bancaria.");
      return;
    }

    cargarDatos();
  };

  const seleccionarCuentaContable = (cuenta) => {
    setForm({
      ...form,
      cuenta_contable: `${cuenta.codigo} - ${cuenta.cuenta}`,
    });

    setMostrarSugerenciasCuenta(false);
  };

  const textoCuenta = normalizar(form.cuenta_contable);

  const cuentasFiltradas = catalogo
    .filter((cuenta) => {
      if (!textoCuenta) return true;

      const texto = normalizar(`${cuenta.codigo} ${cuenta.cuenta}`);
      const codigo = normalizar(cuenta.codigo);
      const nombre = normalizar(cuenta.cuenta);

      return (
        texto.includes(textoCuenta) ||
        codigo.includes(textoCuenta) ||
        nombre.includes(textoCuenta)
      );
    })
    .slice(0, 80);

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🏦 Cuentas Bancarias</h1>
            <p className="subtitle">
              Configura bancos y su cuenta contable
              {empresa ? ` • ${empresa.nombre}` : ""}
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
              onClick={() => navigate("/catalogo-contable")}
            >
              📚 Catálogo
            </button>

            <button
              className="btn btn-primary"
              style={thinButtonStyle}
              onClick={() => {
                setMostrarForm(true);
                setEditandoId(null);
              }}
            >
              ➕ Nueva cuenta
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={() => {
                cargarDatos();
                cargarCatalogoCompleto();
              }}
            >
              🔄 Actualizar
            </button>
          </div>
        </div>

        {mostrarForm && (
          <div className="card" style={{ marginBottom: "20px" }}>
            <h3 style={{ marginTop: 0 }}>
              {editandoId ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
            </h3>

            <div className="grid grid-3">
              <div>
                <label className="label">Banco</label>
                <input
                  placeholder="Ej. Banco Agrícola"
                  className="input"
                  style={thinInputStyle}
                  value={form.nombre_banco}
                  onChange={(e) =>
                    setForm({ ...form, nombre_banco: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="label">Nombre cuenta</label>
                <input
                  placeholder="Ej. Cuenta corriente principal"
                  className="input"
                  style={thinInputStyle}
                  value={form.nombre_cuenta}
                  onChange={(e) =>
                    setForm({ ...form, nombre_cuenta: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="label">Número cuenta</label>
                <input
                  placeholder="Número cuenta"
                  className="input"
                  style={thinInputStyle}
                  value={form.numero_cuenta}
                  onChange={(e) =>
                    setForm({ ...form, numero_cuenta: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-2" style={{ marginTop: "15px" }}>
              <div style={{ position: "relative" }}>
                <label className="label">Cuenta contable del banco</label>
                <input
                  className="input"
                  style={thinInputStyle}
                  placeholder="Escribe código o nombre de cuenta..."
                  value={form.cuenta_contable}
                  onFocus={() => setMostrarSugerenciasCuenta(true)}
                  onChange={(e) => {
                    setForm({ ...form, cuenta_contable: e.target.value });
                    setMostrarSugerenciasCuenta(true);
                  }}
                />

                {mostrarSugerenciasCuenta && (
                  <div
                    style={{
                      marginTop: "8px",
                      background: "#ffffff",
                      border: "1px solid #dbeafe",
                      borderRadius: "12px",
                      boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
                      maxHeight: "280px",
                      overflowY: "auto",
                      overflowX: "hidden",
                      zIndex: 100,
                    }}
                  >
                    {cuentasFiltradas.length > 0 ? (
                      cuentasFiltradas.map((cuenta) => (
                        <button
                          key={cuenta.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            seleccionarCuentaContable(cuenta);
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
                          <div style={{ fontWeight: 700, color: "#334155" }}>
                            {cuenta.codigo}
                            {cuenta.es_movimiento ? "" : " • Mayor"}
                          </div>
                          <div style={{ fontSize: "13px", color: "#64748b" }}>
                            {cuenta.cuenta}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: "12px", color: "#64748b" }}>
                        No se encontraron cuentas.
                      </div>
                    )}
                  </div>
                )}

                <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  Se muestra todo el catálogo activo. Puedes seleccionar cualquier cuenta.
                </p>
              </div>

              <div>
                <label className="label">Estado</label>
                <select
                  className="select"
                  style={thinInputStyle}
                  value={form.activo ? "true" : "false"}
                  onChange={(e) =>
                    setForm({ ...form, activo: e.target.value === "true" })
                  }
                >
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
              </div>
            </div>

            <div className="grid grid-3" style={{ marginTop: "15px" }}>
              <label>
                <input
                  type="checkbox"
                  checked={form.usa_remesa}
                  onChange={(e) =>
                    setForm({ ...form, usa_remesa: e.target.checked })
                  }
                />
                Usa remesa
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={form.permite_pos}
                  onChange={(e) =>
                    setForm({ ...form, permite_pos: e.target.checked })
                  }
                />
                Permite POS
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={form.permite_transferencias}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      permite_transferencias: e.target.checked,
                    })
                  }
                />
                Permite transferencias
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={form.permite_efectivo}
                  onChange={(e) =>
                    setForm({ ...form, permite_efectivo: e.target.checked })
                  }
                />
                Permite efectivo
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={form.cobra_comision_pos}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cobra_comision_pos: e.target.checked,
                    })
                  }
                />
                Cobra comisión POS
              </label>
            </div>

            {form.permite_pos && form.cobra_comision_pos && (
              <div className="grid grid-3" style={{ marginTop: "15px" }}>
                <div>
                  <label className="label">% Comisión</label>
                  <input
                    type="number"
                    placeholder="% Comisión"
                    className="input"
                    style={thinInputStyle}
                    value={form.comision_pct}
                    onChange={(e) =>
                      setForm({ ...form, comision_pct: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="label">% IVA</label>
                  <input
                    type="number"
                    placeholder="% IVA"
                    className="input"
                    style={thinInputStyle}
                    value={form.iva_pct}
                    onChange={(e) =>
                      setForm({ ...form, iva_pct: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="label">% Anticipo</label>
                  <input
                    type="number"
                    placeholder="% Anticipo"
                    className="input"
                    style={thinInputStyle}
                    value={form.anticipo_pct}
                    onChange={(e) =>
                      setForm({ ...form, anticipo_pct: e.target.value })
                    }
                  />
                </div>
              </div>
            )}

            <div className="actions" style={{ marginTop: "15px" }}>
              <button
                className="btn btn-success"
                style={thinButtonStyle}
                onClick={guardar}
              >
                Guardar
              </button>

              <button
                className="btn btn-secondary"
                style={thinButtonStyle}
                onClick={limpiarForm}
              >
                Cancelar
              </button>

              <button
                className="btn btn-secondary"
                style={thinButtonStyle}
                onClick={() => setMostrarSugerenciasCuenta(false)}
              >
                Cerrar lista
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Banco</th>
                  <th>Cuenta bancaria</th>
                  <th>Número</th>
                  <th>Cuenta contable</th>
                  <th>POS</th>
                  <th>Comisión</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {data.length > 0 ? (
                  data.map((row) => (
                    <tr key={row.id}>
                      <td>{row.nombre_banco}</td>
                      <td>{row.nombre_cuenta}</td>
                      <td>{row.numero_cuenta || "-"}</td>
                      <td>{row.cuenta_contable || "-"}</td>
                      <td>{row.permite_pos ? "Sí" : "No"}</td>
                      <td>{Number(row.comision_pct || 0).toFixed(2)}%</td>
                      <td>
                        <span className="badge">
                          {row.activo === false ? "Inactiva" : "Activa"}
                        </span>
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="btn btn-primary"
                            style={thinButtonStyle}
                            onClick={() => editar(row)}
                          >
                            Editar
                          </button>

                          <button
                            className="btn btn-secondary"
                            style={thinButtonStyle}
                            onClick={() => eliminar(row.id)}
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
                      colSpan="8"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      No hay cuentas bancarias registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p style={{ color: "#64748b", marginTop: "12px" }}>
            Cuentas contables cargadas del catálogo: {catalogo.length}
          </p>
        </div>
      </div>
    </div>
  );
}
