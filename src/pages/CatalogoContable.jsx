import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function CatalogoContable() {
  const navigate = useNavigate();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [loading, setLoading] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  const [form, setForm] = useState({
    codigo: "",
    cuenta: "",
    es_movimiento: true,
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

  const validarEmpresa = () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return false;
    }
    return true;
  };

  const normalizarClave = (obj) => {
    const nuevo = {};
    Object.keys(obj || {}).forEach((key) => {
      const limpia = String(key)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "")
        .toUpperCase();

      nuevo[limpia] = obj[key];
    });
    return nuevo;
  };

  const compararCodigos = (a, b) => {
    const ca = String(a.codigo || "");
    const cb = String(b.codigo || "");

    return ca.localeCompare(cb, "es", {
      numeric: true,
      sensitivity: "base",
    });
  };

  const cargarCuentas = async () => {
    if (!empresaId) {
      setCuentas([]);
      return;
    }

    setLoading(true);

    try {
      const todas = [];
      const pageSize = 1000;
      let desde = 0;
      let seguir = true;

      while (seguir) {
        const { data, error } = await supabase
          .from("catalogo_contable")
          .select("*")
          .eq("empresa_id", empresaId)
          .order("codigo", { ascending: true })
          .range(desde, desde + pageSize - 1);

        if (error) {
          console.error(error);
          alert("No se pudo cargar el catálogo contable.");
          setLoading(false);
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
      setCuentas(todas);
    } catch (error) {
      console.error(error);
      alert("No se pudo cargar el catálogo contable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCuentas();
  }, [empresaId]);

  const limpiarForm = () => {
    setForm({
      codigo: "",
      cuenta: "",
      es_movimiento: true,
    });
    setEditandoId(null);
  };

  const codigoYaExiste = async (codigo, excluirId = null) => {
    let query = supabase
      .from("catalogo_contable")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("codigo", codigo)
      .limit(1);

    if (excluirId) {
      query = query.neq("id", excluirId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return false;
    }

    return (data || []).length > 0;
  };

  const generarCodigoDisponible = (codigoBase, codigosUsados = new Set()) => {
    const base = String(codigoBase || "").trim();

    if (!base) return base;

    if (!codigosUsados.has(base)) {
      codigosUsados.add(base);
      return base;
    }

    let correlativo = 1;
    let nuevoCodigo = `${base}.${String(correlativo).padStart(2, "0")}`;

    while (codigosUsados.has(nuevoCodigo)) {
      correlativo += 1;
      nuevoCodigo = `${base}.${String(correlativo).padStart(2, "0")}`;
    }

    codigosUsados.add(nuevoCodigo);
    return nuevoCodigo;
  };

  const guardarCuenta = async () => {
    if (!validarEmpresa()) return;

    if (!form.codigo.trim() || !form.cuenta.trim()) {
      alert("Completa código y cuenta.");
      return;
    }

    const codigoLimpio = form.codigo.trim();
    const cuentaLimpia = form.cuenta.trim();

    const existe = await codigoYaExiste(codigoLimpio, editandoId);

    if (existe) {
      alert(
        `El código ${codigoLimpio} ya existe. Escribe un código nuevo disponible.`
      );
      return;
    }

    const payload = {
      empresa_id: empresaId,
      codigo: codigoLimpio,
      cuenta: cuentaLimpia,
      es_movimiento: Boolean(form.es_movimiento),
      activo: true,
    };

    if (editandoId) {
      const { error } = await supabase
        .from("catalogo_contable")
        .update(payload)
        .eq("id", editandoId)
        .eq("empresa_id", empresaId);

      if (error) {
        console.error(error);
        alert("No se pudo actualizar la cuenta.");
        return;
      }
    } else {
      const { error } = await supabase.from("catalogo_contable").insert([payload]);

      if (error) {
        console.error(error);
        alert("No se pudo guardar la cuenta.");
        return;
      }
    }

    limpiarForm();
    cargarCuentas();
  };

  const iniciarEdicion = (item) => {
    setEditandoId(item.id);
    setForm({
      codigo: item.codigo || "",
      cuenta: item.cuenta || "",
      es_movimiento: Boolean(item.es_movimiento),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cambiarEstado = async (item) => {
    const { error } = await supabase
      .from("catalogo_contable")
      .update({ activo: !item.activo })
      .eq("id", item.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo cambiar el estado.");
      return;
    }

    cargarCuentas();
  };

  const cambiarMovimiento = async (item) => {
    const { error } = await supabase
      .from("catalogo_contable")
      .update({ es_movimiento: !item.es_movimiento })
      .eq("id", item.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo cambiar si es cuenta de movimiento.");
      return;
    }

    cargarCuentas();
  };

  const eliminarCuenta = async (id) => {
    if (!confirm("¿Eliminar esta cuenta del catálogo?")) return;

    const { error } = await supabase
      .from("catalogo_contable")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar la cuenta.");
      return;
    }

    cargarCuentas();
  };

  const obtenerCodigosExistentes = async () => {
    const todos = [];
    const pageSize = 1000;
    let desde = 0;
    let seguir = true;

    while (seguir) {
      const { data, error } = await supabase
        .from("catalogo_contable")
        .select("codigo")
        .eq("empresa_id", empresaId)
        .range(desde, desde + pageSize - 1);

      if (error) {
        console.error(error);
        return new Set();
      }

      const bloque = data || [];
      todos.push(...bloque);

      if (bloque.length < pageSize) {
        seguir = false;
      } else {
        desde += pageSize;
      }
    }

    return new Set(todos.map((item) => String(item.codigo || "").trim()));
  };

  const importarExcel = async (e) => {
    if (!validarEmpresa()) {
      e.target.value = "";
      return;
    }

    const file = e.target.files?.[0];
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

        const codigosUsados = await obtenerCodigosExistentes();

        let codigosAjustados = 0;

        const filas = json
          .map(normalizarClave)
          .map((row) => {
            const codigoOriginal = String(
              row.CODIGO ||
                row.COD ||
                row.CODIGOCUENTA ||
                row.CODIGOCONTABLE ||
                row.CODIGODECUENTA ||
                ""
            ).trim();

            const cuenta = String(
              row.CUENTA ||
                row.NOMBRE ||
                row.DESCRIPCION ||
                row.DESCRIPCIONCUENTA ||
                row.NOMBRECUENTA ||
                row.CUENTANOMBRE ||
                row.NOMBREDELACUENTA ||
                row.CUENTA2 ||
                row.CUENTACONTABLE ||
                ""
            ).trim();

            if (!codigoOriginal || !cuenta) return null;

            const codigoDisponible = generarCodigoDisponible(
              codigoOriginal,
              codigosUsados
            );

            if (codigoDisponible !== codigoOriginal) {
              codigosAjustados += 1;
            }

            return {
              empresa_id: empresaId,
              codigo: codigoDisponible,
              cuenta,
              es_movimiento: true,
              activo: true,
            };
          })
          .filter(Boolean);

        if (filas.length === 0) {
          alert(
            "No se encontraron filas válidas. El Excel debe tener columnas Código y Cuenta."
          );
          return;
        }

        const lote = 500;
        for (let i = 0; i < filas.length; i += lote) {
          const bloque = filas.slice(i, i + lote);

          const { error } = await supabase
            .from("catalogo_contable")
            .insert(bloque);

          if (error) {
            console.error(error);
            alert(`Error al importar catálogo: ${error.message}`);
            return;
          }
        }

        await cargarCuentas();

        alert(
          `Se importaron ${filas.length} cuentas.\nCódigos ajustados por repetidos: ${codigosAjustados}.`
        );
      } catch (error) {
        console.error(error);
        alert("Error leyendo el Excel del catálogo.");
      } finally {
        setLoading(false);
        e.target.value = "";
      }
    };

    reader.readAsBinaryString(file);
  };

  const texto = filtro.trim().toLowerCase();

  const cuentasFiltradas = cuentas.filter((item) => {
    if (!texto) return true;

    return (
      String(item.codigo || "").toLowerCase().includes(texto) ||
      String(item.cuenta || "").toLowerCase().includes(texto)
    );
  });

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">📚 Catálogo Contable</h1>
            <p className="subtitle">
              Carga y administra las cuentas contables
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
              onClick={cargarCuentas}
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
              Debes seleccionar una empresa antes de usar el catálogo.
            </p>
          </div>
        )}

        <div className="grid grid-2" style={{ marginBottom: "20px" }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              {editandoId ? "Editar cuenta" : "Agregar cuenta"}
            </h3>

            <div className="grid">
              <div>
                <label className="label">Código</label>
                <input
                  className="input"
                  style={thinInputStyle}
                  placeholder="Ej. 4101"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  disabled={!empresaId}
                />
              </div>

              <div>
                <label className="label">Cuenta</label>
                <input
                  className="input"
                  style={thinInputStyle}
                  placeholder="Ej. Ingresos por servicios dentales"
                  value={form.cuenta}
                  onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
                  disabled={!empresaId}
                />
              </div>

              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.es_movimiento}
                  onChange={(e) =>
                    setForm({ ...form, es_movimiento: e.target.checked })
                  }
                  disabled={!empresaId}
                />
                Es cuenta de movimiento / última categoría
              </label>

              <div className="actions">
                <button
                  className="btn btn-primary"
                  style={thinButtonStyle}
                  onClick={guardarCuenta}
                  disabled={!empresaId}
                >
                  {editandoId ? "Guardar cambios" : "Guardar cuenta"}
                </button>

                {editandoId && (
                  <button
                    className="btn btn-secondary"
                    style={thinButtonStyle}
                    onClick={limpiarForm}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Importar desde Excel</h3>

            <p className="subtitle" style={{ marginBottom: "14px" }}>
              El Excel debe tener columnas: Código y Cuenta. Si hay códigos
              repetidos, el sistema les asignará un código nuevo disponible.
            </p>

            <div className="grid">
              <label
                className="btn btn-success"
                style={{
                  ...thinButtonStyle,
                  opacity: empresaId ? 1 : 0.5,
                  pointerEvents: empresaId ? "auto" : "none",
                  textAlign: "center",
                }}
              >
                📥 Subir catálogo Excel
                <input
                  type="file"
                  hidden
                  accept=".xlsx,.xls"
                  onChange={importarExcel}
                />
              </label>

              <input
                className="input"
                style={thinInputStyle}
                placeholder="Buscar por código o cuenta..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                disabled={!empresaId}
              />

              <p style={{ color: "#64748b", margin: 0 }}>
                Cuentas cargadas en pantalla: {cuentas.length}
              </p>

              {loading && (
                <p style={{ color: "#64748b", margin: 0 }}>
                  Procesando catálogo...
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cuenta</th>
                  <th>Movimiento</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {empresaId ? (
                  cuentasFiltradas.length > 0 ? (
                    cuentasFiltradas.map((item) => (
                      <tr key={item.id}>
                        <td>{item.codigo}</td>
                        <td>{item.cuenta}</td>
                        <td>
                          <span className="badge">
                            {item.es_movimiento ? "Sí contabiliza" : "Mayor"}
                          </span>
                        </td>
                        <td>
                          <span className="badge">
                            {item.activo ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
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
                              onClick={() => cambiarMovimiento(item)}
                            >
                              {item.es_movimiento
                                ? "Marcar mayor"
                                : "Marcar movimiento"}
                            </button>

                            <button
                              className="btn btn-secondary"
                              style={thinButtonStyle}
                              onClick={() => cambiarEstado(item)}
                            >
                              {item.activo ? "Desactivar" : "Activar"}
                            </button>

                            <button
                              className="btn btn-secondary"
                              style={thinButtonStyle}
                              onClick={() => eliminarCuenta(item.id)}
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
                        colSpan="5"
                        style={{ textAlign: "center", color: "#64748b" }}
                      >
                        No hay cuentas para mostrar
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      Selecciona una empresa para ver el catálogo
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && (
            <p style={{ marginTop: "12px", color: "#64748b" }}>
              Cargando cuentas...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

