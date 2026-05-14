import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function ReglasContables() {
  const navigate = useNavigate();

  const [empresaActual, setEmpresaActual] = useState(null);
  const [etiquetas, setEtiquetas] = useState([]);
  const [reglas, setReglas] = useState([]);
  const [cuentasCatalogo, setCuentasCatalogo] = useState([]);
  const [loading, setLoading] = useState(false);

  const [mostrarSugerenciasCuenta, setMostrarSugerenciasCuenta] =
    useState(false);

  const [formEtiqueta, setFormEtiqueta] = useState({
    nombre: "",
    tipo: "ingreso",
  });

  const [formRegla, setFormRegla] = useState({
    tipo: "ingreso",
    campo: "descripcion",
    operador: "contiene",
    valor: "",
    etiqueta_id: "",
    cuenta_contable: "",
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

  const normalizarTexto = (valor = "") => {
    return String(valor || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const compararCodigos = (a, b) => {
    const ca = String(a.codigo || "");
    const cb = String(b.codigo || "");

    return ca.localeCompare(cb, "es", {
      numeric: true,
      sensitivity: "base",
    });
  };

  const cargarCuentasCatalogo = async () => {
    if (!empresaId) return [];

    const todas = [];
    const pageSize = 1000;
    let desde = 0;
    let seguir = true;

    while (seguir) {
      const { data, error } = await supabase
        .from("catalogo_contable")
        .select("id, codigo, cuenta, es_movimiento, activo")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .eq("es_movimiento", true)
        .order("codigo", { ascending: true })
        .range(desde, desde + pageSize - 1);

      if (error) {
        console.error(error);
        alert("No se pudo cargar el catálogo contable.");
        return [];
      }

      const bloque = data || [];
      todas.push(...bloque);

      if (bloque.length < pageSize) {
        seguir = false;
      } else {
        desde += pageSize;
      }
    }

    return todas.sort(compararCodigos);
  };

  const cargarDatos = async () => {
    if (!empresaId) {
      setEtiquetas([]);
      setReglas([]);
      setCuentasCatalogo([]);
      return;
    }

    setLoading(true);

    const { data: etiquetasData, error: errorEtiquetas } = await supabase
      .from("etiquetas_contables")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("tipo", { ascending: true })
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
      .order("id", { ascending: false });

    if (errorReglas) {
      console.error(errorReglas);
      alert("No se pudieron cargar las reglas.");
      setLoading(false);
      return;
    }

    const cuentasData = await cargarCuentasCatalogo();

    setEtiquetas(etiquetasData || []);
    setReglas(reglasData || []);
    setCuentasCatalogo(cuentasData || []);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [empresaId]);

  const guardarEtiqueta = async () => {
    if (!validarEmpresa()) return;

    if (!formEtiqueta.nombre.trim()) {
      alert("Escribe el nombre de la etiqueta.");
      return;
    }

    const payload = {
      empresa_id: empresaId,
      nombre: formEtiqueta.nombre.trim(),
      tipo: formEtiqueta.tipo,
      activo: true,
    };

    const { error } = await supabase
      .from("etiquetas_contables")
      .insert([payload]);

    if (error) {
      console.error(error);
      alert("No se pudo guardar la etiqueta.");
      return;
    }

    setFormEtiqueta({
      nombre: "",
      tipo: "ingreso",
    });

    cargarDatos();
  };

  const guardarRegla = async () => {
    if (!validarEmpresa()) return;

    if (!formRegla.valor.trim()) {
      alert("Escribe el texto que debe buscar la regla.");
      return;
    }

    if (!formRegla.etiqueta_id) {
      alert("Selecciona una etiqueta.");
      return;
    }

    if (!formRegla.cuenta_contable.trim()) {
      alert("Selecciona una cuenta contable del catálogo.");
      return;
    }

    const payload = {
      empresa_id: empresaId,
      tipo: formRegla.tipo,
      campo: formRegla.campo,
      operador: formRegla.operador,
      valor: formRegla.valor.trim(),
      etiqueta_id: Number(formRegla.etiqueta_id),
      cuenta_contable: formRegla.cuenta_contable.trim(),
      activo: true,
    };

    const { error } = await supabase.from("reglas_contables").insert([payload]);

    if (error) {
      console.error(error);
      alert("No se pudo guardar la regla.");
      return;
    }

    setFormRegla({
      tipo: "ingreso",
      campo: "descripcion",
      operador: "contiene",
      valor: "",
      etiqueta_id: "",
      cuenta_contable: "",
    });

    setMostrarSugerenciasCuenta(false);
    cargarDatos();
  };

  const cambiarEstadoEtiqueta = async (item) => {
    const { error } = await supabase
      .from("etiquetas_contables")
      .update({ activo: !item.activo })
      .eq("id", item.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo cambiar el estado de la etiqueta.");
      return;
    }

    cargarDatos();
  };

  const cambiarEstadoRegla = async (item) => {
    const { error } = await supabase
      .from("reglas_contables")
      .update({ activo: !item.activo })
      .eq("id", item.id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo cambiar el estado de la regla.");
      return;
    }

    cargarDatos();
  };

  const eliminarRegla = async (id) => {
    if (!confirm("¿Eliminar esta regla?")) return;

    const { error } = await supabase
      .from("reglas_contables")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresaId);

    if (error) {
      console.error(error);
      alert("No se pudo eliminar la regla.");
      return;
    }

    cargarDatos();
  };

  const seleccionarCuenta = (cuenta) => {
    setFormRegla({
      ...formRegla,
      cuenta_contable: `${cuenta.codigo} - ${cuenta.cuenta}`,
    });
    setMostrarSugerenciasCuenta(false);
  };

  const etiquetasFiltradas = etiquetas.filter(
    (e) => e.tipo === formRegla.tipo && e.activo
  );

  const textoCuenta = normalizarTexto(formRegla.cuenta_contable);

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
    .slice(0, 40);

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🏷️ Reglas contables</h1>
            <p className="subtitle">
              Etiquetas y reglas automáticas
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
              onClick={() => navigate("/catalogo-contable")}
            >
              📚 Catálogo
            </button>

            <button
              className="btn btn-secondary"
              style={thinButtonStyle}
              onClick={() => navigate("/clasificacion-compras")}
            >
              🧾 Compras
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
              Debes seleccionar una empresa antes de crear etiquetas o reglas.
            </p>
          </div>
        )}

        <div className="grid grid-2" style={{ marginBottom: "20px" }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Crear etiqueta</h3>

            <div className="grid">
              <div>
                <label className="label">Tipo</label>
                <select
                  className="select"
                  style={thinInputStyle}
                  value={formEtiqueta.tipo}
                  onChange={(e) =>
                    setFormEtiqueta({ ...formEtiqueta, tipo: e.target.value })
                  }
                  disabled={!empresaId}
                >
                  <option value="ingreso">Ingreso</option>
                  <option value="gasto">Gasto / Compra</option>
                  <option value="planilla">Planilla</option>
                  <option value="banco">Banco</option>
                </select>
              </div>

              <div>
                <label className="label">Nombre de etiqueta</label>
                <input
                  className="input"
                  style={thinInputStyle}
                  placeholder="Ej. Alquileres, Servicios dentales..."
                  value={formEtiqueta.nombre}
                  onChange={(e) =>
                    setFormEtiqueta({ ...formEtiqueta, nombre: e.target.value })
                  }
                  disabled={!empresaId}
                />
              </div>

              <button
                className="btn btn-primary"
                style={thinButtonStyle}
                onClick={guardarEtiqueta}
                disabled={!empresaId}
              >
                Guardar etiqueta
              </button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Crear regla</h3>

            <p className="subtitle" style={{ marginBottom: "12px" }}>
              Cuentas de movimiento cargadas: {cuentasCatalogo.length}
            </p>

            <div className="grid grid-2">
              <div>
                <label className="label">Tipo</label>
                <select
                  className="select"
                  style={thinInputStyle}
                  value={formRegla.tipo}
                  onChange={(e) =>
                    setFormRegla({
                      ...formRegla,
                      tipo: e.target.value,
                      etiqueta_id: "",
                    })
                  }
                  disabled={!empresaId}
                >
                  <option value="ingreso">Ingreso</option>
                  <option value="gasto">Gasto / Compra</option>
                  <option value="planilla">Planilla</option>
                  <option value="banco">Banco</option>
                </select>
              </div>

              <div>
                <label className="label">Campo a revisar</label>
                <select
                  className="select"
                  style={thinInputStyle}
                  value={formRegla.campo}
                  onChange={(e) =>
                    setFormRegla({ ...formRegla, campo: e.target.value })
                  }
                  disabled={!empresaId}
                >
                  <option value="descripcion">Descripción / Item</option>
                  <option value="nombre">Nombre / proveedor / cliente</option>
                  <option value="proveedor">Proveedor</option>
                  <option value="documento">Documento</option>
                  <option value="nit">NIT / documento</option>
                  <option value="codigo">Código producto</option>
                </select>
              </div>

              <div>
                <label className="label">Operador</label>
                <select
                  className="select"
                  style={thinInputStyle}
                  value={formRegla.operador}
                  onChange={(e) =>
                    setFormRegla({ ...formRegla, operador: e.target.value })
                  }
                  disabled={!empresaId}
                >
                  <option value="contiene">Contiene</option>
                  <option value="igual">Igual a</option>
                  <option value="inicia_con">Inicia con</option>
                  <option value="termina_con">Termina con</option>
                </select>
              </div>

              <div>
                <label className="label">Texto a buscar</label>
                <input
                  className="input"
                  style={thinInputStyle}
                  placeholder="Ej. ARRENDAMIENTO"
                  value={formRegla.valor}
                  onChange={(e) =>
                    setFormRegla({ ...formRegla, valor: e.target.value })
                  }
                  disabled={!empresaId}
                />
              </div>

              <div>
                <label className="label">Etiqueta resultante</label>
                <select
                  className="select"
                  style={thinInputStyle}
                  value={formRegla.etiqueta_id}
                  onChange={(e) =>
                    setFormRegla({ ...formRegla, etiqueta_id: e.target.value })
                  }
                  disabled={!empresaId}
                >
                  <option value="">Seleccionar etiqueta</option>
                  {etiquetasFiltradas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ position: "relative" }}>
                <label className="label">Cuenta contable</label>
                <input
                  className="input"
                  style={thinInputStyle}
                  placeholder="Escribe código o cuenta. Ej. 1101"
                  value={formRegla.cuenta_contable}
                  onFocus={() => setMostrarSugerenciasCuenta(true)}
                  onChange={(e) => {
                    setFormRegla({
                      ...formRegla,
                      cuenta_contable: e.target.value,
                    });
                    setMostrarSugerenciasCuenta(true);
                  }}
                  disabled={!empresaId}
                />

                {mostrarSugerenciasCuenta && empresaId && (
                  <div
                    style={{
                      position: "absolute",
                      top: "74px",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      border: "1px solid #ddd6fe",
                      borderRadius: "12px",
                      boxShadow: "0 10px 25px rgba(15, 23, 42, 0.15)",
                      zIndex: 50,
                      maxHeight: "360px",
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
                          <div style={{ fontWeight: 700, color: "#334155" }}>
                            {cuenta.codigo}
                          </div>
                          <div style={{ fontSize: "13px", color: "#64748b" }}>
                            {cuenta.cuenta}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: "12px", color: "#64748b" }}>
                        No se encontraron cuentas de movimiento.
                      </div>
                    )}

                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        navigate("/catalogo-contable");
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        border: "none",
                        background: "#f8fafc",
                        color: "#0f766e",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      ➕ Crear o editar cuenta en catálogo
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="actions" style={{ marginTop: "14px" }}>
              <button
                className="btn btn-success"
                style={thinButtonStyle}
                onClick={guardarRegla}
                disabled={!empresaId}
              >
                Guardar regla
              </button>

              <button
                className="btn btn-secondary"
                style={thinButtonStyle}
                onClick={() => setMostrarSugerenciasCuenta(false)}
                disabled={!empresaId}
              >
                Cerrar lista
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Etiquetas creadas</h3>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Etiqueta</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {etiquetas.length > 0 ? (
                    etiquetas.map((item) => (
                      <tr key={item.id}>
                        <td>{item.tipo}</td>
                        <td>{item.nombre}</td>
                        <td>
                          <span className="badge">
                            {item.activo ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary"
                            style={thinButtonStyle}
                            onClick={() => cambiarEstadoEtiqueta(item)}
                          >
                            {item.activo ? "Desactivar" : "Activar"}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="4"
                        style={{ textAlign: "center", color: "#64748b" }}
                      >
                        No hay etiquetas creadas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Reglas creadas</h3>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Condición</th>
                    <th>Etiqueta</th>
                    <th>Cuenta</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {reglas.length > 0 ? (
                    reglas.map((item) => (
                      <tr key={item.id}>
                        <td>{item.tipo}</td>
                        <td>
                          {item.campo} {item.operador} "{item.valor}"
                        </td>
                        <td>{item.etiquetas_contables?.nombre || "-"}</td>
                        <td>{item.cuenta_contable || "-"}</td>
                        <td>
                          <span className="badge">
                            {item.activo ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="btn btn-secondary"
                              style={thinButtonStyle}
                              onClick={() => cambiarEstadoRegla(item)}
                            >
                              {item.activo ? "Desactivar" : "Activar"}
                            </button>

                            <button
                              className="btn btn-secondary"
                              style={thinButtonStyle}
                              onClick={() => eliminarRegla(item.id)}
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
                        colSpan="6"
                        style={{ textAlign: "center", color: "#64748b" }}
                      >
                        No hay reglas creadas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {loading && (
              <p style={{ marginTop: "12px", color: "#64748b" }}>
                Cargando...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
