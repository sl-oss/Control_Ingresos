import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

const inicioAnio = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  return `${yyyy}-01-01`;
};

const dinero = (n) => Number(n || 0).toFixed(2);

const textoIncluye = (a, b) =>
  String(a || "")
    .toLowerCase()
    .includes(String(b || "").toLowerCase());

const generarRangoFechas = (desde, hasta) => {
  if (!desde || !hasta) return [];

  const fechas = [];
  const inicio = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);

  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    fechas.push(`${yyyy}-${mm}-${dd}`);
  }

  return fechas;
};

const estadoAutomatico = (facturado, corte) => {
  const f = Number(facturado || 0);
  const c = Number(corte || 0);
  const diferencia = Number((f - c).toFixed(2));

  if (Math.abs(diferencia) < 0.01) return "conciliado";
  if (f < c) return "falta_facturar";
  if (f > c) return "falta_corte";
  return "revisar";
};

const colorEstado = (estado) => {
  switch (estado) {
    case "conciliado":
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #86efac",
      };
    case "falta_facturar":
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fcd34d",
      };
    case "falta_corte":
      return {
        background: "#dbeafe",
        color: "#1d4ed8",
        border: "1px solid #93c5fd",
      };
    case "desfase_historico":
      return {
        background: "#ede9fe",
        color: "#5b21b6",
        border: "1px solid #c4b5fd",
      };
    case "revisar":
      return {
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #fca5a5",
      };
    case "pendiente":
      return {
        background: "#e2e8f0",
        color: "#334155",
        border: "1px solid #cbd5e1",
      };
    default:
      return {
        background: "#e2e8f0",
        color: "#334155",
        border: "1px solid #cbd5e1",
      };
  }
};

const etiquetaEstado = (estado) => {
  switch (estado) {
    case "conciliado":
      return "Conciliado";
    case "falta_facturar":
      return "Falta facturar";
    case "falta_corte":
      return "Falta en corte";
    case "desfase_historico":
      return "Desfase histórico";
    case "revisar":
      return "Revisar";
    case "pendiente":
      return "Pendiente";
    default:
      return estado || "-";
  }
};

const primerDiaMesDeFecha = (fecha) => {
  if (!fecha) return inicioMes();
  return `${fecha.slice(0, 7)}-01`;
};

