
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function MapeoCobrosContables() {
  const navigate = useNavigate();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [mapeos, setMapeos] = useState([]);
  const [parametros, setParametros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  const [form, setForm] = useState({
    metodo_cobro: "",
    parametro_contable_id: "",
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

  const cargarDatos = async () => {
    if (!empresaId) {
      setMapeos([]);
      setParametros([]);
      return;
    }

    setLoading(true);

    const { data: parametrosData, error: errorParametros } = await supabase
      .from("parametros_contables")
      .select("id, nombre, tipo, cuenta_contable, activo")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .in("tipo", ["banco", "caja", "cuenta_por_cobrar", "otro"])
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
      .order("metodo_cobro", { ascending: true });

    if (errorMapeos) {
      console.error(errorMapeos);
      alert("No se pudieron cargar los mapeos.");
      setLoading(false);
      return;
    }

    setParametros(parametrosData || []);
    setMapeos(mapeosData || []);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [empresaId]);

  const limpiarForm = () => {
    setForm({
      metodo_cobro: "",
      parametro_contable_id: "",
    });
    setEditandoId(null);
  };

  const guardarMapeo = async () => {
    if (!empresaId) {
      alert("Primero debes seleccionar una empresa.");
      return;
    }

    if (!form.metodo_cobro.trim() || !form.parametro_contable_id) {
      alert("Completa el método de cobro y el parámetro contable.");
      return;
    }

    const payload = {
      empresa_id: empresaId,
      metodo_cobro: form.metodo_cobro.trim(),
      parametro_contable_id: Number(form.parametro_contable_id),
      activo: true,
    };

    if (editandoId) {
      const { error } = await supabase
        .from("mapeo_cobros_contables")
        .update(payload)
        .eq("id", editandoId)
        .eq("empresa_id", empresaId);

      if (error) {
        console.error(error);
        alert("No se pudo actualizar el mapeo.");
        return;
      }
    } else {
      const { error } = await supabase
        .from("mapeo_cobros_contables")
        .insert([payload]);

      if (error) {
        console.error(error);
        alert("No se pudo guardar el mapeo.");
        return;
      }
    }

    limpiarForm();
    cargarDatos();
  };

  const iniciarEdicion = (item) => {
    setEditandoId(item.id);
    setForm({
      metodo_cobro: item.metodo_cobro || "",
      parametro_contable_id: item.parametro_contable_id
        ? String(item.parametro_contable_id)
        : "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cambiarEstado = async (item) => {
    const { error } = await supabase
      .from("mapeo_cobros_contables")
      .update({ activo: !item.activo })
      .eq("id", item.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo cambiar el estado.");
      return;
    }

    cargarDatos();
  };

  const eliminarMapeo = async (id) => {
    if (!confirm("¿Eliminar este mapeo de cobro?")) return;

    const { error } = await supabase
      .from("mapeo_cobros_contables")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar el mapeo.");
      return;
    }

    cargarDatos();
  };

  const crearSugeridos = async () => {
    if (!empresaId) return;

    const sugeridos = [
      "Efectivo",
      "POS",
      "Transferencia",
      "Cheque",
      "Depósito",
      "Crédito",
      "DCL",
      "Banco",
      "Caja chica",
    ];

    const existentes = new Set(
      mapeos.map((m) => String(m.metodo_cobro || "").toLowerCase())
    );

    const nuevos = sugeridos
      .filter((m) => !existentes.has(m.toLowerCase()))
      .map((metodo) => ({
        empresa_id: empresaId,
        metodo_cobro: metodo,
        parametro_contable_id: null,
        activo: true,
      }));

    if (nuevos.length === 0) {
      alert("Ya existen los métodos sugeridos.");
      return;
    }

    const { error } = await supabase.from("mapeo_cobros_contables").insert(nuevos);

    if (error) {
      console.error(error);
      alert("No se pudieron crear los métodos sugeridos.");
      return;
    }

    cargarDatos();
  };

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">💳 Mapeo de Cobros Contables</h1>
            <p className="subtitle">
              Relaciona formas de cobro con cuentas contables
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
              onClick={() => navigate("/parametros-contables")}
            >
              ⚙️ Parámetros
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
              Debes seleccionar una empresa antes de crear mapeos.
            </p>
          </div>
        )}

        <div className="card" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0 }}>
            {editandoId ? "Editar mapeo" : "Crear mapeo"}
          </h3>

          <div className="grid grid-2">
            <div>
              <label className="label">Método de cobro</label>
              <input
                className="input"
                style={thinInputStyle}
                placeholder="Ej. Efectivo, POS Agrícola, Transferencia Cuscatlán..."
                value={form.metodo_cobro}
                onChange={(e) =>
                  setForm({ ...form, metodo_cobro: e.target.value })
                }
                disabled={!empresaId}
              />
            </div>

            <div>
              <label className="label">Parámetro contable</label>
              <select
                className="select"
                style={thinInputStyle}
                value={form.parametro_contable_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    parametro_contable_id: e.target.value,
                  })
                }
                disabled={!empresaId}
              >
                <option value="">Seleccionar parámetro</option>
                {parametros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tipo} • {p.nombre} • {p.cuenta_contable}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="actions" style={{ marginTop: "14px" }}>
            <button
              className="btn btn-primary"
              style={thinButtonStyle}
              onClick={guardarMapeo}
              disabled={!empresaId}
            >
              {editandoId ? "Guardar cambios" : "Guardar mapeo"}
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

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={crearSugeridos}
              disabled={!empresaId}
            >
              Crear sugeridos
            </button>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Método de cobro</th>
                  <th>Parámetro</th>
                  <th>Cuenta contable</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {mapeos.length > 0 ? (
                  mapeos.map((item) => (
                    <tr key={item.id}>
                      <td>{item.metodo_cobro}</td>
                      <td>
                        {item.parametros_contables
                          ? `${item.parametros_contables.tipo} • ${item.parametros_contables.nombre}`
                          : "Sin parámetro asignado"}
                      </td>
                      <td>{item.parametros_contables?.cuenta_contable || "-"}</td>
                      <td>
                        <span className="badge">
                          {item.activo ? "Activo" : "Inactivo"}
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
                            onClick={() => cambiarEstado(item)}
                          >
                            {item.activo ? "Desactivar" : "Activar"}
                          </button>

                          <button
                            className="btn btn-secondary"
                            style={thinButtonStyle}
                            onClick={() => eliminarMapeo(item.id)}
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
                      No hay métodos de cobro mapeados
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
