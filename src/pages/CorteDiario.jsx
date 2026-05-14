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

const crearFila = (tipo = "efectivo") => ({
  id_local: crypto.randomUUID(),
  id_db: null,
  tipo,
  descripcion: "",
  banco: "",
  monto: "",
  referencia: "",
});


const normalizarTexto = (valor) =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normalizarKey = (valor) =>
  normalizarTexto(valor)
    .toLowerCase()
    .replace(/\s+/g, " ");

const numeroExcel = (valor) => {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  const limpio = String(valor)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
};

const fechaExcelAISO = (valor) => {
  if (!valor) return "";

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const yyyy = valor.getFullYear();
    const mm = String(valor.getMonth() + 1).padStart(2, "0");
    const dd = String(valor.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (typeof valor === "number") {
    const parseFechaExcel = (valor) => {
  if (!valor) return null;

  // Si viene como número (Excel serial)
  if (typeof valor === "number") {
    const fecha = new Date((valor - 25569) * 86400 * 1000);
    return fecha.toISOString().split("T")[0];
  }

  const texto = String(valor).trim();

  // Detectar formato d/m/yyyy o dd/mm/yyyy
  const partes = texto.split("/");

  if (partes.length === 3) {
    let [d, m, y] = partes;

    d = d.padStart(2, "0");
    m = m.padStart(2, "0");

    return `${y}-${m}-${d}`;
  }

  return null;
};
    if (!fecha) return "";
    const yyyy = fecha.y;
    const mm = String(fecha.m).padStart(2, "0");
    const dd = String(fecha.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const texto = String(valor).trim();
  if (!texto) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  const partes = texto.split(/[\/\-]/).map((x) => x.trim());
  if (partes.length === 3) {
    let [d, m, y] = partes;
    if (partes[0].length === 4) {
      y = partes[0];
      m = partes[1];
      d = partes[2];
    }
    if (String(y).length === 2) y = `20${y}`;
    const yyyy = String(y).padStart(4, "0");
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const parsed = new Date(texto);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
};

const obtenerValorFlexible = (fila, posiblesNombres) => {
  const keys = Object.keys(fila || {});
  const mapa = {};
  keys.forEach((k) => {
    mapa[normalizarKey(k)] = k;
  });
  for (const nombre of posiblesNombres) {
    const keyNormalizada = normalizarKey(nombre);
    if (mapa[keyNormalizada] !== undefined) return fila[mapa[keyNormalizada]];
  }
  return "";
};

const limpiarBancoTexto = (columna) => {
  if (!columna) return "";
  return normalizarKey(columna)
    .replace(/\bpos\b/g, "")
    .replace(/\btransferencia\b/g, "")
    .replace(/\btransferencias\b/g, "")
    .replace(/\btransfer\b/g, "")
    .replace(/\btransf\b/g, "")
    .replace(/\bbanco\b/g, "")
    .replace(/\bdeposito\b/g, "")
    .replace(/\bdepositos\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const esColumnaIgnoradaCorte = (columna) => {
  const col = normalizarKey(columna);
  return (
    col === "fecha" ||
    col === "paciente" ||
    col === "origen" ||
    col === "reserva" ||
    col === "referencia" ||
    col === "referencias" ||
    col === "total paciente" ||
    col === "total_paciente" ||
    col === "totalpaciente" ||
    col === "total"
  );
};

const inferirTipoColumnaPago = (columna) => {
  const col = normalizarKey(columna);
  if (!col || esColumnaIgnoradaCorte(col)) return null;
  if (col.includes("efectivo") || col === "cash") return "efectivo";
  if (col.includes("pos") || col.includes("tarjeta") || col.includes("card")) return "pos";
  if (col.includes("transfer") || col.includes("transf") || col.includes("deposito") || col.includes("abono banco")) {
    return "transferencia";
  }
  return "otros";
};

const obtenerColumnasPagoCajera = (fila) => {
  const columnas = Object.keys(fila || {});
  const indiceEfectivo = columnas.findIndex((c) => normalizarKey(c) === "efectivo");
  const indiceReferencias = columnas.findIndex((c) => {
    const key = normalizarKey(c);
    return key === "referencia" || key === "referencias";
  });

  if (indiceEfectivo >= 0 && indiceReferencias > indiceEfectivo) {
    return columnas.slice(indiceEfectivo, indiceReferencias).filter((columna) => {
      if (esColumnaIgnoradaCorte(columna)) return false;
      return inferirTipoColumnaPago(columna) !== null;
    });
  }

  return columnas.filter((columna) => {
    if (esColumnaIgnoradaCorte(columna)) return false;
    return inferirTipoColumnaPago(columna) !== null;
  });
};

export default function CorteDiario() {
  const navigate = useNavigate();

  const [empresaId, setEmpresaId] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [fechaDesde, setFechaDesde] = useState(inicioMes());
  const [fechaHasta, setFechaHasta] = useState(hoy());
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [cargandoCorte, setCargandoCorte] = useState(false);
  const [corteActualId, setCorteActualId] = useState(null);

  const [bancos, setBancos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [historialCortes, setHistorialCortes] = useState([]);

  const [lineas, setLineas] = useState([
    crearFila("efectivo"),
    crearFila("pos"),
    crearFila("transferencia"),
  ]);

  useEffect(() => {
    cargarEmpresas();
    cargarEmpresaSeleccionada();
  }, []);

  useEffect(() => {
    if (empresaId) {
      cargarBancosPorEmpresa(empresaId);
      cargarHistorialCortes(empresaId, fechaDesde, fechaHasta);
    } else {
      setBancos([]);
      setHistorialCortes([]);
    }
  }, [empresaId, fechaDesde, fechaHasta]);

  useEffect(() => {
    if (empresaId && fecha) {
      cargarCorteExistente(empresaId, fecha);
    }
  }, [empresaId, fecha]);

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
      if (empresaObj?.id) {
        setEmpresaId(String(empresaObj.id));
      }
    } catch (e) {
      console.error("Error leyendo empresaSeleccionada:", e);
    }
  };

  const cargarBancosPorEmpresa = async (empresa_id) => {
    const { data, error } = await supabase
      .from("cuentas_bancarias")
      .select(`
        id,
        nombre_banco,
        nombre_cuenta,
        numero_cuenta,
        empresa_id,
        permite_pos,
        permite_transferencias,
        permite_efectivo,
        cobra_comision_pos,
        comision_pct,
        iva_pct,
        anticipo_pct,
        activo
      `)
      .eq("empresa_id", Number(empresa_id))
      .order("id", { ascending: true });

    if (error) {
      console.error("Error cargando bancos por empresa:", error);
      return;
    }

    setBancos((data || []).filter((b) => b.activo !== false));
  };

  const cargarHistorialCortes = async (empresa_id, desde, hasta) => {
    if (!empresa_id || !desde || !hasta) return;

    const { data: cortes, error: errorCortes } = await supabase
      .from("corte_diario")
      .select("id, fecha, observacion, created_at")
      .eq("empresa_id", Number(empresa_id))
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false });

    if (errorCortes) {
      console.error("Error cargando historial de cortes:", errorCortes);
      return;
    }

    const corteIds = (cortes || []).map((c) => c.id);

    let detalle = [];
    if (corteIds.length > 0) {
      const { data, error } = await supabase
        .from("corte_diario_detalle")
        .select("corte_id, monto_bruto")
        .in("corte_id", corteIds);

      if (error) {
        console.error("Error cargando detalle historial:", error);
        return;
      }

      detalle = data || [];
    }

    const mapaTotales = {};
    detalle.forEach((d) => {
      mapaTotales[d.corte_id] =
        (mapaTotales[d.corte_id] || 0) + Number(d.monto_bruto || 0);
    });

    const historial = (cortes || []).map((c) => ({
      ...c,
      total_general: Number(mapaTotales[c.id] || 0),
    }));

    setHistorialCortes(historial);
  };

  const cargarCorteExistente = async (empresa_id, fechaSeleccionada) => {
    setCargandoCorte(true);

    try {
      const { data: corte, error: errorCorte } = await supabase
        .from("corte_diario")
        .select("id, empresa_id, fecha, observacion, created_at")
        .eq("empresa_id", Number(empresa_id))
        .eq("fecha", fechaSeleccionada)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorCorte) {
        console.error("Error cargando corte existente:", errorCorte);
        return;
      }

      if (!corte) {
        setCorteActualId(null);
        setObservaciones("");
        setLineas([
          crearFila("efectivo"),
          crearFila("pos"),
          crearFila("transferencia"),
        ]);
        return;
      }

      setCorteActualId(corte.id);
      setObservaciones(corte.observacion || "");

      const { data: detalle, error: errorDetalle } = await supabase
        .from("corte_diario_detalle")
        .select(`
          id,
          corte_id,
          tipo_ingreso,
          subtipo,
          monto_bruto,
          numero_remesa,
          banco_destino,
          observacion
        `)
        .eq("corte_id", corte.id)
        .order("id", { ascending: true });

      if (errorDetalle) {
        console.error("Error cargando detalle existente:", errorDetalle);
        return;
      }

      if (!detalle || detalle.length === 0) {
        setLineas([
          crearFila("efectivo"),
          crearFila("pos"),
          crearFila("transferencia"),
        ]);
        return;
      }

      const lineasConvertidas = detalle.map((item) => ({
        id_local: crypto.randomUUID(),
        id_db: item.id,
        tipo: item.tipo_ingreso || "otros",
        descripcion: item.subtipo || item.observacion || "",
        banco: item.banco_destino || "",
        monto: String(item.monto_bruto ?? ""),
        referencia: item.numero_remesa || "",
      }));

      setLineas(lineasConvertidas);
    } catch (error) {
      console.error("Error general cargando corte existente:", error);
    } finally {
      setCargandoCorte(false);
    }
  };

  const abrirCorte = async (corte) => {
    setFecha(corte.fecha);
    await cargarCorteExistente(empresaId, corte.fecha);
  };

  const verificarCorteTieneConciliaciones = async (corteId) => {
    const { data: detallesExistentes, error: errorDetallesExistentes } = await supabase
      .from("corte_diario_detalle")
      .select("id")
      .eq("corte_id", corteId);

    if (errorDetallesExistentes) {
      alert(`Error leyendo detalle del corte: ${errorDetallesExistentes.message}`);
      throw errorDetallesExistentes;
    }

    const idsDetalle = (detallesExistentes || []).map((d) => d.id);

    if (idsDetalle.length === 0) {
      return { bloqueado: false, idsDetalle };
    }

    const { data: conciliacionesBanco, error: errorBanco } = await supabase
      .from("conciliacion_corte_banco_detalle")
      .select("id")
      .in("corte_detalle_id", idsDetalle)
      .limit(1);

    if (errorBanco) {
      alert(`Error revisando conciliaciones de banco: ${errorBanco.message}`);
      throw errorBanco;
    }

    const { data: conciliacionesDcl, error: errorDcl } = await supabase
      .from("dcl_conciliacion")
      .select("id")
      .in("corte_detalle_id", idsDetalle)
      .limit(1);

    if (errorDcl) {
      alert(`Error revisando conciliaciones DCL: ${errorDcl.message}`);
      throw errorDcl;
    }

    const tieneBanco = (conciliacionesBanco || []).length > 0;
    const tieneDcl = (conciliacionesDcl || []).length > 0;

    return {
      bloqueado: tieneBanco || tieneDcl,
      tieneBanco,
      tieneDcl,
      idsDetalle,
    };
  };

  const eliminarCorte = async (corteId) => {
    const ok = window.confirm("¿Eliminar este corte completo?");
    if (!ok) return;

    try {
      const revision = await verificarCorteTieneConciliaciones(corteId);

      if (revision.bloqueado) {
        alert(
          "No se puede eliminar este corte porque ya tiene conciliaciones de banco o DCL relacionadas. " +
            "Esto protege los datos ya conciliados. Si de verdad necesitás cambiarlo, primero quitá esas conciliaciones desde sus módulos."
        );
        return;
      }

      const { error: errorDeleteDetalle } = await supabase
        .from("corte_diario_detalle")
        .delete()
        .eq("corte_id", corteId);

      if (errorDeleteDetalle) {
        alert(`Error al eliminar detalle del corte: ${errorDeleteDetalle.message}`);
        throw errorDeleteDetalle;
      }

      const { error } = await supabase
        .from("corte_diario")
        .delete()
        .eq("id", corteId);

      if (error) {
        alert(`Error al eliminar corte: ${error.message}`);
        throw error;
      }

      if (Number(corteActualId) === Number(corteId)) {
        setCorteActualId(null);
        setObservaciones("");
        setLineas([
          crearFila("efectivo"),
          crearFila("pos"),
          crearFila("transferencia"),
        ]);
      }

      await cargarHistorialCortes(empresaId, fechaDesde, fechaHasta);
      alert("Corte eliminado correctamente.");
    } catch (error) {
      console.error("Error eliminando corte:", error);
    }
  };

  const agregarLinea = (tipo) => {
    setLineas((prev) => [...prev, crearFila(tipo)]);
  };

  const verificarDetalleTieneConciliaciones = async (detalleId) => {
    const { data: banco, error: errorBanco } = await supabase
      .from("conciliacion_corte_banco_detalle")
      .select("id")
      .eq("corte_detalle_id", Number(detalleId))
      .limit(1);

    if (errorBanco) throw errorBanco;

    const { data: dcl, error: errorDcl } = await supabase
      .from("dcl_conciliacion")
      .select("id")
      .eq("corte_detalle_id", Number(detalleId))
      .limit(1);

    if (errorDcl) throw errorDcl;

    return (banco || []).length > 0 || (dcl || []).length > 0;
  };

  const eliminarLinea = async (id_local) => {
    const linea = lineas.find((l) => l.id_local === id_local);

    if (!linea?.id_db) {
      setLineas((prev) => prev.filter((l) => l.id_local !== id_local));
      return;
    }

    const ok = window.confirm(
      "Esta línea ya está guardada en el corte. ¿Querés eliminarla de la base de datos?"
    );

    if (!ok) return;

    try {
      const tieneConciliacion = await verificarDetalleTieneConciliaciones(linea.id_db);

      if (tieneConciliacion) {
        alert(
          "No se puede eliminar esta línea porque ya tiene conciliación de banco o DCL relacionada. Primero deshacé esa conciliación."
        );
        return;
      }

      const { error } = await supabase
        .from("corte_diario_detalle")
        .delete()
        .eq("id", Number(linea.id_db));

      if (error) throw error;

      setLineas((prev) => prev.filter((l) => l.id_local !== id_local));
      await cargarHistorialCortes(empresaId, fechaDesde, fechaHasta);
      alert("Línea eliminada correctamente.");
    } catch (error) {
      console.error("Error eliminando línea:", error);
      alert(`Error eliminando línea: ${error.message}`);
    }
  };

  const actualizarLinea = (id_local, campo, valor) => {
    setLineas((prev) =>
      prev.map((l) =>
        l.id_local === id_local ? { ...l, [campo]: valor } : l
      )
    );
  };

  const obtenerNombreBanco = (b) => {
    if (b.nombre_banco && b.nombre_cuenta) {
      return `${b.nombre_banco} - ${b.nombre_cuenta}`;
    }

    if (b.nombre_banco && b.numero_cuenta) {
      return `${b.nombre_banco} - ${b.numero_cuenta}`;
    }

    if (b.nombre_banco) return b.nombre_banco;
    if (b.nombre_cuenta) return b.nombre_cuenta;
    if (b.numero_cuenta) return b.numero_cuenta;

    return `Cuenta ${b.id}`;
  };

  const obtenerBancoSeleccionado = (valorBanco) => {
    return bancos.find((b) => obtenerNombreBanco(b) === valorBanco) || null;
  };

  const bancosFiltradosPorTipo = (tipo) => {
    if (tipo === "pos") {
      const filtrados = bancos.filter((b) => b.permite_pos === true);
      return filtrados.length > 0 ? filtrados : bancos;
    }

    if (tipo === "transferencia") {
      const filtrados = bancos.filter((b) => b.permite_transferencias === true);
      return filtrados.length > 0 ? filtrados : bancos;
    }

    if (tipo === "efectivo") {
      const filtrados = bancos.filter((b) => b.permite_efectivo === true);
      return filtrados.length > 0 ? filtrados : bancos;
    }

    return bancos;
  };

  const lineasValidas = useMemo(() => {
    return lineas.filter((l) => Number(l.monto || 0) > 0);
  }, [lineas]);

  const totalEfectivo = useMemo(() => {
    return lineasValidas
      .filter((l) => l.tipo === "efectivo")
      .reduce((acc, l) => acc + Number(l.monto || 0), 0);
  }, [lineasValidas]);

  const totalPOS = useMemo(() => {
    return lineasValidas
      .filter((l) => l.tipo === "pos")
      .reduce((acc, l) => acc + Number(l.monto || 0), 0);
  }, [lineasValidas]);

  const totalTransferencia = useMemo(() => {
    return lineasValidas
      .filter((l) => l.tipo === "transferencia")
      .reduce((acc, l) => acc + Number(l.monto || 0), 0);
  }, [lineasValidas]);

  const totalOtros = useMemo(() => {
    return lineasValidas
      .filter((l) => l.tipo === "otros")
      .reduce((acc, l) => acc + Number(l.monto || 0), 0);
  }, [lineasValidas]);

  const totalGeneral = useMemo(() => {
    return totalEfectivo + totalPOS + totalTransferencia + totalOtros;
  }, [totalEfectivo, totalPOS, totalTransferencia, totalOtros]);

  const totalesPorBancoPOS = useMemo(() => {
    const mapa = {};

    lineasValidas
      .filter((l) => l.tipo === "pos")
      .forEach((l) => {
        const key = l.banco?.trim() || "Sin banco";
        mapa[key] = (mapa[key] || 0) + Number(l.monto || 0);
      });

    return Object.entries(mapa).map(([banco, total]) => ({ banco, total }));
  }, [lineasValidas]);

  const limpiarFormulario = () => {
    setCorteActualId(null);
    setObservaciones("");
    setLineas([
      crearFila("efectivo"),
      crearFila("pos"),
      crearFila("transferencia"),
    ]);
  };

  const guardarDetalleCorte = async (corteId, lineasParaGuardar) => {
    if (!lineasParaGuardar || lineasParaGuardar.length === 0) return;

    const detalle = lineasParaGuardar.map((l) => {
      const bancoSeleccionado = obtenerBancoSeleccionado(l.banco);
      const montoBruto = Number(l.monto || 0);

      let comisionPct = 0;
      let ivaPct = 0;
      let anticipoPct = 0;

      if (l.tipo === "pos" && bancoSeleccionado?.cobra_comision_pos) {
        comisionPct = Number(bancoSeleccionado.comision_pct || 0);
        ivaPct = Number(bancoSeleccionado.iva_pct || 0);
        anticipoPct = Number(bancoSeleccionado.anticipo_pct || 0);
      }

      const montoGravado = Number((montoBruto / 1.13).toFixed(6));

      const comisionMonto = Number(
        (montoGravado * (comisionPct / 100)).toFixed(2)
      );

      const ivaMonto = Number(
        (comisionMonto * (ivaPct / 100)).toFixed(2)
      );

      const anticipoMonto = Number(
        (montoGravado * (anticipoPct / 100)).toFixed(2)
      );

      const totalDescuentos = Number(
        (comisionMonto + ivaMonto + anticipoMonto).toFixed(2)
      );

      const montoNeto = Number(
        (montoBruto - totalDescuentos).toFixed(2)
      );

      console.log("CALCULO POS:", {
        banco: bancoSeleccionado?.nombre_banco || l.banco,
        montoBruto,
        montoGravado,
        comisionPct,
        ivaPct,
        anticipoPct,
        comisionMonto,
        ivaMonto,
        anticipoMonto,
        totalDescuentos,
        montoNeto,
      });

      return {
        corte_id: corteId,
        tipo_ingreso: l.tipo,
        subtipo: l.descripcion || null,
        monto_bruto: montoBruto,
        numero_remesa: l.referencia || null,
        banco_destino: l.banco || null,
        comision_pct: comisionPct,
        iva_pct: ivaPct,
        anticipo_pct: anticipoPct,
        comision_monto: comisionMonto,
        iva_monto: ivaMonto,
        anticipo_monto: anticipoMonto,
        monto_neto: montoNeto,
        observacion: l.descripcion || null,
      };
    });

    const { error } = await supabase
      .from("corte_diario_detalle")
      .insert(detalle);

    if (error) throw error;
  };


  const guardarPacientesCorte = async (corteId, pacientesParaGuardar) => {
    if (!pacientesParaGuardar || pacientesParaGuardar.length === 0) return;

    const payload = pacientesParaGuardar.map((p) => ({
      corte_id: corteId,
      empresa_id: Number(empresaId),
      fecha: p.fecha,
      paciente: p.paciente || null,
      origen: p.origen || null,
      efectivo: Number(p.efectivo || 0),
      referencias: p.referencias || null,
      total_valido: Number(p.total_valido || 0),
      datos_extra: p.datos_extra || {},
    }));

    const { error } = await supabase
      .from("corte_diario_paciente")
      .insert(payload);

    if (error) {
      console.warn(
        "No se pudo guardar corte_diario_paciente. Si no has creado esa tabla, ejecutá primero el SQL de corte_diario_paciente.",
        error
      );
    }
  };

  const limpiarConciliacionesRelacionadas = async (corteId) => {
    const revision = await verificarCorteTieneConciliaciones(corteId);

    if (revision.bloqueado) {
      alert(
        "No se puede actualizar este corte porque ya tiene conciliaciones de banco o DCL relacionadas. " +
          "Esto evita dañar los pagos ya conciliados. Para modificarlo, primero quitá esas conciliaciones desde Conciliación Corte vs Banco y Conciliación DCL."
      );
      throw new Error("Corte bloqueado por conciliaciones existentes.");
    }

    const { error: errorDeleteDetalle } = await supabase
      .from("corte_diario_detalle")
      .delete()
      .eq("corte_id", corteId);

    if (errorDeleteDetalle) {
      alert(`Error al limpiar detalle anterior: ${errorDeleteDetalle.message}`);
      throw errorDeleteDetalle;
    }

    const { error: errorDeletePacientes } = await supabase
      .from("corte_diario_paciente")
      .delete()
      .eq("corte_id", corteId);

    if (errorDeletePacientes) {
      console.warn(
        "No se pudo limpiar corte_diario_paciente. Si no usás esa tabla, podés ignorar este aviso.",
        errorDeletePacientes
      );
    }
  };

  const guardarCorte = async () => {
    if (!empresaId) {
      alert("Seleccioná una empresa.");
      return;
    }

    if (!fecha) {
      alert("Seleccioná una fecha.");
      return;
    }

    if (lineasValidas.length === 0) {
      alert("Agregá al menos una línea con monto mayor a 0.");
      return;
    }

    setGuardando(true);

    try {
      let corteId = corteActualId;
      let lineasAInsertar = lineasValidas;

      if (corteActualId) {
        const { error: errorUpdate } = await supabase
          .from("corte_diario")
          .update({
            empresa_id: Number(empresaId),
            fecha,
            observacion: observaciones || null,
          })
          .eq("id", corteActualId);

        if (errorUpdate) {
          alert(`Error al actualizar corte: ${errorUpdate.message}`);
          throw errorUpdate;
        }

        // IMPORTANTE:
        // Si el corte ya existe, NO borramos ni reinsertamos las líneas antiguas,
        // porque algunas pueden tener conciliación de banco o DCL.
        // Solo insertamos las líneas nuevas que agregaste en pantalla.
        lineasAInsertar = lineasValidas.filter((l) => !l.id_db);

        if (lineasAInsertar.length === 0) {
          alert("No hay pagos nuevos para agregar. Las líneas anteriores se conservaron sin cambios.");
          await cargarCorteExistente(empresaId, fecha);
          await cargarHistorialCortes(empresaId, fechaDesde, fechaHasta);
          return;
        }
      } else {
        const payloadCorte = {
          empresa_id: Number(empresaId),
          fecha,
          observacion: observaciones || null,
        };

        const { data: corteData, error: errorCorte } = await supabase
          .from("corte_diario")
          .insert([payloadCorte])
          .select()
          .single();

        if (errorCorte) {
          alert(`Error al guardar corte: ${errorCorte.message}`);
          throw errorCorte;
        }

        corteId = corteData.id;
        setCorteActualId(corteData.id);
      }

      await guardarDetalleCorte(corteId, lineasAInsertar);

      alert(
        corteActualId
          ? `Pagos nuevos agregados correctamente: ${lineasAInsertar.length}. Los pagos ya conciliados no se tocaron.`
          : "Corte diario guardado correctamente."
      );

      await cargarCorteExistente(empresaId, fecha);
      await cargarHistorialCortes(empresaId, fechaDesde, fechaHasta);
    } catch (error) {
      console.error("Error guardando corte:", error);
    } finally {
      setGuardando(false);
    }
  };

  const normalizarBancoExcelContraCatalogo = (columna, tipo) => {
    if (tipo === "efectivo") return "";

    const bancoLimpio = limpiarBancoTexto(columna);
    if (!bancoLimpio) return "";

    const encontrado = bancos.find((b) => {
      const nombreCatalogo = normalizarKey(obtenerNombreBanco(b));
      const nombreBanco = normalizarKey(b.nombre_banco || "");
      const nombreCuenta = normalizarKey(b.nombre_cuenta || "");

      return (
        nombreCatalogo.includes(bancoLimpio) ||
        bancoLimpio.includes(nombreBanco) ||
        (nombreCuenta && bancoLimpio.includes(nombreCuenta)) ||
        (nombreBanco && bancoLimpio.includes(nombreBanco))
      );
    });

    return encontrado ? obtenerNombreBanco(encontrado) : columna;
  };

  const prepararImportacionCajera = (filasExcel) => {
    const gruposLineas = {};
    const gruposPacientes = {};
    let totalReservaIgnorada = 0;
    let filasIgnoradas = 0;

    filasExcel.forEach((fila) => {
      const fechaFila = fechaExcelAISO(obtenerValorFlexible(fila, ["Fecha", "fecha"]));
      if (!fechaFila) {
        filasIgnoradas += 1;
        return;
      }

      const paciente = String(obtenerValorFlexible(fila, ["Paciente", "paciente"])).trim();
      const origen = String(obtenerValorFlexible(fila, ["Origen", "origen"])).trim();
      const referencias = String(
        obtenerValorFlexible(fila, ["Referencias", "Referencia", "referencias", "referencia"])
      ).trim();

      const reservaIgnorada = numeroExcel(obtenerValorFlexible(fila, ["Reserva", "reserva"]));
      totalReservaIgnorada += reservaIgnorada;

      const pagosValidos = [];
      let totalValido = 0;
      let efectivoPaciente = 0;
      const datosExtra = {
        reserva_ignorada: reservaIgnorada,
        total_paciente_excel: numeroExcel(
          obtenerValorFlexible(fila, ["Total Paciente", "total paciente", "TotalPaciente"])
        ),
        pagos_validos: {},
      };

      obtenerColumnasPagoCajera(fila).forEach((columna) => {
        const monto = numeroExcel(fila[columna]);
        if (monto <= 0) return;

        const tipo = inferirTipoColumnaPago(columna);
        if (!tipo) return;

        const banco = normalizarBancoExcelContraCatalogo(columna, tipo);
        totalValido += monto;
        if (tipo === "efectivo") efectivoPaciente += monto;
        datosExtra.pagos_validos[columna] = monto;

        pagosValidos.push({
          fecha: fechaFila,
          tipo,
          banco,
          monto,
          referencia: referencias,
          columna_original: columna,
        });
      });

      if (totalValido <= 0) return;

      if (!gruposPacientes[fechaFila]) gruposPacientes[fechaFila] = [];
      gruposPacientes[fechaFila].push({
        fecha: fechaFila,
        paciente,
        origen,
        efectivo: efectivoPaciente,
        referencias,
        total_valido: Number(totalValido.toFixed(2)),
        datos_extra: datosExtra,
      });

      if (!gruposLineas[fechaFila]) gruposLineas[fechaFila] = {};

      pagosValidos.forEach((pago) => {
        const key = [pago.tipo, pago.banco || "", pago.referencia || "", pago.columna_original].join("||");

        if (!gruposLineas[fechaFila][key]) {
          gruposLineas[fechaFila][key] = {
            id_local: crypto.randomUUID(),
            tipo: pago.tipo,
            descripcion: pago.columna_original,
            banco: pago.banco,
            monto: 0,
            referencia: pago.referencia,
          };
        }

        gruposLineas[fechaFila][key].monto += pago.monto;
      });
    });

    const lineasPorFecha = {};
    Object.keys(gruposLineas).forEach((fechaGrupo) => {
      lineasPorFecha[fechaGrupo] = Object.values(gruposLineas[fechaGrupo]).map((l) => ({
        ...l,
        monto: Number(l.monto.toFixed(2)),
      }));
    });

    return {
      lineasPorFecha,
      pacientesPorFecha: gruposPacientes,
      fechasImportadas: Object.keys(lineasPorFecha),
      totalReservaIgnorada: Number(totalReservaIgnorada.toFixed(2)),
      filasIgnoradas,
    };
  };

  const importarCorteCajera = async (filasExcel) => {
    if (!empresaId) {
      alert("Seleccioná una empresa antes de importar el corte de cajera.");
      return;
    }

    const {
      lineasPorFecha,
      pacientesPorFecha,
      fechasImportadas,
      totalReservaIgnorada,
      filasIgnoradas,
    } = prepararImportacionCajera(filasExcel);

    if (fechasImportadas.length === 0) {
      alert("No encontré cobros válidos. Recordá que la columna Reserva se ignora totalmente.");
      return;
    }

    for (const fechaGrupo of fechasImportadas) {
      const lineasGrupo = lineasPorFecha[fechaGrupo] || [];
      const pacientesGrupo = pacientesPorFecha[fechaGrupo] || [];

      const { data: corteExistente, error: errorCorteExistente } = await supabase
        .from("corte_diario")
        .select("id")
        .eq("empresa_id", Number(empresaId))
        .eq("fecha", fechaGrupo)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorCorteExistente) throw errorCorteExistente;

      let corteId = null;

      if (corteExistente?.id) {
        corteId = corteExistente.id;
        // El corte ya existe: agregamos nuevas líneas sin borrar las conciliadas.
      } else {
        const { data: nuevoCorte, error: errorNuevoCorte } = await supabase
          .from("corte_diario")
          .insert([
            {
              empresa_id: Number(empresaId),
              fecha: fechaGrupo,
              observacion: "Importado desde Excel de cajera. Reserva ignorada.",
            },
          ])
          .select()
          .single();

        if (errorNuevoCorte) throw errorNuevoCorte;
        corteId = nuevoCorte.id;
      }

      await guardarDetalleCorte(corteId, lineasGrupo);
      await guardarPacientesCorte(corteId, pacientesGrupo);
    }

    await cargarHistorialCortes(empresaId, fechaDesde, fechaHasta);

    if (fechasImportadas.includes(fecha)) {
      await cargarCorteExistente(empresaId, fecha);
    }

    alert(
      `Excel de cajera importado correctamente. Fechas procesadas: ${fechasImportadas.length}. Reserva ignorada: $${totalReservaIgnorada.toFixed(2)}.${
        filasIgnoradas ? ` Filas ignoradas por fecha inválida: ${filasIgnoradas}.` : ""
      }`
    );
  };

  const manejarImportacionExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCargando(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });

      const columnas = json[0] ? Object.keys(json[0]).map((c) => normalizarKey(c)) : [];
      const esFormatoCajera =
        columnas.includes("paciente") &&
        columnas.some((c) => c.includes("efectivo") || c.includes("pos") || c.includes("transfer"));

      if (esFormatoCajera) {
        await importarCorteCajera(json);
        return;
      }

      const nuevasLineas = json
        .map((fila) => ({
          id_local: crypto.randomUUID(),
          fecha: fechaExcelAISO(fila.fecha || fila.Fecha || ""),
          tipo: String(fila.tipo || fila.Tipo || "").trim().toLowerCase(),
          descripcion: String(fila.descripcion || fila.Descripcion || "").trim(),
          banco: String(fila.banco || fila.Banco || "").trim(),
          monto: String(fila.monto || fila.Monto || "").trim(),
          referencia: String(fila.referencia || fila.Referencia || "").trim(),
        }))
        .filter(
          (fila) =>
            ["efectivo", "pos", "transferencia", "otros"].includes(fila.tipo) &&
            Number(fila.monto || 0) > 0
        );

      if (nuevasLineas.length === 0) {
        alert("El archivo no tiene líneas válidas.");
        return;
      }

      const tieneMultiplesFechas = nuevasLineas.some((fila) => fila.fecha);

      if (!tieneMultiplesFechas) {
        const lineasImportadas = nuevasLineas.map((fila) => ({
          id_local: fila.id_local,
          id_db: null,
          tipo: fila.tipo,
          descripcion: fila.descripcion,
          banco: fila.banco,
          monto: fila.monto,
          referencia: fila.referencia,
        }));

        setLineas((prev) => {
          const lineasBase = prev.filter((l) => Number(l.monto || 0) > 0 || l.id_db);
          return [...lineasBase, ...lineasImportadas];
        });

        alert("Excel importado correctamente al formulario actual. Se agregará como pago nuevo al guardar.");
        return;
      }

      if (!empresaId) {
        alert("Seleccioná una empresa antes de importar múltiples fechas.");
        return;
      }

      const grupos = nuevasLineas.reduce((acc, fila) => {
        const fechaGrupo = fila.fecha || fecha;
        if (!acc[fechaGrupo]) acc[fechaGrupo] = [];
        acc[fechaGrupo].push(fila);
        return acc;
      }, {});

      const fechasImportadas = Object.keys(grupos);

      for (const fechaGrupo of fechasImportadas) {
        const lineasGrupo = grupos[fechaGrupo].map((fila) => ({
          id_local: fila.id_local,
          id_db: null,
          tipo: fila.tipo,
          descripcion: fila.descripcion,
          banco: fila.banco,
          monto: fila.monto,
          referencia: fila.referencia,
        }));

        const { data: corteExistente, error: errorCorteExistente } = await supabase
          .from("corte_diario")
          .select("id")
          .eq("empresa_id", Number(empresaId))
          .eq("fecha", fechaGrupo)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (errorCorteExistente) throw errorCorteExistente;

        let corteId = null;

        if (corteExistente?.id) {
          corteId = corteExistente.id;
          await limpiarConciliacionesRelacionadas(corteId);
        } else {
          const { data: nuevoCorte, error: errorNuevoCorte } = await supabase
            .from("corte_diario")
            .insert([
              {
                empresa_id: Number(empresaId),
                fecha: fechaGrupo,
                observacion: null,
              },
            ])
            .select()
            .single();

          if (errorNuevoCorte) throw errorNuevoCorte;
          corteId = nuevoCorte.id;
        }

        await guardarDetalleCorte(corteId, lineasGrupo);
      }

      alert(`Excel importado correctamente. Se procesaron ${fechasImportadas.length} fecha(s).`);
      await cargarHistorialCortes(empresaId, fechaDesde, fechaHasta);

      if (fechasImportadas.includes(fecha)) {
        await cargarCorteExistente(empresaId, fecha);
      }
    } catch (error) {
      console.error("Error importando Excel:", error);
      alert(`No se pudo importar el Excel: ${error.message}`);
    } finally {
      setCargando(false);
      e.target.value = "";
    }
  };

  const exportarPlantillaExcel = () => {
    const data = [
      {
        Fecha: hoy(),
        Paciente: "Nombre del paciente",
        Origen: "Manual",
        Reserva: 0,
        Efectivo: 0,
        "POS DAVIVIENDA": 0,
        "POS HIPOTECARIO": 0,
        "BAC POS": 0,
        Transferencia: 0,
        Referencias: "Número de remesa / referencia",
        "Total Paciente": 0,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CorteCajera");
    XLSX.writeFile(wb, "Plantilla_Corte_Cajera.xlsx");
  };

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">💰 Corte Diario</h1>
            <p className="subtitle">
              Controla efectivo, POS, transferencias y otros ingresos por empresa.
            </p>
            {corteActualId && (
              <p className="subtitle" style={{ marginTop: "4px" }}>
                Corte cargado para edición: #{corteActualId}
              </p>
            )}
            {cargandoCorte && (
              <p className="subtitle" style={{ marginTop: "4px" }}>
                Cargando datos guardados...
              </p>
            )}
          </div>

          <div className="actions">
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/inicio")}
            >
              Ir a Inicio
            </button>

            <button className="btn btn-secondary" onClick={limpiarFormulario}>
              Limpiar
            </button>

            <button
              className="btn btn-success"
              onClick={guardarCorte}
              disabled={guardando}
            >
              {guardando
                ? "Guardando..."
                : corteActualId
                ? "Agregar pagos nuevos"
                : "Guardar Corte"}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
          <div className="grid grid-3">
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
              <label className="label">Fecha del corte</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Observaciones</label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Comentario general del corte"
                className="input"
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
          <div className="actions">
            <button
              className="btn btn-secondary"
              onClick={() => agregarLinea("efectivo")}
            >
              + Efectivo
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => agregarLinea("pos")}
            >
              + POS
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => agregarLinea("transferencia")}
            >
              + Transferencia
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => agregarLinea("otros")}
            >
              + Otros
            </button>

            <button
              className="btn btn-secondary"
              onClick={exportarPlantillaExcel}
            >
              Descargar plantilla cajera
            </button>

            <label
              className="btn btn-primary"
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              {cargando ? "Importando..." : "Importar Excel cajera"}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={manejarImportacionExcel}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Banco / Cuenta</th>
                  <th>Monto</th>
                  <th>Referencia</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea) => {
                  const bancosDisponibles = bancosFiltradosPorTipo(linea.tipo);

                  return (
                    <tr key={linea.id_local}>
                      <td>
                        <select
                          value={linea.tipo}
                          onChange={(e) =>
                            actualizarLinea(
                              linea.id_local,
                              "tipo",
                              e.target.value
                            )
                          }
                          className="select"
                        >
                          <option value="efectivo">Efectivo</option>
                          <option value="pos">POS</option>
                          <option value="transferencia">Transferencia</option>
                          <option value="otros">Otros</option>
                        </select>
                      </td>

                      <td>
                        <input
                          type="text"
                          value={linea.descripcion}
                          onChange={(e) =>
                            actualizarLinea(
                              linea.id_local,
                              "descripcion",
                              e.target.value
                            )
                          }
                          placeholder="Descripción"
                          className="input"
                        />
                      </td>

                      <td>
                        {(linea.tipo === "efectivo" ||
                          linea.tipo === "pos" ||
                          linea.tipo === "transferencia") ? (
                          <select
                            value={linea.banco}
                            onChange={(e) =>
                              actualizarLinea(
                                linea.id_local,
                                "banco",
                                e.target.value
                              )
                            }
                            className="select"
                          >
                            <option value="">Seleccionar banco / cuenta</option>
                            {bancosDisponibles.map((b) => (
                              <option key={b.id} value={obtenerNombreBanco(b)}>
                                {obtenerNombreBanco(b)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={linea.banco}
                            onChange={(e) =>
                              actualizarLinea(
                                linea.id_local,
                                "banco",
                                e.target.value
                              )
                            }
                            placeholder="Opcional"
                            className="input"
                          />
                        )}
                      </td>

                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={linea.monto}
                          onChange={(e) =>
                            actualizarLinea(
                              linea.id_local,
                              "monto",
                              e.target.value
                            )
                          }
                          placeholder="0.00"
                          className="input"
                        />
                      </td>

                      <td>
                        <input
                          type="text"
                          value={linea.referencia}
                          onChange={(e) =>
                            actualizarLinea(
                              linea.id_local,
                              "referencia",
                              e.target.value
                            )
                          }
                          placeholder="Referencia"
                          className="input"
                        />
                      </td>

                      <td>
                        <button
                          className="btn btn-secondary"
                          onClick={() => eliminarLinea(linea.id_local)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {lineas.length === 0 && (
                  <tr>
                    <td
                      colSpan="6"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      No hay líneas agregadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: "18px" }}>
          <div className="stat-card">
            <p className="stat-title">Total Efectivo</p>
            <p className="stat-value">${totalEfectivo.toFixed(2)}</p>
          </div>

          <div className="stat-card">
            <p className="stat-title">Total POS</p>
            <p className="stat-value">${totalPOS.toFixed(2)}</p>
          </div>

          <div className="stat-card">
            <p className="stat-title">Total Transferencias</p>
            <p className="stat-value">${totalTransferencia.toFixed(2)}</p>
          </div>

          <div className="stat-card">
            <p className="stat-title">Total Otros</p>
            <p className="stat-value">${totalOtros.toFixed(2)}</p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
          <div className="topbar" style={{ marginBottom: 0 }}>
            <div>
              <p className="stat-title" style={{ marginBottom: "6px" }}>
                Total General del Corte
              </p>
              <p className="stat-value">${totalGeneral.toFixed(2)}</p>
            </div>

            <div className="actions">
              <button
                className="btn btn-secondary"
                onClick={() => navigate("/inicio")}
              >
                Ir a Inicio
              </button>

              <button
                className="btn btn-success"
                onClick={guardarCorte}
                disabled={guardando}
              >
                {guardando
                  ? "Guardando..."
                  : corteActualId
                  ? "Agregar pagos nuevos"
                  : "Guardar Corte"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: "18px" }}>
          <div className="card">
            <h2 className="module-title" style={{ marginBottom: "14px" }}>
              Resumen POS por banco
            </h2>

            {totalesPorBancoPOS.length === 0 ? (
              <p className="module-text">No hay movimientos POS registrados.</p>
            ) : (
              <div className="grid">
                {totalesPorBancoPOS.map((item, index) => (
                  <div
                    key={index}
                    className="stat-card"
                    style={{ padding: "14px" }}
                  >
                    <p className="stat-title">{item.banco}</p>
                    <p className="stat-value">${item.total.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="module-title" style={{ marginBottom: "14px" }}>
              Estructura lista para conciliación
            </h2>

            <div className="grid">
              <span className="badge">Efectivo separado</span>
              <span className="badge">POS agrupado por banco</span>
              <span className="badge">Transferencias separadas</span>
              <span className="badge">Referencias guardadas por línea</span>
              <span className="badge">Totales guardados en detalle</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="topbar">
            <div>
              <h2 className="module-title">Historial de cortes</h2>
              <p className="subtitle">Consultá y abrí cortes por rango de fechas.</p>
            </div>
          </div>

          <div className="grid grid-3" style={{ marginBottom: "18px" }}>
            <div>
              <label className="label">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Observación</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {historialCortes.map((corte) => (
                  <tr key={corte.id}>
                    <td>{corte.fecha}</td>
                    <td>${Number(corte.total_general || 0).toFixed(2)}</td>
                    <td>{corte.observacion || "-"}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn-secondary"
                          onClick={() => abrirCorte(corte)}
                        >
                          Abrir
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => eliminarCorte(corte.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {historialCortes.length === 0 && (
                  <tr>
                    <td
                      colSpan="4"
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      No hay cortes guardados en ese rango.
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
