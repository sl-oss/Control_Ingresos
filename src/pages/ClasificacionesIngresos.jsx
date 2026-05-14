import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient";

export default function ClasificacionesIngresos() {
  const navigate = useNavigate();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [clasificaciones, setClasificaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [filtro, setFiltro] = useState("");

  const [form, setForm] = useState({
    nombre: "",
    modo_reporte: "resumido",
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

  const cargarClasificaciones = async () => {
    if (!empresaId) {
      setClasificaciones([]);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("clasificaciones_ingresos")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("activo", { ascending: false })
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
      alert("No se pudieron cargar las clasificaciones.");
      setLoading(false);
      return;
    }

    setClasificaciones(data || []);
    setLoading(false);
  };

  useEffect(() => {
    cargarClasificaciones();
  }, [empresaId]);

  const limpiarFormulario = () => {
    setForm({
      nombre: "",
      modo_reporte: "resumido",
      activo: true,
    });
    setEditandoId(null);
  };

  const guardar = async () => {
    if (!empresaId) {
      alert("Primero selecciona una empresa.");
      return;
    }

    if (!form.nombre.trim()) {
      alert("Ingresa el nombre de la clasificación.");
      return;
    }

    setGuardando(true);

    try {
      const payload = {
        empresa_id: empresaId,
        nombre: form.nombre.trim(),
        modo_reporte: form.modo_reporte,
        activo: !!form.activo,
      };

      if (editandoId) {
        const { error } = await supabase
          .from("clasificaciones_ingresos")
          .update(payload)
          .eq("id", editandoId)
          .eq("empresa_id", empresaId);

        if (error) throw error;

        alert("Clasificación actualizada.");
      } else {
        const { error } = await supabase
          .from("clasificaciones_ingresos")
          .insert([payload]);

        if (error) throw error;

        alert("Clasificación guardada.");
      }

      limpiarFormulario();
      await cargarClasificaciones();
    } catch (error) {
      console.error(error);
      alert(`Error al guardar: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const editar = (item) => {
    setEditandoId(item.id);
    setForm({
      nombre: item.nombre || "",
      modo_reporte: item.modo_reporte || "resumido",
      activo: item.activo !== false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminar = async (id) => {
    if (!empresaId) return;
    if (!window.confirm("¿Eliminar esta clasificación?")) return;

    const { error } = await supabase
      .from("clasificaciones_ingresos")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar.");
      return;
    }

    await cargarClasificaciones();
  };

  const dataFiltrada = clasificaciones.filter((item) => {
    if (!filtro.trim()) return true;
    const texto = filtro.toLowerCase();
    return (
      String(item.nombre || "").toLowerCase().includes(texto) ||
      String(item.modo_reporte || "").toLowerCase().includes(texto) ||
      String(item.activo ? "activo" : "inactivo").includes(texto)
    );
  });

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🏷️ Clasificaciones de ingresos</h1>
            <p className="subtitle">
              Crea las categorías de ingreso y define si salen detalladas o resumidas en el reporte.
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
              onClick={() => navigate("/facturacion")}
            >
              📊 Facturación
            </button>
          </div>
        </div>

        {!empresaId && (
          <div className="card" style={{ marginBottom: "20px", border: "1px solid #fecaca" }}>
            <p style={{ margin: 0, color: "#991b1b", fontWeight: 600 }}>
              Debes seleccionar una empresa antes de usar este módulo.
            </p>
          </div>
        )}

        <div className="card" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0 }}>
            {editandoId ? "Editar clasificación" : "Nueva clasificación"}
          </h3>

          <div className="grid grid-3">
            <div>
              <label className="label">Nombre</label>
              <input
                className="input"
                style={thinInputStyle}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Alquileres, Servicios odontológicos..."
                disabled={!empresaId}
              />
            </div>

            <div>
              <label className="label">Modo de reporte</label>
              <select
                className="select"
                style={thinInputStyle}
                value={form.modo_reporte}
                onChange={(e) => setForm({ ...form, modo_reporte: e.target.value })}
                disabled={!empresaId}
              >
                <option value="resumido">Resumido</option>
                <option value="detallado">Detallado</option>
              </select>
            </div>

            <div>
              <label className="label">Estado</label>
              <select
                className="select"
                style={thinInputStyle}
                value={form.activo ? "activo" : "inactivo"}
                onChange={(e) =>
                  setForm({ ...form, activo: e.target.value === "activo" })
                }
                disabled={!empresaId}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          </div>

          <div className="actions" style={{ marginTop: "15px" }}>
            <button
              className="btn btn-primary"
              style={thinButtonStyle}
              onClick={guardar}
              disabled={!empresaId || guardando}
            >
              {guardando
                ? "Guardando..."
                : editandoId
                ? "Guardar cambios"
                : "Guardar clasificación"}
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={limpiarFormulario}
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="card">
          <div className="grid grid-3" style={{ marginBottom: "16px" }}>
            <div>
              <label className="label">Buscar</label>
              <input
                className="input"
                style={thinInputStyle}
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Nombre, modo o estado..."
                disabled={!empresaId}
              />
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Modo reporte</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {!empresaId ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", color: "#64748b" }}>
                      Selecciona una empresa para ver los datos
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", color: "#64748b" }}>
                      Cargando...
                    </td>
                  </tr>
                ) : dataFiltrada.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", color: "#64748b" }}>
                      No hay clasificaciones registradas
                    </td>
                  </tr>
                ) : (
                  dataFiltrada.map((item) => (
                    <tr key={item.id}>
                      <td>{item.nombre}</td>
                      <td>
                        <span className="badge">
                          {item.modo_reporte === "detallado" ? "Detallado" : "Resumido"}
                        </span>
                      </td>
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
                            onClick={() => editar(item)}
                          >
                            Editar
                          </button>

                          <button
                            className="btn btn-secondary"
                            style={thinButtonStyle}
                            onClick={() => eliminar(item.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}