export default function ConciliacionFacturacionCorte() {
  const navigate = useNavigate();

  const [empresaId, setEmpresaId] = useState("");
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());

  const [empresas, setEmpresas] = useState([]);
  const [filas, setFilas] = useState([]);
  const [facturasDetalle, setFacturasDetalle] = useState([]);
  const [cortesDetalle, setCortesDetalle] = useState([]);
  const [resumenDiasHistorico, setResumenDiasHistorico] = useState([]);
  const [ajustesHistoricos, setAjustesHistoricos] = useState([]);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [exportandoExcelDetalle, setExportandoExcelDetalle] = useState(false);
  const [exportandoPdfDetalle, setExportandoPdfDetalle] = useState(false);

  const [mostrarConciliados, setMostrarConciliados] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const [modalAbierto, setModalAbierto] = useState(false);
  const [filaActiva, setFilaActiva] = useState(null);
  const [estadoModal, setEstadoModal] = useState("");
  const [observacionModal, setObservacionModal] = useState("");

  const [ladoAjuste, setLadoAjuste] = useState("facturacion");
  const [fechaOrigenAjuste, setFechaOrigenAjuste] = useState("");
  const [montoAjuste, setMontoAjuste] = useState("");
  const [observacionAjuste, setObservacionAjuste] = useState("");

  const [desdeHistorico, setDesdeHistorico] = useState(inicioAnio());
  const [hastaHistorico, setHastaHistorico] = useState(hoy());
  const [buscarFechaOrigen, setBuscarFechaOrigen] = useState("");

  useEffect(() => {
    cargarEmpresas();
    cargarEmpresaSeleccionada();
  }, []);

  useEffect(() => {
    if (empresaId && desde && hasta) {
      cargarConciliacion();
    } else {
      setFilas([]);
      setFacturasDetalle([]);
      setCortesDetalle([]);
      setResumenDiasHistorico([]);
      setAjustesHistoricos([]);
    }
  }, [empresaId, desde, hasta]);

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

  const cargarConciliacion = async () => {
    setCargando(true);

    try {
      const { data: facturacionData, error: errorFacturacion } = await supabase
        .from("facturacion_detalle")
        .select(`
          id,
          empresa_id,
          fecha,
          numdoc,
          nombre,
          totalvent,
          clasedoc,
          tipodocum
        `)
        .eq("empresa_id", Number(empresaId))
        .lte("fecha", hasta)
        .order("fecha", { ascending: true });

      if (errorFacturacion) {
        console.error("Error cargando facturación:", errorFacturacion);
        return null;
      }

      const fechaMinFacturacion =
        facturacionData && facturacionData.length > 0 ? facturacionData[0].fecha : null;

      const { data: cortes, error: errorCortes } = await supabase
        .from("corte_diario")
        .select("id, fecha")
        .eq("empresa_id", Number(empresaId))
        .lte("fecha", hasta)
        .order("fecha", { ascending: true });

      if (errorCortes) {
        console.error("Error cargando cortes:", errorCortes);
        return null;
      }

      const fechaMinCorte =
        cortes && cortes.length > 0 ? cortes[0].fecha : null;

      const fechaInicioHistorico =
        [fechaMinFacturacion, fechaMinCorte, desde]
          .filter(Boolean)
          .sort()[0] || desde;

      const mapaFechaPorCorte = {};
      const corteIds = [];

      (cortes || []).forEach((c) => {
        mapaFechaPorCorte[c.id] = c.fecha;
        corteIds.push(c.id);
      });

      let detalleCorte = [];
      if (corteIds.length > 0) {
        const { data, error } = await supabase
          .from("corte_diario_detalle")
          .select(`
            id,
            corte_id,
            tipo_ingreso,
            subtipo,
            monto_bruto,
            monto_neto,
            numero_remesa,
            banco_destino,
            observacion
          `)
          .in("corte_id", corteIds)
          .order("id", { ascending: true });

        if (error) {
          console.error("Error cargando detalle de corte:", error);
          return null;
        }

        detalleCorte = data || [];
      }

      const { data: notas, error: errorNotas } = await supabase
        .from("conciliacion_facturacion_corte")
        .select("id, fecha, estado, observacion")
        .eq("empresa_id", Number(empresaId))
        .gte("fecha", desde)
        .lte("fecha", hasta);

      if (errorNotas) {
        console.error("Error cargando notas de conciliación:", errorNotas);
        return null;
      }

      const { data: ajustes, error: errorAjustes } = await supabase
        .from("conciliacion_facturacion_corte_ajuste")
        .select("*")
        .eq("empresa_id", Number(empresaId))
        .lte("fecha_destino", hasta)
        .order("created_at", { ascending: true });

      if (errorAjustes) {
        console.error("Error cargando ajustes históricos:", errorAjustes);
        return null;
      }

      const mapaFacturacionBase = {};
      (facturacionData || []).forEach((item) => {
        mapaFacturacionBase[item.fecha] =
          (mapaFacturacionBase[item.fecha] || 0) + Number(item.totalvent || 0);
      });

      const mapaCorteBase = {};
      (detalleCorte || []).forEach((d) => {
        const fecha = mapaFechaPorCorte[d.corte_id];
        if (!fecha) return;
        mapaCorteBase[fecha] = (mapaCorteBase[fecha] || 0) + Number(d.monto_bruto || 0);
      });

      const mapaFacturacionAjustado = { ...mapaFacturacionBase };
      const mapaCorteAjustado = { ...mapaCorteBase };

      (ajustes || []).forEach((aj) => {
        const monto = Number(aj.monto || 0);

        if (aj.lado === "facturacion") {
          mapaFacturacionAjustado[aj.fecha_origen] =
            Number(mapaFacturacionAjustado[aj.fecha_origen] || 0) - monto;
          mapaFacturacionAjustado[aj.fecha_destino] =
            Number(mapaFacturacionAjustado[aj.fecha_destino] || 0) + monto;
        }

        if (aj.lado === "corte") {
          mapaCorteAjustado[aj.fecha_origen] =
            Number(mapaCorteAjustado[aj.fecha_origen] || 0) - monto;
          mapaCorteAjustado[aj.fecha_destino] =
            Number(mapaCorteAjustado[aj.fecha_destino] || 0) + monto;
        }
      });

      const mapaNotas = {};
      (notas || []).forEach((n) => {
        mapaNotas[n.fecha] = n;
      });

      const fechasHistoricas = generarRangoFechas(fechaInicioHistorico, hasta);

      const resumenHistorico = fechasHistoricas.map((fecha) => {
        const totalFacturadoOriginal = Number(mapaFacturacionBase[fecha] || 0);
        const totalCorteOriginal = Number(mapaCorteBase[fecha] || 0);

        const totalFacturado = Number(mapaFacturacionAjustado[fecha] || 0);
        const totalCorte = Number(mapaCorteAjustado[fecha] || 0);

        return {
          fecha,
          totalFacturadoOriginal,
          totalCorteOriginal,
          totalFacturado,
          totalCorte,
          diferencia: Number((totalFacturado - totalCorte).toFixed(2)),
        };
      });

      const fechas = generarRangoFechas(desde, hasta);

      const resultado = fechas.map((fecha) => {
        const resumenDia =
          resumenHistorico.find((r) => r.fecha === fecha) || null;

        const totalFacturado = Number(resumenDia?.totalFacturado || 0);
        const totalCorte = Number(resumenDia?.totalCorte || 0);
        const diferencia = Number((totalFacturado - totalCorte).toFixed(2));
        const nota = mapaNotas[fecha];

        return {
          fecha,
          id_db: nota?.id || null,
          totalFacturado,
          totalCorte,
          diferencia,
          estado: nota?.estado || estadoAutomatico(totalFacturado, totalCorte),
          observacion: nota?.observacion || "",
        };
      });

      setFilas(resultado);
      setFacturasDetalle(facturacionData || []);
      setCortesDetalle(
        (detalleCorte || []).map((d) => ({
          ...d,
          fecha: mapaFechaPorCorte[d.corte_id] || "",
        }))
      );
      setResumenDiasHistorico(resumenHistorico);
      setAjustesHistoricos(ajustes || []);

      return {
        filas: resultado,
        resumenHistorico,
        ajustes: ajustes || [],
      };
    } catch (error) {
      console.error("Error general cargando conciliación:", error);
      return null;
    } finally {
      setCargando(false);
    }
  };

  const filasFiltradas = useMemo(() => {
    let data = [...filas];

    if (!mostrarConciliados) {
      data = data.filter((f) => f.estado !== "conciliado");
    }

    if (busqueda.trim()) {
      data = data.filter(
        (f) =>
          textoIncluye(f.fecha, busqueda) ||
          textoIncluye(f.estado, busqueda) ||
          textoIncluye(f.observacion, busqueda) ||
          textoIncluye(f.totalFacturado, busqueda) ||
          textoIncluye(f.totalCorte, busqueda) ||
          textoIncluye(f.diferencia, busqueda)
      );
    }

    return data;
  }, [filas, mostrarConciliados, busqueda]);

  const resumen = useMemo(() => {
    return filas.reduce(
      (acc, fila) => {
        acc.facturado += Number(fila.totalFacturado || 0);
        acc.corte += Number(fila.totalCorte || 0);
        acc.diferencia += Number(fila.diferencia || 0);

        if (fila.estado === "conciliado") acc.conciliados += 1;
        if (fila.estado === "falta_facturar") acc.faltaFacturar += 1;
        if (fila.estado === "falta_corte") acc.faltaCorte += 1;
        if (fila.estado === "desfase_historico") acc.desfaseHistorico += 1;
        if (fila.estado === "revisar") acc.revisar += 1;
        if (fila.estado === "pendiente") acc.pendiente += 1;

        return acc;
      },
      {
        facturado: 0,
        corte: 0,
        diferencia: 0,
        conciliados: 0,
        faltaFacturar: 0,
        faltaCorte: 0,
        desfaseHistorico: 0,
        revisar: 0,
        pendiente: 0,
      }
    );
  }, [filas]);

  const abrirModal = (fila) => {
    setFilaActiva(fila);
    setEstadoModal(fila.estado || "pendiente");
    setObservacionModal(fila.observacion || "");

    const ladoSugerido =
      Number(fila.diferencia || 0) < 0 ? "facturacion" : "corte";

    setLadoAjuste(ladoSugerido);
    setFechaOrigenAjuste("");
    setMontoAjuste("");
    setObservacionAjuste("");

    setDesdeHistorico(primerDiaMesDeFecha(fila.fecha));
    setHastaHistorico(hasta);
    setBuscarFechaOrigen("");

    setModalAbierto(true);
  };

  const cerrarModal = () => {
    if (guardando || guardandoAjuste) return;
    setModalAbierto(false);
    setFilaActiva(null);
    setEstadoModal("");
    setObservacionModal("");
    setLadoAjuste("facturacion");
    setFechaOrigenAjuste("");
    setMontoAjuste("");
    setObservacionAjuste("");
    setDesdeHistorico(inicioAnio());
    setHastaHistorico(hoy());
    setBuscarFechaOrigen("");
  };

  const facturasDelDia = useMemo(() => {
    if (!filaActiva) return [];
    return facturasDetalle.filter((f) => f.fecha === filaActiva.fecha);
  }, [filaActiva, facturasDetalle]);

  const cortesDelDia = useMemo(() => {
    if (!filaActiva) return [];
    return cortesDetalle.filter((c) => c.fecha === filaActiva.fecha);
  }, [filaActiva, cortesDetalle]);

  const historicoDias = useMemo(() => {
    if (!filaActiva?.fecha) return [];

    return resumenDiasHistorico
      .filter((r) => {
        const okDesde = !desdeHistorico || r.fecha >= desdeHistorico;
        const okHasta = !hastaHistorico || r.fecha <= hastaHistorico;
        return okDesde && okHasta;
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((r) => {
        const disponibleFacturacion = Math.max(
          0,
          Number((r.totalFacturado - r.totalCorte).toFixed(2))
        );
        const disponibleCorte = Math.max(
          0,
          Number((r.totalCorte - r.totalFacturado).toFixed(2))
        );

        return {
          ...r,
          disponibleFacturacion,
          disponibleCorte,
        };
      });
  }, [filaActiva, resumenDiasHistorico, desdeHistorico, hastaHistorico]);

  const resumenHistorico = useMemo(() => {
    const totalFacturas = historicoDias.reduce(
      (acc, item) => acc + Number(item.totalFacturado || 0),
      0
    );

    const totalCortes = historicoDias.reduce(
      (acc, item) => acc + Number(item.totalCorte || 0),
      0
    );

    return {
      totalFacturas,
      totalCortes,
      diferencia: Number((totalFacturas - totalCortes).toFixed(2)),
    };
  }, [historicoDias]);

  const sugerenciaHistorica = useMemo(() => {
    if (!filaActiva) return "";

    const difDia = Number(filaActiva.diferencia || 0);
    const difHist = Number(resumenHistorico.diferencia || 0);

    if (Math.abs(difDia) < 0.01) {
      return "El día ya está conciliado.";
    }

    if (Math.abs(difHist) < 0.01) {
      return "La diferencia del día parece compensarse dentro del rango histórico filtrado. Probablemente es un desfase de fecha.";
    }

    if (difDia < 0 && difHist < 0) {
      return "Parece que sí hace falta facturar o revisar si esas ventas se facturaron en otra fecha más antigua o posterior.";
    }

    if (difDia > 0 && difHist > 0) {
      return "Parece que el problema está más del lado del corte. Hay más facturación que corte también en el rango filtrado.";
    }

    return "Hay diferencia en el día y también movimiento desigual en el rango filtrado. Revisá detalle antes de decidir.";
  }, [filaActiva, resumenHistorico]);

  const ajustesRelacionados = useMemo(() => {
    if (!filaActiva?.fecha) return [];

    return ajustesHistoricos
      .filter(
        (aj) =>
          aj.fecha_origen === filaActiva.fecha || aj.fecha_destino === filaActiva.fecha
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [filaActiva, ajustesHistoricos]);

  const candidatosParaMover = useMemo(() => {
    if (!filaActiva?.fecha) return [];

    return historicoDias
      .filter((r) => r.fecha !== filaActiva.fecha)
      .filter((r) => {
        if (!buscarFechaOrigen.trim()) return true;
        return textoIncluye(r.fecha, buscarFechaOrigen);
      })
      .map((r) => ({
        fecha: r.fecha,
        disponibleFacturacion: Number(r.disponibleFacturacion || 0),
        disponibleCorte: Number(r.disponibleCorte || 0),
        totalFacturado: Number(r.totalFacturado || 0),
        totalCorte: Number(r.totalCorte || 0),
        diferencia: Number(r.diferencia || 0),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [filaActiva, historicoDias, buscarFechaOrigen]);

  const montoNecesarioDia = useMemo(() => {
    if (!filaActiva) return 0;
    return Math.abs(Number(filaActiva.diferencia || 0));
  }, [filaActiva]);

  const detalleReportePorDia = useMemo(() => {
    return filasFiltradas.map((fila) => {
      const facturas = facturasDetalle
        .filter((f) => f.fecha === fila.fecha)
        .map((f) => ({
          documento: f.numdoc || "-",
          cliente: f.nombre || "-",
          clase: f.clasedoc || f.tipodocum || "-",
          total: Number(f.totalvent || 0),
        }));

      const cortes = cortesDetalle
        .filter((c) => c.fecha === fila.fecha)
        .map((c) => ({
          tipo: c.tipo_ingreso || "-",
          subtipo: c.subtipo || "-",
          banco: c.banco_destino || "-",
          monto: Number(c.monto_bruto || 0),
        }));

      return {
        fecha: fila.fecha,
        totalFacturado: Number(fila.totalFacturado || 0),
        totalCorte: Number(fila.totalCorte || 0),
        diferencia: Number(fila.diferencia || 0),
        estado: etiquetaEstado(fila.estado),
        observacion: fila.observacion || "",
        facturas,
        cortes,
      };
    });
  }, [filasFiltradas, facturasDetalle, cortesDetalle]);

  const guardarRevision = async () => {
    if (!filaActiva) return;

    setGuardando(true);

    try {
      const payload = {
        empresa_id: Number(empresaId),
        fecha: filaActiva.fecha,
        estado: estadoModal,
        observacion: observacionModal || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("conciliacion_facturacion_corte")
        .upsert([payload], { onConflict: "empresa_id,fecha" })
        .select()
        .single();

      if (error) throw error;

      setFilas((prev) =>
        prev.map((f) =>
          f.fecha === filaActiva.fecha
            ? {
                ...f,
                id_db: data.id,
                estado: estadoModal,
                observacion: observacionModal || "",
              }
            : f
        )
      );

      alert("Revisión guardada.");
      cerrarModal();
    } catch (error) {
      console.error("Error guardando revisión:", error);
      alert(`Error al guardar: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const guardarAjusteHistorico = async () => {
    if (!filaActiva?.fecha) {
      alert("No hay fila activa.");
      return;
    }

    if (!fechaOrigenAjuste) {
      alert("Seleccioná una fecha origen.");
      return;
    }

    if (fechaOrigenAjuste === filaActiva.fecha) {
      alert("La fecha origen no puede ser igual a la fecha destino.");
      return;
    }

    const monto = Number(montoAjuste || 0);
    if (monto <= 0) {
      alert("Ingresá un monto válido.");
      return;
    }

    setGuardandoAjuste(true);

    try {
      const payload = {
        empresa_id: Number(empresaId),
        fecha_origen: fechaOrigenAjuste,
        fecha_destino: filaActiva.fecha,
        lado: ladoAjuste,
        monto,
        observacion:
          observacionAjuste ||
          `Ajuste histórico ${ladoAjuste} de ${fechaOrigenAjuste} hacia ${filaActiva.fecha}`,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("conciliacion_facturacion_corte_ajuste")
        .insert([payload]);

      if (error) throw error;

      const recarga = await cargarConciliacion();
      const filaNueva = recarga?.filas?.find((f) => f.fecha === filaActiva.fecha);

      if (filaNueva) {
        setFilaActiva(filaNueva);
        setEstadoModal(filaNueva.estado || "pendiente");
      }

      setFechaOrigenAjuste("");
      setMontoAjuste("");
      setObservacionAjuste("");

      alert("Ajuste histórico guardado.");
    } catch (error) {
      console.error("Error guardando ajuste histórico:", error);
      alert(`Error al guardar ajuste: ${error.message}`);
    } finally {
      setGuardandoAjuste(false);
    }
  };

  const eliminarAjuste = async (id) => {
    const confirmar = window.confirm("¿Seguro que querés eliminar este ajuste?");
    if (!confirmar) return;

    try {
      const { error } = await supabase
        .from("conciliacion_facturacion_corte_ajuste")
        .delete()
        .eq("id", Number(id));

      if (error) throw error;

      const recarga = await cargarConciliacion();
      const filaNueva = recarga?.filas?.find((f) => f.fecha === filaActiva.fecha);

      if (filaNueva) {
        setFilaActiva(filaNueva);
        setEstadoModal(filaNueva.estado || "pendiente");
      }

      alert("Ajuste eliminado.");
    } catch (error) {
      console.error("Error eliminando ajuste:", error);
      alert(`Error al eliminar ajuste: ${error.message}`);
    }
  };

  const exportarModalExcel = () => {
    if (!filaActiva) {
      alert("No hay fila seleccionada.");
      return;
    }

    try {
      setExportandoExcel(true);

      const wb = XLSX.utils.book_new();

      const wsResumenDia = XLSX.utils.aoa_to_sheet([
        ["REVISIÓN DE DIFERENCIA FACTURACIÓN VS CORTE"],
        ["Fecha revisada", filaActiva.fecha],
        ["Estado actual", estadoModal],
        ["Observación", observacionModal || ""],
        [""],
        ["Facturación del día", Number(filaActiva.totalFacturado || 0)],
        ["Corte del día", Number(filaActiva.totalCorte || 0)],
        ["Diferencia del día", Number(filaActiva.diferencia || 0)],
        [""],
        ["Desde histórico", desdeHistorico || ""],
        ["Hasta histórico", hastaHistorico || ""],
        ["Facturación histórica", Number(resumenHistorico.totalFacturas || 0)],
        ["Corte histórica", Number(resumenHistorico.totalCortes || 0)],
        ["Diferencia histórica", Number(resumenHistorico.diferencia || 0)],
        ["Sugerencia", sugerenciaHistorica],
      ]);
      wsResumenDia["!cols"] = [{ wch: 24 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, wsResumenDia, "Resumen");

      const wsFacturasDia = XLSX.utils.json_to_sheet(
        facturasDelDia.map((item) => ({
          Fecha: item.fecha || "",
          Documento: item.numdoc || "",
          Cliente: item.nombre || "",
          Clase: item.clasedoc || item.tipodocum || "",
          Total: Number(item.totalvent || 0),
        }))
      );
      wsFacturasDia["!cols"] = [
        { wch: 14 },
        { wch: 18 },
        { wch: 34 },
        { wch: 18 },
        { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, wsFacturasDia, "Facturas_dia");

      const wsCortesDia = XLSX.utils.json_to_sheet(
        cortesDelDia.map((item) => ({
          Fecha: item.fecha || "",
          Tipo: item.tipo_ingreso || "",
          Subtipo: item.subtipo || "",
          Banco: item.banco_destino || "",
          Monto: Number(item.monto_bruto || 0),
        }))
      );
      wsCortesDia["!cols"] = [
        { wch: 14 },
        { wch: 16 },
        { wch: 18 },
        { wch: 24 },
        { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, wsCortesDia, "Corte_dia");

      const wsHistorico = XLSX.utils.json_to_sheet(
        historicoDias.map((item) => ({
          Fecha: item.fecha,
          Facturacion_Original: Number(item.totalFacturadoOriginal || 0),
          Corte_Original: Number(item.totalCorteOriginal || 0),
          Facturacion_Ajustada: Number(item.totalFacturado || 0),
          Corte_Ajustado: Number(item.totalCorte || 0),
          Diferencia: Number(item.diferencia || 0),
          Disponible_Facturacion: Number(item.disponibleFacturacion || 0),
          Disponible_Corte: Number(item.disponibleCorte || 0),
        }))
      );
      wsHistorico["!cols"] = [
        { wch: 14 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 14 },
        { wch: 20 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, wsHistorico, "Historico");

      const wsAjustes = XLSX.utils.json_to_sheet(
        ajustesRelacionados.map((aj) => ({
          ID: aj.id,
          Lado: aj.lado,
          Fecha_Origen: aj.fecha_origen,
          Fecha_Destino: aj.fecha_destino,
          Monto: Number(aj.monto || 0),
          Observacion: aj.observacion || "",
          Creado: aj.created_at || "",
        }))
      );
      wsAjustes["!cols"] = [
        { wch: 10 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 50 },
        { wch: 24 },
      ];
      XLSX.utils.book_append_sheet(wb, wsAjustes, "Ajustes");

      const nombre = `Revision_${filaActiva.fecha}_${empresaId}.xlsx`;
      XLSX.writeFile(wb, nombre);
    } catch (error) {
      console.error("Error exportando Excel:", error);
      alert(`Error exportando Excel: ${error.message}`);
    } finally {
      setExportandoExcel(false);
    }
  };

  const exportarDetalleExcel = () => {
    try {
      setExportandoExcelDetalle(true);

      const wb = XLSX.utils.book_new();

      const filasExcel = [];

      detalleReportePorDia.forEach((dia) => {
        filasExcel.push({
          Tipo: "RESUMEN DÍA",
          Fecha: dia.fecha,
          Documento: "",
          Cliente: "",
          Clase_o_Tipo: "",
          Banco: "",
          Facturacion: dia.totalFacturado,
          Corte: dia.totalCorte,
          Diferencia: dia.diferencia,
          Estado: dia.estado,
          Observacion: dia.observacion || "",
        });

        if (dia.facturas.length === 0) {
          filasExcel.push({
            Tipo: "FACTURA",
            Fecha: dia.fecha,
            Documento: "-",
            Cliente: "Sin facturas registradas",
            Clase_o_Tipo: "-",
            Banco: "",
            Facturacion: 0,
            Corte: "",
            Diferencia: "",
            Estado: "",
            Observacion: "",
          });
        } else {
          dia.facturas.forEach((factura) => {
            filasExcel.push({
              Tipo: "FACTURA",
              Fecha: dia.fecha,
              Documento: factura.documento,
              Cliente: factura.cliente,
              Clase_o_Tipo: factura.clase,
              Banco: "",
              Facturacion: factura.total,
              Corte: "",
              Diferencia: "",
              Estado: "",
              Observacion: "",
            });
          });
        }

        if (dia.cortes.length === 0) {
          filasExcel.push({
            Tipo: "CORTE",
            Fecha: dia.fecha,
            Documento: "",
            Cliente: "",
            Clase_o_Tipo: "Sin movimientos de corte",
            Banco: "-",
            Facturacion: "",
            Corte: 0,
            Diferencia: "",
            Estado: "",
            Observacion: "",
          });
        } else {
          dia.cortes.forEach((corte) => {
            filasExcel.push({
              Tipo: "CORTE",
              Fecha: dia.fecha,
              Documento: "",
              Cliente: "",
              Clase_o_Tipo: `${corte.tipo} / ${corte.subtipo}`,
              Banco: corte.banco,
              Facturacion: "",
              Corte: corte.monto,
              Diferencia: "",
              Estado: "",
              Observacion: "",
            });
          });
        }

        filasExcel.push({
          Tipo: "",
          Fecha: "",
          Documento: "",
          Cliente: "",
          Clase_o_Tipo: "",
          Banco: "",
          Facturacion: "",
          Corte: "",
          Diferencia: "",
          Estado: "",
          Observacion: "",
        });
      });

      const ws = XLSX.utils.json_to_sheet(filasExcel);

      ws["!cols"] = [
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 34 },
        { wch: 26 },
        { wch: 24 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 18 },
        { wch: 40 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Detalle_por_dia");

      const nombre = `Detalle_Diario_Facturacion_Corte_${desde}_${hasta}.xlsx`;
      XLSX.writeFile(wb, nombre);
    } catch (error) {
      console.error("Error exportando detalle Excel:", error);
      alert(`Error al exportar Excel: ${error.message}`);
    } finally {
      setExportandoExcelDetalle(false);
    }
  };

  const exportarDetallePDF = () => {
    try {
      setExportandoPdfDetalle(true);

      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      let primeraPagina = true;

      detalleReportePorDia.forEach((dia, index) => {
        if (!primeraPagina) {
          doc.addPage();
        }
        primeraPagina = false;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("Detalle diario Facturación vs Corte", 14, 16);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Fecha: ${dia.fecha}`, 14, 24);
        doc.text(`Estado: ${dia.estado}`, 14, 30);
        doc.text(`Facturación: $${dinero(dia.totalFacturado)}`, 14, 36);
        doc.text(`Corte: $${dinero(dia.totalCorte)}`, 75, 36);
        doc.text(`Diferencia: $${dinero(dia.diferencia)}`, 130, 36);

        doc.setFont("helvetica", "bold");
        doc.text("Observación:", 14, 44);
        doc.setFont("helvetica", "normal");
        const observacion = dia.observacion || "Sin observación";
        const obsLines = doc.splitTextToSize(observacion, pageWidth - 28);
        doc.text(obsLines, 14, 50);

        let currentY = 50 + obsLines.length * 5 + 6;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Facturas del día", 14, currentY);

        autoTable(doc, {
          startY: currentY + 4,
          head: [["Documento", "Cliente", "Clase", "Total"]],
          body:
            dia.facturas.length > 0
              ? dia.facturas.map((factura) => [
                  factura.documento,
                  factura.cliente,
                  factura.clase,
                  `$${dinero(factura.total)}`,
                ])
              : [["-", "Sin facturas registradas", "-", "$0.00"]],
          styles: {
            fontSize: 8.5,
            cellPadding: 2.5,
            overflow: "linebreak",
          },
          headStyles: {
            fillColor: [111, 91, 126],
          },
          columnStyles: {
            1: { cellWidth: 80 },
          },
        });

        currentY = doc.lastAutoTable.finalY + 8;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Detalle de métodos de pago / corte", 14, currentY);

        autoTable(doc, {
          startY: currentY + 4,
          head: [["Tipo", "Subtipo", "Banco", "Monto"]],
          body:
            dia.cortes.length > 0
              ? dia.cortes.map((corte) => [
                  corte.tipo,
                  corte.subtipo,
                  corte.banco,
                  `$${dinero(corte.monto)}`,
                ])
              : [["-", "Sin movimientos de corte", "-", "$0.00"]],
          styles: {
            fontSize: 8.5,
            cellPadding: 2.5,
            overflow: "linebreak",
          },
          headStyles: {
            fillColor: [111, 91, 126],
          },
          columnStyles: {
            2: { cellWidth: 65 },
          },
        });

        doc.setDrawColor(220, 220, 220);
        doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(`Página ${index + 1}`, pageWidth - 28, pageHeight - 8);
      });

      doc.save(`Detalle_Diario_Facturacion_Corte_${desde}_${hasta}.pdf`);
    } catch (error) {
      console.error("Error exportando PDF:", error);
      alert(`Error al exportar PDF: ${error.message}`);
    } finally {
      setExportandoPdfDetalle(false);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🧾 Conciliación Facturación vs Corte</h1>
            <p className="subtitle">
              Revisa las diferencias por día y trabaja los faltantes con apoyo histórico.
            </p>
          </div>

          <div className="actions">
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/inicio")}
            >
              Ir a Inicio
            </button>
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
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="input"
                placeholder="fecha, estado, monto, observación..."
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "14px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              <input
                type="checkbox"
                checked={mostrarConciliados}
                onChange={(e) => setMostrarConciliados(e.target.checked)}
              />
              Mostrar conciliados
            </label>

            <button
              className="btn btn-secondary"
              onClick={exportarDetalleExcel}
              disabled={exportandoExcelDetalle}
            >
              {exportandoExcelDetalle ? "Exportando Excel..." : "Exportar detalle Excel"}
            </button>

            <button
              className="btn btn-primary"
              onClick={exportarDetallePDF}
              disabled={exportandoPdfDetalle}
            >
              {exportandoPdfDetalle ? "Exportando PDF..." : "Exportar detalle PDF"}
            </button>
          </div>
        </div>

        <div className="grid grid-3" style={{ marginBottom: "18px" }}>
          <div className="stat-card">
            <p className="stat-title">Total facturado</p>
            <p className="stat-value">${dinero(resumen.facturado)}</p>
          </div>

          <div className="stat-card">
            <p className="stat-title">Total corte</p>
            <p className="stat-value">${dinero(resumen.corte)}</p>
          </div>

          <div className="stat-card">
            <p className="stat-title">Diferencia acumulada</p>
            <p className="stat-value">${dinero(resumen.diferencia)}</p>
          </div>
        </div>

        <div className="grid grid-3" style={{ marginBottom: "18px" }}>
          <div className="card">
            <h2 className="module-title" style={{ marginBottom: "10px" }}>
              Estados
            </h2>
            <div className="grid">
              <span className="badge">Conciliados: {resumen.conciliados}</span>
              <span className="badge">Falta facturar: {resumen.faltaFacturar}</span>
              <span className="badge">Falta en corte: {resumen.faltaCorte}</span>
              <span className="badge">Desfase histórico: {resumen.desfaseHistorico}</span>
              <span className="badge">Revisar: {resumen.revisar}</span>
              <span className="badge">Pendiente: {resumen.pendiente}</span>
            </div>
          </div>

          <div className="card">
            <h2 className="module-title" style={{ marginBottom: "10px" }}>
              Lectura rápida
            </h2>
            <div className="grid">
              <span className="badge">Facturación menor = falta facturar</span>
              <span className="badge">Facturación mayor = falta en corte</span>
              <span className="badge">Compensa en histórico = desfase histórico</span>
            </div>
          </div>

          <div className="card">
            <h2 className="module-title" style={{ marginBottom: "10px" }}>
              Vista
            </h2>
            <div className="grid">
              <span className="badge">Se ocultan conciliados por defecto</span>
              <span className="badge">Trabajás un día a la vez</span>
              <span className="badge">Histórico filtrable dentro del modal</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="module-title" style={{ marginBottom: "14px" }}>
            Diferencias de facturación vs corte
          </h2>

          {cargando ? (
            <p className="module-text">Cargando conciliación...</p>
          ) : filasFiltradas.length === 0 ? (
            <p className="module-text">
              No hay diferencias pendientes con los filtros seleccionados.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Facturación</th>
                    <th>Corte</th>
                    <th>Diferencia</th>
                    <th>Estado</th>
                    <th>Observación</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filasFiltradas.map((fila) => (
                    <tr key={fila.fecha}>
                      <td>{fila.fecha}</td>
                      <td>${dinero(fila.totalFacturado)}</td>
                      <td>${dinero(fila.totalCorte)}</td>
                      <td>${dinero(fila.diferencia)}</td>
                      <td>
                        <span
                          style={{
                            ...colorEstado(fila.estado),
                            padding: "4px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 600,
                            display: "inline-block",
                          }}
                        >
                          {etiquetaEstado(fila.estado)}
                        </span>
                      </td>
                      <td>{fila.observacion || "-"}</td>
                      <td>
                        <button
                          className="btn btn-primary"
                          onClick={() => abrirModal(fila)}
                        >
                          Revisar
                        </button>
                      </td>
                    </tr>
                  ))}

                  {filasFiltradas.length === 0 && (
                    <tr>
                      <td
                        colSpan="7"
                        style={{ textAlign: "center", color: "#64748b" }}
                      >
                        No hay datos para el período seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {modalAbierto && filaActiva && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.55)",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
            onClick={cerrarModal}
          >
            <div
              className="card"
              style={{
                width: "min(1350px, 96vw)",
                maxHeight: "92vh",
                overflow: "auto",
                borderRadius: "18px",
                padding: "20px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  alignItems: "center",
                  marginBottom: "18px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 className="module-title" style={{ marginBottom: "4px" }}>
                    Revisar diferencia del día
                  </h2>
                  <p className="module-text" style={{ margin: 0 }}>
                    Revisá el día y el histórico filtrado. Si encontrás el desfase, movelo desde otra fecha.
                  </p>
                </div>

                <div className="actions">
                  <button
                    className="btn btn-secondary"
                    onClick={exportarModalExcel}
                    disabled={exportandoExcel}
                  >
                    {exportandoExcel ? "Exportando..." : "Exportar modal a Excel"}
                  </button>

                  <button className="btn btn-secondary" onClick={cerrarModal}>
                    Cerrar
                  </button>
                </div>
              </div>

              <div className="grid grid-4" style={{ marginBottom: "18px" }}>
                <div className="stat-card">
                  <p className="stat-title">Fecha</p>
                  <p className="stat-value" style={{ fontSize: "18px" }}>
                    {filaActiva.fecha}
                  </p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Facturación del día</p>
                  <p className="stat-value">${dinero(filaActiva.totalFacturado)}</p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Corte del día</p>
                  <p className="stat-value">${dinero(filaActiva.totalCorte)}</p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Diferencia del día</p>
                  <p className="stat-value">${dinero(filaActiva.diferencia)}</p>
                </div>
              </div>

              <div className="card" style={{ marginBottom: "18px" }}>
                <h3 className="module-title" style={{ marginBottom: "10px" }}>
                  Filtro histórico dentro del modal
                </h3>

                <div className="grid grid-4">
                  <div>
                    <label className="label">Desde histórico</label>
                    <input
                      type="date"
                      value={desdeHistorico}
                      onChange={(e) => setDesdeHistorico(e.target.value)}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label">Hasta histórico</label>
                    <input
                      type="date"
                      value={hastaHistorico}
                      onChange={(e) => setHastaHistorico(e.target.value)}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label">Buscar fecha origen</label>
                    <input
                      type="text"
                      value={buscarFechaOrigen}
                      onChange={(e) => setBuscarFechaOrigen(e.target.value)}
                      className="input"
                      placeholder="Ej: 2026-01"
                    />
                  </div>

                  <div>
                    <label className="label">Mover del lado</label>
                    <select
                      value={ladoAjuste}
                      onChange={(e) => {
                        setLadoAjuste(e.target.value);
                        setFechaOrigenAjuste("");
                        setMontoAjuste("");
                      }}
                      className="select"
                    >
                      <option value="facturacion">Facturación</option>
                      <option value="corte">Corte</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: "18px" }}>
                <h3 className="module-title" style={{ marginBottom: "10px" }}>
                  Lectura histórica sugerida
                </h3>

                <div className="grid grid-4" style={{ marginBottom: "14px" }}>
                  <div className="stat-card">
                    <p className="stat-title">Rango usado</p>
                    <p className="stat-value" style={{ fontSize: "16px" }}>
                      {desdeHistorico} a {hastaHistorico}
                    </p>
                  </div>

                  <div className="stat-card">
                    <p className="stat-title">Facturación histórica</p>
                    <p className="stat-value">${dinero(resumenHistorico.totalFacturas)}</p>
                  </div>

                  <div className="stat-card">
                    <p className="stat-title">Corte histórico</p>
                    <p className="stat-value">${dinero(resumenHistorico.totalCortes)}</p>
                  </div>

                  <div className="stat-card">
                    <p className="stat-title">Diferencia histórica</p>
                    <p className="stat-value">${dinero(resumenHistorico.diferencia)}</p>
                  </div>
                </div>

                <div className="card" style={{ background: "#fbf8ff" }}>
                  <p className="module-text" style={{ margin: 0 }}>
                    <strong>Sugerencia:</strong> {sugerenciaHistorica}
                  </p>
                </div>
              </div>

              <div className="grid grid-2" style={{ marginBottom: "18px" }}>
                <div className="card">
                  <h3 className="module-title" style={{ marginBottom: "10px" }}>
                    Facturas del día
                  </h3>

                  {facturasDelDia.length === 0 ? (
                    <p className="module-text">No hay facturas en esta fecha.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Documento</th>
                            <th>Cliente</th>
                            <th>Clase</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {facturasDelDia.map((item) => (
                            <tr key={item.id}>
                              <td>{item.numdoc || "-"}</td>
                              <td>{item.nombre || "-"}</td>
                              <td>{item.clasedoc || item.tipodocum || "-"}</td>
                              <td>${dinero(item.totalvent)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="card">
                  <h3 className="module-title" style={{ marginBottom: "10px" }}>
                    Detalle de corte del día
                  </h3>

                  {cortesDelDia.length === 0 ? (
                    <p className="module-text">No hay detalle de corte en esta fecha.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Tipo</th>
                            <th>Subtipo</th>
                            <th>Banco</th>
                            <th>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cortesDelDia.map((item) => (
                            <tr key={item.id}>
                              <td>{item.tipo_ingreso || "-"}</td>
                              <td>{item.subtipo || "-"}</td>
                              <td>{item.banco_destino || "-"}</td>
                              <td>${dinero(item.monto_bruto)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="card" style={{ marginBottom: "18px" }}>
                <h3 className="module-title" style={{ marginBottom: "10px" }}>
                  Fechas origen disponibles para mover diferencia
                </h3>

                {candidatosParaMover.length === 0 ? (
                  <p className="module-text">No hay fechas disponibles con los filtros actuales.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Usar</th>
                          <th>Fecha</th>
                          <th>Facturación</th>
                          <th>Corte</th>
                          <th>Diferencia</th>
                          <th>Disponible fact.</th>
                          <th>Disponible corte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidatosParaMover.map((c) => (
                          <tr
                            key={c.fecha}
                            style={
                              fechaOrigenAjuste === c.fecha
                                ? { outline: "2px solid #c4b5fd" }
                                : {}
                            }
                          >
                            <td>
                              <button
                                className="btn btn-secondary"
                                onClick={() => setFechaOrigenAjuste(c.fecha)}
                              >
                                Usar esta fecha
                              </button>
                            </td>
                            <td>{c.fecha}</td>
                            <td>${dinero(c.totalFacturado)}</td>
                            <td>${dinero(c.totalCorte)}</td>
                            <td>${dinero(c.diferencia)}</td>
                            <td>${dinero(c.disponibleFacturacion)}</td>
                            <td>${dinero(c.disponibleCorte)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: "18px" }}>
                <h3 className="module-title" style={{ marginBottom: "10px" }}>
                  Mover diferencia desde otra fecha
                </h3>

                <div className="grid grid-3" style={{ marginBottom: "14px" }}>
                  <div>
                    <label className="label">Fecha origen seleccionada</label>
                    <input
                      type="text"
                      value={fechaOrigenAjuste}
                      readOnly
                      className="input"
                      placeholder="Selecciona una fecha de la tabla"
                    />
                  </div>

                  <div>
                    <label className="label">Monto a mover</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={montoAjuste}
                      onChange={(e) => setMontoAjuste(e.target.value)}
                      className="input"
                      placeholder={`Máximo sugerido ${dinero(montoNecesarioDia)}`}
                    />
                  </div>

                  <div>
                    <label className="label">Observación del ajuste</label>
                    <input
                      type="text"
                      value={observacionAjuste}
                      onChange={(e) => setObservacionAjuste(e.target.value)}
                      className="input"
                      placeholder="Ej: se facturó meses después"
                    />
                  </div>
                </div>

                <div className="actions">
                  <button
                    className="btn btn-primary"
                    onClick={guardarAjusteHistorico}
                    disabled={guardandoAjuste}
                  >
                    {guardandoAjuste ? "Guardando ajuste..." : "Mover diferencia"}
                  </button>
                </div>

                <div style={{ marginTop: "14px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <span className="badge">
                    Diferencia del día a cubrir: ${dinero(montoNecesarioDia)}
                  </span>
                  <span className="badge">
                    Se permite mover aunque la fecha origen quede negativa temporalmente
                  </span>
                </div>
              </div>

              <div className="card" style={{ marginBottom: "18px" }}>
                <h3 className="module-title" style={{ marginBottom: "10px" }}>
                  Ajustes históricos relacionados con este día
                </h3>

                {ajustesRelacionados.length === 0 ? (
                  <p className="module-text">No hay ajustes guardados para este día.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Lado</th>
                          <th>Origen</th>
                          <th>Destino</th>
                          <th>Monto</th>
                          <th>Observación</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ajustesRelacionados.map((aj) => (
                          <tr key={aj.id}>
                            <td>{aj.id}</td>
                            <td>{aj.lado}</td>
                            <td>{aj.fecha_origen}</td>
                            <td>{aj.fecha_destino}</td>
                            <td>${dinero(aj.monto)}</td>
                            <td>{aj.observacion || "-"}</td>
                            <td>
                              <button
                                className="btn btn-secondary"
                                onClick={() => eliminarAjuste(aj.id)}
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="grid grid-2" style={{ marginBottom: "18px" }}>
                <div>
                  <label className="label">Estado</label>
                  <select
                    value={estadoModal}
                    onChange={(e) => setEstadoModal(e.target.value)}
                    className="select"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="conciliado">Conciliado</option>
                    <option value="falta_facturar">Falta facturar</option>
                    <option value="falta_corte">Falta en corte</option>
                    <option value="desfase_historico">Desfase histórico</option>
                    <option value="revisar">Revisar</option>
                  </select>
                </div>

                <div>
                  <label className="label">Observación</label>
                  <input
                    type="text"
                    value={observacionModal}
                    onChange={(e) => setObservacionModal(e.target.value)}
                    className="input"
                    placeholder="Comentario del caso"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <button className="btn btn-secondary" onClick={cerrarModal}>
                  Cancelar
                </button>

                <button
                  className="btn btn-primary"
                  onClick={guardarRevision}
                  disabled={guardando}
                >
                  {guardando ? "Guardando..." : "Guardar revisión"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}