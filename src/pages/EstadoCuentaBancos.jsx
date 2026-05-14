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

const crearFila = () => ({
  id_local: crypto.randomUUID(),
  fecha: hoy(),
  descripcion: "",
  cargos: "",
  abonos: "",
  saldo: "",
});

const excelDateToISO = (excelDate) => {
  if (!excelDate && excelDate !== 0) return hoy();

  if (
    typeof excelDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(excelDate.trim())
  ) {
    return excelDate.trim();
  }

  if (excelDate instanceof Date && !isNaN(excelDate.getTime())) {
    const yyyy = excelDate.getFullYear();
    const mm = String(excelDate.getMonth() + 1).padStart(2, "0");
    const dd = String(excelDate.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (typeof excelDate === "string") {
    const valor = excelDate.trim();
    const matchLatino = valor.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

    if (matchLatino) {
      const dd = String(matchLatino[1]).padStart(2, "0");
      const mm = String(matchLatino[2]).padStart(2, "0");
      const yyyy = matchLatino[3];
      return `${yyyy}-${mm}-${dd}`;
    }

    const parsed = new Date(valor);
    if (!isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  if (typeof excelDate === "number") {
    const fecha = XLSX.SSF.parse_date_code(excelDate);
    if (fecha) {
      const yyyy = fecha.y;
      const mm = String(fecha.m).padStart(2, "0");
      const dd = String(fecha.d).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return hoy();
};

const limpiarNumero = (valor) => {
  if (valor === null || valor === undefined || valor === "") return "";
  return String(valor).replace(/,/g, "").trim();
};

const dinero = (valor) => `$${Number(valor || 0).toFixed(2)}`;

const sumarUnDiaISO = (fechaISO) => {
  if (!fechaISO) return hoy();

  const d = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return hoy();

  d.setDate(d.getDate() + 1);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
};

const normalizarTexto = (txt) =>
  String(txt || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

const llaveMovimiento = (fila) =>
  [
    fila.fecha,
    normalizarTexto(fila.descripcion),
    Number(fila.cargos || 0).toFixed(2),
    Number(fila.abonos || 0).toFixed(2),
  ].join("|");

const quitarDuplicadosMovimientos = (lista = []) => {
  const mapa = new Map();

  lista.forEach((fila) => {
    const key = llaveMovimiento(fila);
    if (!mapa.has(key)) {
      mapa.set(key, fila);
    }
  });

  return Array.from(mapa.values());
};

const ordenarMovimientos = (lista = []) => {
  return [...lista].sort((a, b) => {
    const fa = String(a.fecha || "");
    const fb = String(b.fecha || "");

    if (fa !== fb) return fa.localeCompare(fb);

    return String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
};

const rangoFechasMovimientos = (lista = []) => {
  const fechas = lista
    .map((fila) => fila.fecha)
    .filter(Boolean)
    .sort();

  return {
    inicio: fechas[0] || hoy(),
    fin: fechas[fechas.length - 1] || hoy(),
  };
};


export default function EstadoCuentaBancos() {
  const navigate = useNavigate();

  const [empresaId, setEmpresaId] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [fechaInicio, setFechaInicio] = useState(hoy());
  const [fechaFin, setFechaFin] = useState(hoy());
  const [saldoInicial, setSaldoInicial] = useState("");
  const [observacion, setObservacion] = useState("");

  const [estadoActualId, setEstadoActualId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [cargandoEstado, setCargandoEstado] = useState(false);

  const [empresas, setEmpresas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [historial, setHistorial] = useState([]);

  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [busquedaCuenta, setBusquedaCuenta] = useState("");
  const [busquedaHistorial, setBusquedaHistorial] = useState("");
  const [mensajeCarga, setMensajeCarga] = useState("");

  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalDetalle, setModalDetalle] = useState(false);
  const [filas, setFilas] = useState([crearFila()]);

  useEffect(() => {
    cargarEmpresas();
    cargarEmpresaSeleccionada();
  }, []);

  useEffect(() => {
    if (empresaId) {
      cargarCuentasPorEmpresa(empresaId);
      cargarHistorial(empresaId);
    } else {
      setCuentas([]);
      setHistorial([]);
      setCuentaId("");
    }
  }, [empresaId]);

  useEffect(() => {
    if (!cuentaId && cuentas.length > 0) {
      setCuentaId(String(cuentas[0].id));
    }
  }, [cuentas, cuentaId]);

  const cargarEmpresas = async () => {
    const { data, error } = await supabase
      .from("empresas")
      .select("id, nombre")
      .order("nombre", { ascending: true });

    if (error) {
      console.error("Error cargando empresas:", error);
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
      console.error("Error leyendo empresaSeleccionada:", e);
    }
  };

  const cargarCuentasPorEmpresa = async (empresa_id) => {
    const { data, error } = await supabase
      .from("cuentas_bancarias")
      .select("id, nombre_banco, nombre_cuenta, numero_cuenta, activo")
      .eq("empresa_id", Number(empresa_id))
      .order("id", { ascending: true });

    if (error) {
      console.error("Error cargando cuentas:", error);
      return;
    }

    setCuentas((data || []).filter((c) => c.activo !== false));
  };

  const cargarHistorial = async (empresa_id) => {
    const { data, error } = await supabase
      .from("estado_cuenta_banco")
      .select(`
        id,
        empresa_id,
        cuenta_bancaria_id,
        fecha_inicio,
        fecha_fin,
        saldo_inicial,
        saldo_final,
        observacion,
        created_at
      `)
      .eq("empresa_id", Number(empresa_id))
      .order("id", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Error cargando historial:", error);
      return;
    }

    setHistorial(data || []);
  };

  const obtenerNombreCuenta = (c) => {
    if (!c) return "";
    if (c.nombre_banco && c.nombre_cuenta) return `${c.nombre_banco} - ${c.nombre_cuenta}`;
    if (c.nombre_banco && c.numero_cuenta) return `${c.nombre_banco} - ${c.numero_cuenta}`;
    return c.nombre_banco || c.nombre_cuenta || c.numero_cuenta || `Cuenta ${c.id}`;
  };

  const recalcularSaldos = (lista, saldoBase) => {
    let saldoCorriente = Number(saldoBase || 0);

    return lista.map((fila) => {
      const cargos = Number(fila.cargos || 0);
      const abonos = Number(fila.abonos || 0);

      saldoCorriente = saldoCorriente + abonos - cargos;

      return {
        ...fila,
        cargos: String(fila.cargos ?? ""),
        abonos: String(fila.abonos ?? ""),
        saldo: saldoCorriente.toFixed(2),
      };
    });
  };

  const agregarFila = () => setFilas((prev) => [...prev, crearFila()]);

  const eliminarFila = (id_local) => {
    const nuevas = filas.filter((f) => f.id_local !== id_local);
    setFilas(nuevas.length ? recalcularSaldos(nuevas, saldoInicial) : [crearFila()]);
  };

  const actualizarFila = (id_local, campo, valor) => {
    const nuevas = filas.map((f) =>
      f.id_local === id_local ? { ...f, [campo]: valor } : f
    );
    setFilas(recalcularSaldos(nuevas, saldoInicial));
  };

  useEffect(() => {
    setFilas((prev) => recalcularSaldos(prev, saldoInicial));
  }, [saldoInicial]);

  const limpiarFormulario = () => {
    setEstadoActualId(null);
    setFechaInicio(hoy());
    setFechaFin(hoy());
    setSaldoInicial("");
    setObservacion("");
    setMensajeCarga("");
    setFilas([crearFila()]);
  };

  const prepararNuevoEstado = () => {
    const ultimo = cuentaId ? ultimoPorCuenta.get(Number(cuentaId)) : null;

    setEstadoActualId(null);
    setMensajeCarga("");
    setObservacion("");
    setFilas([crearFila()]);

    if (ultimo) {
      const siguienteFecha = sumarUnDiaISO(ultimo.fecha_fin);

      setFechaInicio(siguienteFecha);
      setFechaFin(siguienteFecha);
      setSaldoInicial(String(Number(ultimo.saldo_final || 0).toFixed(2)));
    } else {
      setFechaInicio(hoy());
      setFechaFin(hoy());
      setSaldoInicial("");
    }

    setModalNuevo(true);
  };

  const continuarNuevoEstado = () => {
    if (!cuentaId) {
      alert("Seleccioná una cuenta bancaria.");
      return;
    }

    if (!fechaInicio || !fechaFin) {
      alert("Seleccioná fecha inicio y fecha fin.");
      return;
    }

    setModalNuevo(false);
    setModalDetalle(true);
  };

  const saldoFinalCalculado = useMemo(() => {
    if (!filas.length) return Number(saldoInicial || 0).toFixed(2);
    const ultima = filas[filas.length - 1];
    return Number(ultima.saldo || saldoInicial || 0).toFixed(2);
  }, [filas, saldoInicial]);

  const buscarEstadoExistenteMismoPeriodo = async () => {
    const { data, error } = await supabase
      .from("estado_cuenta_banco")
      .select("id")
      .eq("empresa_id", Number(empresaId))
      .eq("cuenta_bancaria_id", Number(cuentaId))
      .eq("fecha_inicio", fechaInicio)
      .eq("fecha_fin", fechaFin)
      .limit(1);

    if (error) throw error;

    const existente = data?.[0];

    if (!existente) return null;
    if (estadoActualId && Number(existente.id) === Number(estadoActualId)) return null;

    return existente.id;
  };

  const guardarEstado = async () => {
    if (!empresaId) return alert("Seleccioná una empresa.");
    if (!cuentaId) return alert("Seleccioná una cuenta bancaria.");
    if (!fechaInicio || !fechaFin) return alert("Seleccioná fecha inicio y fecha fin.");

    const filasValidasBase = filas.filter(
      (f) =>
        f.fecha &&
        f.descripcion.trim() &&
        (Number(f.cargos || 0) > 0 || Number(f.abonos || 0) > 0)
    );

    const filasValidas = recalcularSaldos(
      ordenarMovimientos(quitarDuplicadosMovimientos(filasValidasBase)),
      saldoInicial
    );

    if (filasValidas.length === 0) {
      alert("Agregá al menos una fila válida.");
      return;
    }

    const rango = rangoFechasMovimientos(filasValidas);

    if (rango.inicio && rango.fin) {
      setFechaInicio(rango.inicio);
      setFechaFin(rango.fin);
    }

    setGuardando(true);

    try {
      const saldoFinal = Number(filasValidas[filasValidas.length - 1].saldo || 0);
      const estadoDuplicadoId = !estadoActualId
        ? await buscarEstadoExistenteMismoPeriodo()
        : null;

      let estadoId = estadoActualId || estadoDuplicadoId;

      if (estadoId) {
        const { error: errorUpdate } = await supabase
          .from("estado_cuenta_banco")
          .update({
            empresa_id: Number(empresaId),
            cuenta_bancaria_id: Number(cuentaId),
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            saldo_inicial: Number(saldoInicial || 0),
            saldo_final: saldoFinal,
            observacion: observacion || null,
          })
          .eq("id", estadoId);

        if (errorUpdate) throw errorUpdate;

        const { data: filasExistentes, error: errorFetch } = await supabase
          .from("estado_cuenta_banco_detalle")
          .select("id")
          .eq("estado_id", estadoId);

        if (errorFetch) throw errorFetch;

        const idsFilas = (filasExistentes || []).map((f) => f.id);

        if (idsFilas.length > 0) {
          const { error: errorConciliacion } = await supabase
            .from("conciliacion_corte_banco_detalle")
            .delete()
            .in("estado_banco_detalle_id", idsFilas);

          if (errorConciliacion) throw errorConciliacion;
        }

        const { error: errorDelete } = await supabase
          .from("estado_cuenta_banco_detalle")
          .delete()
          .eq("estado_id", estadoId);

        if (errorDelete) throw errorDelete;
      } else {
        const { data, error } = await supabase
          .from("estado_cuenta_banco")
          .insert([
            {
              empresa_id: Number(empresaId),
              cuenta_bancaria_id: Number(cuentaId),
              fecha_inicio: fechaInicio,
              fecha_fin: fechaFin,
              saldo_inicial: Number(saldoInicial || 0),
              saldo_final: saldoFinal,
              observacion: observacion || null,
            },
          ])
          .select()
          .single();

        if (error) throw error;
        estadoId = data.id;
        setEstadoActualId(data.id);
      }

      const detalle = filasValidas.map((fila, index) => ({
        estado_id: estadoId,
        fecha: fila.fecha,
        descripcion: fila.descripcion,
        cargos: Number(fila.cargos || 0),
        abonos: Number(fila.abonos || 0),
        saldo: Number(fila.saldo || 0),
        orden: index + 1,
        conciliado: false,
      }));

      const { error: errorDetalle } = await supabase
        .from("estado_cuenta_banco_detalle")
        .insert(detalle);

      if (errorDetalle) throw errorDetalle;

      alert(
        estadoActualId || estadoDuplicadoId
          ? "Estado actualizado correctamente."
          : "Estado guardado correctamente."
      );

      await cargarHistorial(empresaId);
      await cargarEstadoCompleto(estadoId, false);
    } catch (error) {
      console.error("Error guardando estado:", error);
      alert(`Error guardando estado: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const cargarEstadoCompleto = async (estadoId, abrirModal = true) => {
    setCargandoEstado(true);

    try {
      const { data: estado, error: errorEstado } = await supabase
        .from("estado_cuenta_banco")
        .select("*")
        .eq("id", estadoId)
        .single();

      if (errorEstado) throw errorEstado;

      const { data: detalle, error: errorDetalle } = await supabase
        .from("estado_cuenta_banco_detalle")
        .select("*")
        .eq("estado_id", estadoId)
        .order("orden", { ascending: true });

      if (errorDetalle) throw errorDetalle;

      setEstadoActualId(estado.id);
      setEmpresaId(String(estado.empresa_id));
      setCuentaId(String(estado.cuenta_bancaria_id));
      setFechaInicio(estado.fecha_inicio);
      setFechaFin(estado.fecha_fin);
      setSaldoInicial(String(estado.saldo_inicial ?? ""));
      setObservacion(estado.observacion || "");

      if (!detalle || detalle.length === 0) {
        setFilas([crearFila()]);
      } else {
        const filasCargadas = detalle.map((item) => ({
          id_local: crypto.randomUUID(),
          fecha: item.fecha,
          descripcion: item.descripcion || "",
          cargos: String(item.cargos ?? ""),
          abonos: String(item.abonos ?? ""),
          saldo: "",
        }));

        const filasRecalculadas = recalcularSaldos(filasCargadas, estado.saldo_inicial);
        setFilas(filasRecalculadas);

        const saldoRecalculado = Number(
          filasRecalculadas[filasRecalculadas.length - 1]?.saldo || 0
        );

        if (
          Number.isFinite(saldoRecalculado) &&
          Math.abs(saldoRecalculado - Number(estado.saldo_final || 0)) > 0.01
        ) {
          // Corrige encabezados viejos que quedaron con saldo final diferente al detalle.
          await supabase
            .from("estado_cuenta_banco")
            .update({ saldo_final: saldoRecalculado })
            .eq("id", estado.id);

          setHistorial((prev) =>
            prev.map((h) =>
              Number(h.id) === Number(estado.id)
                ? { ...h, saldo_final: saldoRecalculado }
                : h
            )
          );
        }
      }

      if (abrirModal) setModalDetalle(true);
    } catch (error) {
      console.error("Error general cargando estado:", error);
      alert(`Error cargando estado: ${error.message}`);
    } finally {
      setCargandoEstado(false);
    }
  };

  const eliminarEstado = async (estadoId) => {
    if (!window.confirm("¿Eliminar este estado de cuenta completo?")) return;

    const { error } = await supabase.from("estado_cuenta_banco").delete().eq("id", estadoId);

    if (error) {
      alert(`Error al eliminar: ${error.message}`);
      return;
    }

    if (estadoActualId === estadoId) limpiarFormulario();

    await cargarHistorial(empresaId);
    alert("Estado eliminado correctamente.");
  };

  const manejarImportacionExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!cuentaId) {
      alert("Seleccioná una cuenta bancaria primero.");
      e.target.value = "";
      return;
    }

    setCargando(true);
    setMensajeCarga(`Procesando: ${file.name}`);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      const nuevasFilas = json.map((fila) => ({
        id_local: crypto.randomUUID(),
        fecha: excelDateToISO(fila.Fecha || fila.fecha),
        descripcion: String(fila.Descripcion || fila.descripcion || "").trim(),
        cargos: limpiarNumero(fila.Cargos || fila.cargos),
        abonos: limpiarNumero(fila.Abonos || fila.abonos),
        saldo: "",
      }));

      const validasBase = nuevasFilas.filter(
        (f) =>
          f.fecha &&
          f.descripcion &&
          (Number(f.cargos || 0) > 0 || Number(f.abonos || 0) > 0)
      );

      const validas = ordenarMovimientos(quitarDuplicadosMovimientos(validasBase));

      if (validas.length === 0) {
        setMensajeCarga("El archivo no tiene filas válidas.");
        alert("El archivo no tiene filas válidas.");
        return;
      }

      const rango = rangoFechasMovimientos(validas);
      setFechaInicio(rango.inicio);
      setFechaFin(rango.fin);

      const filasRecalculadas = recalcularSaldos(validas, saldoInicial);

      setFilas(filasRecalculadas);

      const duplicadas = validasBase.length - validas.length;

      setMensajeCarga(
        `Excel importado correctamente. Filas válidas: ${validas.length}${
          duplicadas > 0 ? ` · Duplicadas omitidas: ${duplicadas}` : ""
        } · Período detectado: ${rango.inicio} al ${rango.fin}`
      );

      setModalNuevo(false);
      setModalDetalle(true);
    } catch (error) {
      console.error("Error importando Excel:", error);
      setMensajeCarga("No se pudo importar el Excel.");
      alert("No se pudo importar el Excel.");
    } finally {
      setCargando(false);
      e.target.value = "";
    }
  };

  const exportarPlantillaExcel = () => {
    const data = [
      { Fecha: hoy(), Descripcion: "Depósito POS", Cargos: 0, Abonos: 125.5, Saldo: "" },
      { Fecha: hoy(), Descripcion: "Cargo bancario", Cargos: 5.0, Abonos: 0, Saldo: "" },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EstadoCuenta");
    XLSX.writeFile(wb, "Plantilla_Estado_Cuenta_Banco.xlsx");
  };

  const cuentaSeleccionada = useMemo(
    () => cuentas.find((c) => String(c.id) === String(cuentaId)) || null,
    [cuentas, cuentaId]
  );

  const cuentasFiltradas = useMemo(() => {
    const t = busquedaCuenta.trim().toLowerCase();
    if (!t) return cuentas;
    return cuentas.filter((c) => obtenerNombreCuenta(c).toLowerCase().includes(t));
  }, [cuentas, busquedaCuenta]);

  const historialConCuenta = useMemo(() => {
    return (historial || []).map((estado) => {
      const cuenta = cuentas.find((c) => Number(c.id) === Number(estado.cuenta_bancaria_id));
      return {
        ...estado,
        cuenta,
        nombreCuenta: obtenerNombreCuenta(cuenta) || `Cuenta ${estado.cuenta_bancaria_id}`,
      };
    });
  }, [historial, cuentas]);

  const historialDeCuenta = useMemo(() => {
    let data = historialConCuenta.filter(
      (estado) => Number(estado.cuenta_bancaria_id) === Number(cuentaId)
    );

    if (filtroDesde) data = data.filter((estado) => estado.fecha_fin >= filtroDesde);
    if (filtroHasta) data = data.filter((estado) => estado.fecha_inicio <= filtroHasta);

    if (busquedaHistorial.trim()) {
      const t = busquedaHistorial.toLowerCase();
      data = data.filter(
        (estado) =>
          String(estado.id || "").includes(t) ||
          String(estado.fecha_inicio || "").toLowerCase().includes(t) ||
          String(estado.fecha_fin || "").toLowerCase().includes(t) ||
          String(estado.saldo_inicial || "").toLowerCase().includes(t) ||
          String(estado.saldo_final || "").toLowerCase().includes(t) ||
          String(estado.observacion || "").toLowerCase().includes(t)
      );
    }

    return data.sort((a, b) => Number(b.id) - Number(a.id));
  }, [historialConCuenta, cuentaId, filtroDesde, filtroHasta, busquedaHistorial]);

  const ultimoPorCuenta = useMemo(() => {
    const mapa = new Map();
    historialConCuenta.forEach((estado) => {
      const key = Number(estado.cuenta_bancaria_id);
      const anterior = mapa.get(key);
      if (!anterior || Number(estado.id) > Number(anterior.id)) mapa.set(key, estado);
    });
    return mapa;
  }, [historialConCuenta]);

  const resumenFilas = useMemo(() => {
    const depositos = filas.reduce((acc, f) => acc + Number(f.abonos || 0), 0);
    const retiros = filas.reduce((acc, f) => acc + Number(f.cargos || 0), 0);
    const movimientos = filas.filter(
      (f) => f.descripcion && (Number(f.cargos || 0) > 0 || Number(f.abonos || 0) > 0)
    ).length;

    return { depositos, retiros, movimientos };
  }, [filas]);

  const ultimoSeleccionado = cuentaId ? ultimoPorCuenta.get(Number(cuentaId)) : null;

  return (
    <div className="page" style={{ minHeight: "100vh", background: "#f5f6fb" }}>
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🏦 Estados de Cuenta Bancarios</h1>
            <p className="subtitle">
              Selecciona una cuenta, sube Excel y consulta estados por rango de fechas.
            </p>
          </div>

          <div className="actions">
            <button className="btn btn-secondary" onClick={() => navigate("/inicio")}>
              Ir a Inicio
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "320px 1fr",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <div className="card" style={{ position: "sticky", top: "18px" }}>
            <h2 className="module-title" style={{ marginBottom: "8px" }}>
              Cuentas bancarias
            </h2>

            <p className="module-text" style={{ marginTop: 0 }}>
              Da clic en una cuenta para ver su historial.
            </p>

            <div style={{ marginBottom: "12px" }}>
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

            <div style={{ marginBottom: "12px" }}>
              <label className="label">Buscar cuenta</label>
              <input
                className="input"
                value={busquedaCuenta}
                onChange={(e) => setBusquedaCuenta(e.target.value)}
                placeholder="Banco o cuenta..."
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                maxHeight: "66vh",
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {cuentasFiltradas.length === 0 ? (
                <p className="module-text">No hay cuentas para mostrar.</p>
              ) : (
                cuentasFiltradas.map((cuenta) => {
                  const activa = String(cuenta.id) === String(cuentaId);
                  const ultimo = ultimoPorCuenta.get(Number(cuenta.id));

                  return (
                    <button
                      key={cuenta.id}
                      type="button"
                      onClick={() => {
                        setCuentaId(String(cuenta.id));
                        setEstadoActualId(null);
                        setMensajeCarga("");
                      }}
                      style={{
                        border: activa ? "2px solid #70527f" : "1px solid #e5d9ef",
                        borderRadius: "16px",
                        padding: "12px",
                        textAlign: "left",
                        background: activa ? "#f2ebf7" : "#ffffff",
                        cursor: "pointer",
                        boxShadow: activa
                          ? "0 12px 24px rgba(112,82,127,0.16)"
                          : "0 6px 18px rgba(15,23,42,0.05)",
                      }}
                    >
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <span
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "12px",
                            background: activa ? "#70527f" : "#efe7f4",
                            color: activa ? "white" : "#70527f",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "18px",
                          }}
                        >
                          🏦
                        </span>

                        <div style={{ minWidth: 0 }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: "11px",
                              color: "#64748b",
                              fontWeight: 700,
                              textTransform: "uppercase",
                            }}
                          >
                            {cuenta.nombre_banco || "Banco"}
                          </p>
                          <h3 style={{ margin: 0, fontSize: "14px", color: "#1f2937" }}>
                            {obtenerNombreCuenta(cuenta)}
                          </h3>
                        </div>
                      </div>

                      <div style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}>
                        {ultimo ? (
                          <>
                            Último #{ultimo.id} · {ultimo.fecha_inicio} al {ultimo.fecha_fin}
                            <br />
                            <b style={{ color: "#111827" }}>
                              Saldo final {dinero(ultimo.saldo_final)}
                            </b>
                          </>
                        ) : (
                          <b style={{ color: "#991b1b" }}>Sin estados cargados</b>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div className="card" style={{ marginBottom: "18px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "start",
                }}
              >
                <div>
                  <h2 className="module-title" style={{ marginBottom: "4px" }}>
                    {cuentaSeleccionada ? obtenerNombreCuenta(cuentaSeleccionada) : "Selecciona una cuenta"}
                  </h2>

                  <p className="module-text" style={{ margin: 0 }}>
                    {ultimoSeleccionado
                      ? `Último estado #${ultimoSeleccionado.id}: ${ultimoSeleccionado.fecha_inicio} al ${ultimoSeleccionado.fecha_fin}`
                      : "No hay estados guardados para esta cuenta."}
                  </p>
                </div>

                <div className="actions">
                  <button className="btn btn-primary" onClick={prepararNuevoEstado} disabled={!cuentaId}>
                    Nuevo
                  </button>

                  <button className="btn btn-secondary" onClick={exportarPlantillaExcel}>
                    Plantilla
                  </button>
                </div>
              </div>

              <div
                className="grid grid-4"
                style={{ marginTop: "16px" }}
              >
                <div className="stat-card">
                  <p className="stat-title">Último saldo final</p>
                  <p className="stat-value">
                    {ultimoSeleccionado ? dinero(ultimoSeleccionado.saldo_final) : "$0.00"}
                  </p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Estados guardados</p>
                  <p className="stat-value">{historialDeCuenta.length}</p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Estado actual</p>
                  <p className="module-text" style={{ margin: 0 }}>
                    {estadoActualId ? `Editando #${estadoActualId}` : "Sin estado abierto"}
                  </p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Período en edición</p>
                  <p className="module-text" style={{ margin: 0 }}>
                    {fechaInicio} al {fechaFin}
                  </p>
                </div>
              </div>

              {mensajeCarga && (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "10px 12px",
                    borderRadius: "14px",
                    background: "#f2ebf7",
                    color: "#513860",
                    fontWeight: 700,
                  }}
                >
                  {mensajeCarga}
                </div>
              )}
            </div>

            <div className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "end",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <h2 className="module-title" style={{ marginBottom: "4px" }}>
                    Historial de la cuenta
                  </h2>
                  <p className="module-text" style={{ margin: 0 }}>
                    Filtra por fecha y abre el estado que necesites.
                  </p>
                </div>

                <button className="btn btn-secondary" onClick={() => cargarHistorial(empresaId)}>
                  Actualizar
                </button>
              </div>

              <div className="grid grid-3" style={{ marginBottom: "14px" }}>
                <div>
                  <label className="label">Desde</label>
                  <input type="date" className="input" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
                </div>

                <div>
                  <label className="label">Hasta</label>
                  <input type="date" className="input" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
                </div>

                <div>
                  <label className="label">Buscar</label>
                  <input className="input" value={busquedaHistorial} onChange={(e) => setBusquedaHistorial(e.target.value)} placeholder="ID, saldo, observación..." />
                </div>
              </div>

              {historialDeCuenta.length === 0 ? (
                <p className="module-text">No hay estados para esta cuenta con esos filtros.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Período</th>
                        <th>Saldo inicial</th>
                        <th>Saldo final</th>
                        <th>Observación</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>

                    <tbody>
                      {historialDeCuenta.map((estado) => (
                        <tr key={estado.id}>
                          <td>#{estado.id}</td>
                          <td>{estado.fecha_inicio} al {estado.fecha_fin}</td>
                          <td>{dinero(estado.saldo_inicial)}</td>
                          <td>{dinero(estado.saldo_final)}</td>
                          <td>{estado.observacion || "-"}</td>
                          <td>
                            <div className="actions">
                              <button className="btn btn-primary" onClick={() => cargarEstadoCompleto(estado.id, true)}>
                                Ver movimientos
                              </button>

                              <button className="btn btn-secondary" onClick={() => eliminarEstado(estado.id)}>
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {modalNuevo && (
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
            onClick={() => setModalNuevo(false)}
          >
            <div
              className="card"
              style={{
                width: "min(820px, 96vw)",
                maxHeight: "90vh",
                overflow: "auto",
                borderRadius: "20px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <h2 className="module-title" style={{ marginBottom: "4px" }}>
                    Nuevo estado bancario
                  </h2>
                  <p className="module-text" style={{ margin: 0 }}>
                    {cuentaSeleccionada
                      ? obtenerNombreCuenta(cuentaSeleccionada)
                      : "Selecciona una cuenta bancaria"}
                  </p>

                  {ultimoSeleccionado && (
                    <p className="module-text" style={{ margin: "4px 0 0 0" }}>
                      Último guardado: {ultimoSeleccionado.fecha_inicio} al{" "}
                      {ultimoSeleccionado.fecha_fin} · Saldo final{" "}
                      {dinero(ultimoSeleccionado.saldo_final)}
                    </p>
                  )}
                </div>

                <button
                  className="btn btn-secondary"
                  onClick={() => setModalNuevo(false)}
                >
                  Cerrar
                </button>
              </div>

              <div className="grid grid-2" style={{ marginBottom: "14px" }}>
                <div>
                  <label className="label">Fecha inicio</label>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Fecha fin</label>
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Saldo inicial</label>
                  <input
                    type="number"
                    step="0.01"
                    value={saldoInicial}
                    onChange={(e) => setSaldoInicial(e.target.value)}
                    className="input"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="label">Saldo final calculado</label>
                  <input
                    value={dinero(saldoFinalCalculado)}
                    className="input"
                    readOnly
                  />
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label className="label">Observación</label>
                <input
                  type="text"
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  className="input"
                  placeholder="Comentario del estado"
                />
              </div>

              <div
                style={{
                  padding: "14px",
                  borderRadius: "16px",
                  background: "#f8fafc",
                  border: "1px solid #e5d9ef",
                  marginBottom: "16px",
                }}
              >
                <p className="module-text" style={{ margin: "0 0 8px 0" }}>
                  La fecha inicio y el saldo inicial se llenan automáticamente con base en el último estado guardado. Si subís Excel, el sistema detecta automáticamente la fecha inicial y final del archivo.
                </p>

                <div className="grid grid-3">
                  <div>
                    <p className="stat-title">Depósitos</p>
                    <b>{dinero(resumenFilas.depositos)}</b>
                  </div>
                  <div>
                    <p className="stat-title">Retiros</p>
                    <b>{dinero(resumenFilas.retiros)}</b>
                  </div>
                  <div>
                    <p className="stat-title">Movimientos</p>
                    <b>{resumenFilas.movimientos}</b>
                  </div>
                </div>
              </div>

              <div className="actions" style={{ justifyContent: "flex-end" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setModalNuevo(false)}
                >
                  Cancelar
                </button>

                <label
                  className="btn btn-secondary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    cursor: cuentaId ? "pointer" : "not-allowed",
                    opacity: cuentaId ? 1 : 0.5,
                  }}
                >
                  Subir Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={manejarImportacionExcel}
                    style={{ display: "none" }}
                    disabled={!cuentaId}
                  />
                </label>

                <button
                  className="btn btn-primary"
                  onClick={continuarNuevoEstado}
                >
                  Continuar manual
                </button>
              </div>
            </div>
          </div>
        )}

        {modalDetalle && (
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
            onClick={() => setModalDetalle(false)}
          >
            <div
              className="card"
              style={{
                width: "min(1250px, 96vw)",
                maxHeight: "90vh",
                overflow: "auto",
                borderRadius: "20px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <h2 className="module-title" style={{ marginBottom: "4px" }}>
                    Movimientos del estado
                  </h2>
                  <p className="module-text" style={{ margin: 0 }}>
                    {cuentaSeleccionada ? obtenerNombreCuenta(cuentaSeleccionada) : "Cuenta sin seleccionar"} · {fechaInicio} al {fechaFin}
                  </p>
                  {cargandoEstado && <p className="module-text">Cargando estado...</p>}
                </div>

                <div className="actions">
                  <button className="btn btn-secondary" onClick={agregarFila}>
                    + Fila
                  </button>

                  <button className="btn btn-secondary" onClick={() => setFilas([crearFila()])}>
                    Limpiar
                  </button>

                  <button className="btn btn-success" onClick={guardarEstado} disabled={guardando}>
                    {guardando ? "Guardando..." : "Guardar"}
                  </button>

                  <button className="btn btn-secondary" onClick={() => setModalDetalle(false)}>
                    Cerrar
                  </button>
                </div>
              </div>

              <div className="grid grid-4" style={{ marginBottom: "14px" }}>
                <div className="stat-card">
                  <p className="stat-title">Depósitos</p>
                  <p className="stat-value">{dinero(resumenFilas.depositos)}</p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Retiros</p>
                  <p className="stat-value">{dinero(resumenFilas.retiros)}</p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Movimientos</p>
                  <p className="stat-value">{resumenFilas.movimientos}</p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Saldo final</p>
                  <p className="stat-value">{dinero(saldoFinalCalculado)}</p>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Descripción</th>
                      <th>Cargos</th>
                      <th>Abonos</th>
                      <th>Saldo</th>
                      <th>Acción</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filas.map((fila) => (
                      <tr key={fila.id_local}>
                        <td>
                          <input
                            type="date"
                            value={fila.fecha}
                            onChange={(e) => actualizarFila(fila.id_local, "fecha", e.target.value)}
                            className="input"
                          />
                        </td>

                        <td>
                          <input
                            type="text"
                            value={fila.descripcion}
                            onChange={(e) => actualizarFila(fila.id_local, "descripcion", e.target.value)}
                            className="input"
                            placeholder="Descripción"
                          />
                        </td>

                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={fila.cargos}
                            onChange={(e) => actualizarFila(fila.id_local, "cargos", e.target.value)}
                            className="input"
                            placeholder="0.00"
                          />
                        </td>

                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={fila.abonos}
                            onChange={(e) => actualizarFila(fila.id_local, "abonos", e.target.value)}
                            className="input"
                            placeholder="0.00"
                          />
                        </td>

                        <td>
                          <input type="text" value={fila.saldo} readOnly className="input" />
                        </td>

                        <td>
                          <button className="btn btn-secondary" onClick={() => eliminarFila(fila.id_local)}>
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filas.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ textAlign: "center", color: "#64748b" }}>
                          No hay movimientos cargados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
