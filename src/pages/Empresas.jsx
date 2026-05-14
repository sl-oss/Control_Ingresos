import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function Empresas() {
  const navigate = useNavigate();

  const [empresas, setEmpresas] = useState([]);
  const [nombre, setNombre] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [loading, setLoading] = useState(false);

  const thinInputStyle = {
    padding: "8px 12px",
    borderRadius: "12px",
    minHeight: "40px",
  };

  const thinButtonStyle = {
    padding: "9px 14px",
    borderRadius: "12px",
  };

  const cargarEmpresas = async () => {
    const { data, error } = await supabase
      .from("empresas")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error(error);
      alert("No se pudieron cargar las empresas");
      return;
    }

    setEmpresas(data || []);
  };

  useEffect(() => {
    cargarEmpresas();
  }, []);

  const agregarEmpresa = async () => {
    if (!nombre.trim()) {
      alert("Escribe el nombre de la empresa");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("empresas")
      .insert([{ nombre: nombre.trim(), activo: true }])
      .select()
      .single();

    setLoading(false);

    if (error) {
      console.error(error);
      alert("No se pudo agregar la empresa");
      return;
    }

    setNombre("");
    await cargarEmpresas();

    if (data?.id) {
      localStorage.setItem(
        "empresaSeleccionada",
        JSON.stringify({
          id: data.id,
          nombre: data.nombre,
        })
      );
    }
  };

  const iniciarEdicion = (empresa) => {
    setEditandoId(empresa.id);
    setNombreEdit(empresa.nombre || "");
  };

  const guardarEdicion = async () => {
    if (!nombreEdit.trim()) {
      alert("Escribe el nombre de la empresa");
      return;
    }

    const { error } = await supabase
      .from("empresas")
      .update({ nombre: nombreEdit.trim() })
      .eq("id", editandoId);

    if (error) {
      console.error(error);
      alert("No se pudo editar la empresa");
      return;
    }

    const empresaGuardada = localStorage.getItem("empresaSeleccionada");
    if (empresaGuardada) {
      try {
        const empresaActual = JSON.parse(empresaGuardada);
        if (Number(empresaActual?.id) === Number(editandoId)) {
          localStorage.setItem(
            "empresaSeleccionada",
            JSON.stringify({
              ...empresaActual,
              nombre: nombreEdit.trim(),
            })
          );
        }
      } catch (e) {
        console.error(e);
      }
    }

    setEditandoId(null);
    setNombreEdit("");
    cargarEmpresas();
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setNombreEdit("");
  };

  const seleccionarEmpresa = (empresa) => {
    if (!empresa.activo) {
      alert("No puedes usar una empresa inactiva.");
      return;
    }

    localStorage.setItem(
      "empresaSeleccionada",
      JSON.stringify({
        id: empresa.id,
        nombre: empresa.nombre,
      })
    );

    navigate("/inicio");
  };

  const toggleActivo = async (empresa) => {
    const { error } = await supabase
      .from("empresas")
      .update({ activo: !empresa.activo })
      .eq("id", empresa.id);

    if (error) {
      console.error(error);
      alert("No se pudo actualizar el estado");
      return;
    }

    const empresaGuardada = localStorage.getItem("empresaSeleccionada");
    if (empresaGuardada) {
      try {
        const empresaActual = JSON.parse(empresaGuardada);
        if (
          Number(empresaActual?.id) === Number(empresa.id) &&
          empresa.activo === true
        ) {
          localStorage.removeItem("empresaSeleccionada");
        }
      } catch (e) {
        console.error(e);
      }
    }

    cargarEmpresas();
  };

  const eliminarEmpresa = async (empresa) => {
    if (!confirm(`¿Eliminar la empresa "${empresa.nombre}"?`)) return;

    const { count, error: errorConteo } = await supabase
      .from("facturacion_detalle")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", empresa.id);

    if (errorConteo) {
      console.error(errorConteo);
      alert("No se pudo validar la empresa");
      return;
    }

    if ((count || 0) > 0) {
      alert(
        "Esta empresa ya tiene movimientos. Mejor desactívala en lugar de eliminarla."
      );
      return;
    }

    const { error } = await supabase
      .from("empresas")
      .delete()
      .eq("id", empresa.id);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar la empresa");
      return;
    }

    const empresaGuardada = localStorage.getItem("empresaSeleccionada");
    if (empresaGuardada) {
      try {
        const empresaActual = JSON.parse(empresaGuardada);
        if (Number(empresaActual?.id) === Number(empresa.id)) {
          localStorage.removeItem("empresaSeleccionada");
        }
      } catch (e) {
        console.error(e);
      }
    }

    cargarEmpresas();
  };

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🏢 Empresas</h1>
            <p className="subtitle">Administra las empresas del sistema</p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "20px" }}>
          <div className="grid grid-2">
            <div>
              <label className="label">Nueva empresa</label>
              <input
                className="input"
                style={thinInputStyle}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ejemplo: Inversiones Morales, S.A. de C.V."
              />
            </div>

            <div style={{ display: "flex", alignItems: "end" }}>
              <button
                className="btn btn-primary"
                style={thinButtonStyle}
                onClick={agregarEmpresa}
                disabled={loading}
              >
                ➕ Agregar empresa
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {empresas.length > 0 ? (
                  empresas.map((empresa) => (
                    <tr key={empresa.id}>
                      <td>{empresa.id}</td>

                      <td>
                        {editandoId === empresa.id ? (
                          <input
                            className="input"
                            style={thinInputStyle}
                            value={nombreEdit}
                            onChange={(e) => setNombreEdit(e.target.value)}
                          />
                        ) : (
                          empresa.nombre
                        )}
                      </td>

                      <td>
                        <span className="badge">
                          {empresa.activo ? "Activa" : "Inactiva"}
                        </span>
                      </td>

                      <td>
                        <div className="actions">
                          {editandoId === empresa.id ? (
                            <>
                              <button
                                className="btn btn-success"
                                style={thinButtonStyle}
                                onClick={guardarEdicion}
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
                                onClick={() => seleccionarEmpresa(empresa)}
                              >
                                Usar
                              </button>

                              <button
                                className="btn btn-secondary"
                                style={thinButtonStyle}
                                onClick={() => iniciarEdicion(empresa)}
                              >
                                Editar
                              </button>

                              <button
                                className="btn btn-secondary"
                                style={thinButtonStyle}
                                onClick={() => toggleActivo(empresa)}
                              >
                                {empresa.activo ? "Desactivar" : "Activar"}
                              </button>

                              <button
                                className="btn btn-secondary"
                                style={thinButtonStyle}
                                onClick={() => eliminarEmpresa(empresa)}
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="4"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      No hay empresas registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}