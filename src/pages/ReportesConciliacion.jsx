import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

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

const dinero = (n) =>
  new Intl.NumberFormat("es-SV", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(n || 0));

const numero = (n) => Number(n || 0);

const colores = {
  fondo: "#f8f7fb",
  tarjeta: "#ffffff",
  borde: "#ebe7f2",
  morado: "#6d5a7b",
  moradoOscuro: "#594867",
  moradoSuave: "#f4f0f8",
  texto: "#2f2a33",
  textoSuave: "#6f6878",
  verde: "#e6f6ec",
  verdeTexto: "#1f6b45",
  amarillo: "#fff4dc",
  amarilloTexto: "#976400",
  rojo: "#fdebed",
  rojoTexto: "#a23a47",
  azul: "#eaf1ff",
  azulTexto: "#3559a8",
  gris: "#f5f4f7",
  sombra: "0 18px 40px rgba(61, 45, 81, 0.08)",
};

const hexToRgb = (hex) => {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

const cardStyle = {
  background: colores.tarjeta,
  border: `1px solid ${colores.borde}`,
  borderRadius: "24px",
  boxShadow: colores.sombra,
};

const tableHeadStyle = {
  background: colores.morado,
  color: "#fff",
  fontSize: "13px",
  fontWeight: 700,
};

const tdStyle = {
  borderBottom: `1px solid ${colores.borde}`,
  padding: "12px 14px",
  fontSize: "14px",
  color: colores.texto,
  verticalAlign: "top",
  background: "#fff",
};

const badgeEstado = (estado) => {
  const e = String(estado || "").toLowerCase();

  if (
    e === "conciliado" ||
    e === "pagado completo" ||
    e === "depositado completo" ||
    e === "aplicado" ||
    e === "identificado" ||
    e === "facturado"
  ) {
    return {
      background: colores.verde,
      color: colores.verdeTexto,
      border: `1px solid ${colores.verde}`,
      label: estado || "Conciliado",
    };
  }

  if (
    e === "parcial" ||
    e === "pagado parcial" ||
    e === "abono a deuda anterior" ||
    e === "depositado incompleto" ||
    e === "ver detalle abajo" ||
    e === "en tránsito" ||
    e === "pendiente de acreditar" ||
    e === "descuento bancario"
  ) {
    return {
      background: colores.amarillo,
      color: colores.amarilloTexto,
      border: `1px solid ${colores.amarillo}`,
      label: estado || "Parcial",
    };
  }

  return {
    background: colores.rojo,
    color: colores.rojoTexto,
    border: `1px solid ${colores.rojo}`,
    label: estado || "Pendiente",
  };
};

const estadoAlquilerTexto = ({
  montoFacturado,
  montoPagado,
  saldoActual,
  deudaAnterior,
}) => {
  const fact = numero(montoFacturado);
  const pag = numero(montoPagado);
  const saldo = numero(saldoActual);
  const deuda = numero(deudaAnterior);

  if (fact <= 0 && pag > 0 && deuda > 0) return "Abono a deuda anterior";
  if (saldo <= 0 && pag > 0) return "Pagado completo";
  if (pag > 0 && saldo > 0) return "Pagado parcial";
  if (fact <= 0 && pag <= 0) return "Pendiente de facturar";
  return "No pagado";
};

const nombreTipoMovimiento = (tipo) => {
  const t = String(tipo || "").toLowerCase();

  if (t === "traslado") return "Traslado entre cuentas";
  if (t === "otro_ingreso") return "Otro ingreso";
  if (t === "ajuste") return "Ajuste";
  if (t === "no_identificado") return "Pendiente de identificar";

  return tipo || "-";
};

export default function ReportesConciliacion() {
  const navigate = useNavigate();

  const [empresaId, setEmpresaId] = useState("");
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());

  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [guardandoManual, setGuardandoManual] = useState(false);

  const [resumenCorteBanco, setResumenCorteBanco] = useState([]);
  const [detalleAplicaciones, setDetalleAplicaciones] = useState([]);
  const [movimientosEspeciales, setMovimientosEspeciales] = useState([]);
  const [facturasDetalle, setFacturasDetalle] = useState([]);
  const [alquileresManual, setAlquileresManual] = useState([]);

  const [filtroAlquiler, setFiltroAlquiler] = useState("");
  const [clienteManual, setClienteManual] = useState("");
  const [manualForm, setManualForm] = useState({
    monto_facturado: "",
    monto_pagado_manual: "",
    deuda_anterior: "",
    saldo_actual: "",
    estado: "pendiente",
    forma_cobro: "",
    banco: "",
    fecha_acreditado: "",
    observacion: "",
  });

  useEffect(() => {
    cargarEmpresas();
    cargarEmpresaSeleccionada();
  }, []);

  useEffect(() => {
    if (empresaId && desde && hasta) {
      cargarReportes();
    } else {
      setResumenCorteBanco([]);
      setDetalleAplicaciones([]);
      setMovimientosEspeciales([]);
      setFacturasDetalle([]);
      setAlquileresManual([]);
    }
  }, [empresaId, desde, hasta]);

  const empresaActiva = useMemo(() => {
    return empresas.find((e) => String(e.id) === String(empresaId)) || null;
  }, [empresas, empresaId]);

  const periodoBase = useMemo(() => {
    return desde ? `${desde.slice(0, 7)}-01` : inicioMes();
  }, [desde]);

  const nombreBancoMovimiento = (item) => {
    const banco =
      item?.banco_nombre ||
      item?.nombre_banco ||
      item?.banco ||
      item?.banco_destino ||
      item?.nombre_cuenta ||
      item?.cuenta_nombre ||
      item?.cuenta_bancaria_nombre ||
      item?.numero_cuenta ||
      "";

    if (banco) return banco;
    if (item?.cuenta_bancaria_id) return `Cuenta ID ${item.cuenta_bancaria_id}`;
    return "-";
  };

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


  const montoObjetivoReporte = (item) => {
    const texto = `
      ${item.tipo_ingreso || ""}
      ${item.tipo || ""}
      ${item.subtipo || ""}
      ${item.forma_pago || ""}
      ${item.tipo_pago || ""}
      ${item.metodo_pago || ""}
      ${item.observacion || ""}
    `.toLowerCase();

    const esPOS =
      texto.includes("pos") ||
      texto.includes("tarjeta") ||
      texto.includes("card") ||
      texto.includes("credito") ||
      texto.includes("crédito") ||
      texto.includes("debito") ||
      texto.includes("débito");

    if (esPOS && numero(item.dcl_liquido_pagar) > 0) {
      return numero(item.dcl_liquido_pagar);
    }

    return numero(
      item.monto_esperado ??
        item.monto_neto ??
        item.monto_bruto ??
        0
    );
  };

  const corregirPendientesPorGrupoDcl = async (filasBase = [], aplicaciones = []) => {
    const filas = filasBase.map((item) => ({ ...item }));
    const corteIds = filas.map((item) => Number(item.corte_detalle_id)).filter(Boolean);

    if (corteIds.length === 0) return filas;

    const { data: relacionesDcl, error: errorRelacionesDcl } = await supabase
      .from("dcl_conciliacion")
      .select("id, dcl_id, corte_detalle_id, monto_aplicado")
      .eq("empresa_id", Number(empresaId))
      .in("corte_detalle_id", corteIds);

    if (errorRelacionesDcl) {
      console.error("Error cargando relaciones DCL para reporte:", errorRelacionesDcl);
      return aplicarConciliadoSimpleReporte(filas, aplicaciones);
    }

    const dclIds = [
      ...new Set((relacionesDcl || []).map((r) => Number(r.dcl_id)).filter(Boolean)),
    ];

    let mapaDcl = {};

    if (dclIds.length > 0) {
      const { data: dcls, error: errorDcls } = await supabase
        .from("vw_dcl_resumen")
        .select("id, valor_operaciones, liquido_pagar, comision, iva_comision, iva_percibido")
        .in("id", dclIds);

      if (errorDcls) {
        console.error("Error cargando DCL resumen para reporte:", errorDcls);
      } else {
        mapaDcl = (dcls || []).reduce((acc, dcl) => {
          acc[Number(dcl.id)] = dcl;
          return acc;
        }, {});
      }
    }

    const appPorCorte = aplicaciones.reduce((acc, item) => {
      const corteId = Number(item.corte_detalle_id);
      if (!corteId) return acc;

      acc[corteId] = Number(
        (numero(acc[corteId]) + numero(item.monto_aplicado)).toFixed(2)
      );

      return acc;
    }, {});

    const filaPorCorte = filas.reduce((acc, item) => {
      acc[Number(item.corte_detalle_id)] = item;
      return acc;
    }, {});

    const relacionesPorCorte = {};
    const cortesPorDcl = {};

    (relacionesDcl || []).forEach((rel) => {
      const corteId = Number(rel.corte_detalle_id);
      const dclId = Number(rel.dcl_id);

      if (!relacionesPorCorte[corteId]) relacionesPorCorte[corteId] = [];
      relacionesPorCorte[corteId].push(dclId);

      if (!cortesPorDcl[dclId]) cortesPorDcl[dclId] = [];
      cortesPorDcl[dclId].push(corteId);
    });

    const visitados = new Set();
    const grupos = [];

    corteIds.forEach((corteId) => {
      if (visitados.has(corteId)) return;

      const grupoCortes = new Set();
      const grupoDcls = new Set();
      const colaCortes = [corteId];

      while (colaCortes.length > 0) {
        const c = colaCortes.shift();
        if (visitados.has(c)) continue;

        visitados.add(c);
        grupoCortes.add(c);

        (relacionesPorCorte[c] || []).forEach((dclId) => {
          grupoDcls.add(dclId);

          (cortesPorDcl[dclId] || []).forEach((otroCorte) => {
            if (!visitados.has(otroCorte)) colaCortes.push(otroCorte);
          });
        });
      }

      grupos.push({
        cortes: Array.from(grupoCortes),
        dcls: Array.from(grupoDcls),
      });
    });

    const resultadoPorCorte = {};

    grupos.forEach((grupo) => {
      const dclsUnicos = [...new Set(grupo.dcls)];

      const objetivoGrupo =
        dclsUnicos.length > 0
          ? dclsUnicos.reduce((acc, dclId) => {
              const dcl = mapaDcl[Number(dclId)];
              return acc + numero(dcl?.liquido_pagar);
            }, 0)
          : grupo.cortes.reduce((acc, corteId) => {
              return acc + montoObjetivoReporte(filaPorCorte[corteId]);
            }, 0);

      const conciliadoGrupo = grupo.cortes.reduce(
        (acc, corteId) => acc + numero(appPorCorte[corteId]),
        0
      );

      const saldoGrupo = Number((objetivoGrupo - conciliadoGrupo).toFixed(2));
      const grupoConciliado = Math.abs(saldoGrupo) <= TOLERANCIA_PENDIENTE || saldoGrupo < 0;

      grupo.cortes.forEach((corteId) => {
        const fila = filaPorCorte[corteId];
        if (!fila) return;

        if (grupoConciliado) {
          resultadoPorCorte[corteId] = {
            ...fila,
            monto_conciliado: montoObjetivoReporte(fila),
            saldo_pendiente: 0,
            estado_calculado: "conciliado",
          };
          return;
        }

        const objetivoCorte = montoObjetivoReporte(fila);
        const conciliadoCorte = numero(appPorCorte[corteId]);
        const saldoCorte = Number((objetivoCorte - conciliadoCorte).toFixed(2));

        resultadoPorCorte[corteId] = {
          ...fila,
          monto_conciliado: conciliadoCorte,
          saldo_pendiente:
            Math.abs(saldoCorte) <= TOLERANCIA_PENDIENTE ? 0 : Math.max(saldoCorte, 0),
          estado_calculado:
            Math.abs(saldoCorte) <= TOLERANCIA_PENDIENTE || saldoCorte < 0
              ? "conciliado"
              : fila.estado_calculado,
        };
      });
    });

    return filas.map((fila) => resultadoPorCorte[Number(fila.corte_detalle_id)] || fila);
  };

  const aplicarConciliadoSimpleReporte = (filas = [], aplicaciones = []) => {
    const mapaAplicado = aplicaciones.reduce((acc, item) => {
      const corteId = Number(item.corte_detalle_id);
      if (!corteId) return acc;

      acc[corteId] = Number(
        (numero(acc[corteId]) + numero(item.monto_aplicado)).toFixed(2)
      );

      return acc;
    }, {});

    return filas.map((item) => {
      const corteId = Number(item.corte_detalle_id);
      const objetivo = montoObjetivoReporte(item);
      const conciliado = numero(mapaAplicado[corteId]);
      const saldo = Number((objetivo - conciliado).toFixed(2));

      return {
        ...item,
        monto_conciliado: conciliado,
        saldo_pendiente:
          Math.abs(saldo) <= TOLERANCIA_PENDIENTE ? 0 : Math.max(saldo, 0),
        estado_calculado:
          Math.abs(saldo) <= TOLERANCIA_PENDIENTE || saldo < 0
            ? "conciliado"
            : item.estado_calculado,
      };
    });
  };

  const deduplicarResumenCorteBanco = (lista = []) => {
    const mapa = new Map();

    lista.forEach((item) => {
      const id = Number(item.corte_detalle_id);
      if (!id) return;

      if (!mapa.has(id)) {
        mapa.set(id, item);
        return;
      }

      const anterior = mapa.get(id);

      mapa.set(id, {
        ...anterior,
        ...item,
        corte_detalle_id: anterior.corte_detalle_id,
        es_pendiente_anterior:
          Boolean(anterior.es_pendiente_anterior) && Boolean(item.es_pendiente_anterior),
      });
    });

    return Array.from(mapa.values());
  };

  const cargarReportes = async () => {
    setCargando(true);

    try {
      const { data: dataCorteBanco, error: errorCorteBanco } = await supabase
        .from("vw_corte_banco_resumen")
        .select("*")
        .eq("empresa_id", Number(empresaId))
        .gte("fecha_corte", desde)
        .lte("fecha_corte", hasta)
        .order("fecha_corte", { ascending: true });

      const { data: dataPendientesAnteriores, error: errorPendientes } =
        await supabase
          .from("vw_corte_banco_resumen")
          .select("*")
          .eq("empresa_id", Number(empresaId))
          .lt("fecha_corte", desde)
          .order("fecha_corte", { ascending: true });

      const { data: dataAplicaciones, error: errorAplicaciones } = await supabase
        .from("conciliacion_corte_banco_detalle")
        .select("id, corte_detalle_id, estado_banco_detalle_id, monto_aplicado")
        .eq("empresa_id", Number(empresaId));

      if (errorAplicaciones) {
        console.error("Error cargando aplicaciones reales:", errorAplicaciones);
        setDetalleAplicaciones([]);
      } else {
        setDetalleAplicaciones(dataAplicaciones || []);
      }

      if (errorCorteBanco) {
        console.error("Error cargando reporte corte banco:", errorCorteBanco);
        setResumenCorteBanco([]);
      } else if (errorPendientes) {
        console.error("Error cargando pendientes anteriores:", errorPendientes);

        const corregido = await corregirPendientesPorGrupoDcl(
          deduplicarResumenCorteBanco(dataCorteBanco || []),
          dataAplicaciones || []
        );

        setResumenCorteBanco(
          corregido.filter(
            (item) =>
              item.fecha_corte >= desde ||
              numero(item.saldo_pendiente) > TOLERANCIA_PENDIENTE
          )
        );
      } else {
        const combinado = [
          ...(dataPendientesAnteriores || []).map((item) => ({
            ...item,
            es_pendiente_anterior: true,
          })),
          ...(dataCorteBanco || []).map((item) => ({
            ...item,
            es_pendiente_anterior: false,
          })),
        ];

        const corregido = await corregirPendientesPorGrupoDcl(
          deduplicarResumenCorteBanco(combinado),
          dataAplicaciones || []
        );

        setResumenCorteBanco(
          corregido.filter((item) => {
            if (!item.es_pendiente_anterior) return true;
            return numero(item.saldo_pendiente) > TOLERANCIA_PENDIENTE;
          })
        );
      }

      const { data: dataEspeciales, error: errorEspeciales } = await supabase
        .from("vw_banco_conciliacion_resumen")
        .select("*")
        .eq("empresa_id", Number(empresaId))
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .in("tipo_movimiento_conciliacion", [
          "traslado",
          "otro_ingreso",
          "ajuste",
          "no_identificado",
        ])
        .order("fecha", { ascending: false });

      if (errorEspeciales) {
        console.error("Error cargando movimientos especiales:", errorEspeciales);
        setMovimientosEspeciales([]);
      } else {
        const especialesBase = dataEspeciales || [];
        const cuentaIds = [
          ...new Set(
            especialesBase
              .map((item) => Number(item.cuenta_bancaria_id || item.cuenta_id || 0))
              .filter(Boolean)
          ),
        ];

        let mapaCuentas = {};

        if (cuentaIds.length > 0) {
          const { data: cuentasData, error: errorCuentas } = await supabase
            .from("cuentas_bancarias")
            .select("id, nombre_banco, nombre_cuenta, numero_cuenta")
            .in("id", cuentaIds);

          if (errorCuentas) {
            console.error("Error cargando cuentas de movimientos especiales:", errorCuentas);
          } else {
            mapaCuentas = (cuentasData || []).reduce((acc, cuenta) => {
              acc[Number(cuenta.id)] = cuenta;
              return acc;
            }, {});
          }
        }

        const especialesConBanco = especialesBase.map((item) => {
          const cuentaId = Number(item.cuenta_bancaria_id || item.cuenta_id || 0);
          const cuenta = mapaCuentas[cuentaId];
          const bancoNombre =
            item.nombre_banco ||
            item.banco ||
            item.banco_destino ||
            (cuenta?.nombre_banco && cuenta?.nombre_cuenta
              ? `${cuenta.nombre_banco} - ${cuenta.nombre_cuenta}`
              : cuenta?.nombre_banco || cuenta?.nombre_cuenta || cuenta?.numero_cuenta || "");

          return {
            ...item,
            banco_nombre: bancoNombre || "-",
          };
        });

        setMovimientosEspeciales(especialesConBanco);
      }

      const { data: dataFacturasDetalle, error: errorFacturasDetalle } =
        await supabase
          .from("facturacion_detalle")
          .select("*")
          .eq("empresa_id", Number(empresaId))
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha", { ascending: true });

      if (errorFacturasDetalle) {
        console.error("Error cargando facturacion_detalle:", errorFacturasDetalle);
        setFacturasDetalle([]);
      } else {
        setFacturasDetalle(dataFacturasDetalle || []);
      }

      const { data: dataManual, error: errorManual } = await supabase
        .from("alquileres_control_manual")
        .select("*")
        .eq("empresa_id", Number(empresaId))
        .eq("periodo", periodoBase)
        .order("cliente_nombre", { ascending: true });

      if (errorManual) {
        console.error("Error cargando alquileres manuales:", errorManual);
        setAlquileresManual([]);
      } else {
        setAlquileresManual(dataManual || []);
      }
    } catch (error) {
      console.error("Error general cargando reportes:", error);
    } finally {
      setCargando(false);
    }
  };

  const TOLERANCIA_PENDIENTE = 0.05;

  const esperadoPorBanco = useMemo(() => {
    const mapa = {};

    resumenCorteBanco.forEach((item) => {
      const banco = item.banco_destino || "SIN BANCO";
      const esPendienteAnterior = Boolean(item.es_pendiente_anterior);

      if (!mapa[banco]) {
        mapa[banco] = {
          banco,
          esperado: 0,
          conciliadoVentas: 0,
          pendiente: 0,
          depositosTransito: 0,
          ventasPosPendientes: 0,
          efectivoPendiente: 0,
          pendienteAnterior: 0,
          pendientePeriodo: 0,
          movimientos: [],
        };
      }

      const esperado = montoObjetivoReporte(item);
      const conciliado = numero(item.monto_conciliado);
      const pendienteOriginal = numero(item.saldo_pendiente);
      const estado = String(item.estado_calculado || "").toLowerCase();

      const pendiente =
        pendienteOriginal > TOLERANCIA_PENDIENTE &&
        estado !== "conciliado" &&
        estado !== "depositado completo"
          ? pendienteOriginal
          : 0;

      if (!esPendienteAnterior) {
        mapa[banco].esperado += esperado;
        mapa[banco].conciliadoVentas += conciliado;
      }

      mapa[banco].pendiente += pendiente;

      if (esPendienteAnterior) {
        mapa[banco].pendienteAnterior += pendiente;
      } else {
        mapa[banco].pendientePeriodo += pendiente;
      }

      const texto = `
        ${item.tipo_ingreso || ""}
        ${item.tipo || ""}
        ${item.subtipo || ""}
        ${item.forma_pago || ""}
        ${item.tipo_pago || ""}
        ${item.metodo_pago || ""}
        ${item.observacion || ""}
      `.toLowerCase();

      if (pendiente > 0) {
        if (
          texto.includes("pos") ||
          texto.includes("tarjeta") ||
          texto.includes("card") ||
          texto.includes("credito") ||
          texto.includes("crédito") ||
          texto.includes("debito") ||
          texto.includes("débito")
        ) {
          mapa[banco].ventasPosPendientes += pendiente;
        } else {
          mapa[banco].efectivoPendiente += pendiente;
        }

        mapa[banco].depositosTransito += pendiente;
      }

      mapa[banco].movimientos.push(item);
    });

    return Object.values(mapa)
      .map((item) => ({
        ...item,
        esperado: Number(item.esperado.toFixed(2)),
        conciliadoVentas: Number(item.conciliadoVentas.toFixed(2)),
        pendiente: Number(item.pendiente.toFixed(2)),
        depositosTransito: Number(item.depositosTransito.toFixed(2)),
        ventasPosPendientes: Number(item.ventasPosPendientes.toFixed(2)),
        efectivoPendiente: Number(item.efectivoPendiente.toFixed(2)),
        pendienteAnterior: Number(item.pendienteAnterior.toFixed(2)),
        pendientePeriodo: Number(item.pendientePeriodo.toFixed(2)),
      }))
      .sort((a, b) => b.esperado + b.pendiente - (a.esperado + a.pendiente));
  }, [resumenCorteBanco]);
  

  const resumenGeneral = useMemo(() => {
    const totalEsperado = esperadoPorBanco.reduce(
      (acc, item) => acc + numero(item.esperado),
      0
    );

    const totalConciliadoVentas = esperadoPorBanco.reduce(
      (acc, item) => acc + numero(item.conciliadoVentas),
      0
    );

    const totalPendienteDepositar = esperadoPorBanco.reduce(
      (acc, item) => acc + numero(item.pendiente),
      0
    );

    const pendienteAnterior = esperadoPorBanco.reduce(
      (acc, item) => acc + numero(item.pendienteAnterior),
      0
    );

    const pendientePeriodo = esperadoPorBanco.reduce(
      (acc, item) => acc + numero(item.pendientePeriodo),
      0
    );

    const efectivoPendiente = esperadoPorBanco.reduce(
      (acc, item) => acc + numero(item.efectivoPendiente),
      0
    );

    const ventasPosPendientes = esperadoPorBanco.reduce(
      (acc, item) => acc + numero(item.ventasPosPendientes),
      0
    );

    return {
      totalEsperado: Number(totalEsperado.toFixed(2)),
      totalConciliadoVentas: Number(totalConciliadoVentas.toFixed(2)),
      totalPendienteDepositar: Number(totalPendienteDepositar.toFixed(2)),
      pendienteAnterior: Number(pendienteAnterior.toFixed(2)),
      pendientePeriodo: Number(pendientePeriodo.toFixed(2)),
      efectivoPendiente: Number(efectivoPendiente.toFixed(2)),
      ventasPosPendientes: Number(ventasPosPendientes.toFixed(2)),
      dineroRecibido: Number(
        (totalConciliadoVentas + totalPendienteDepositar).toFixed(2)
      ),
    };
  }, [esperadoPorBanco]);

  const resumenDescuentosPOS = useMemo(() => {
    return resumenCorteBanco.reduce(
      (acc, item) => {
        const texto = `
          ${item.tipo_ingreso || ""}
          ${item.tipo || ""}
          ${item.subtipo || ""}
          ${item.forma_pago || ""}
          ${item.tipo_pago || ""}
          ${item.metodo_pago || ""}
          ${item.observacion || ""}
        `.toLowerCase();

        const esPOS =
          texto.includes("pos") ||
          texto.includes("tarjeta") ||
          texto.includes("card") ||
          texto.includes("credito") ||
          texto.includes("crédito") ||
          texto.includes("debito") ||
          texto.includes("débito");

        if (!esPOS || item.es_pendiente_anterior) return acc;

        const comision = numero(item.dcl_comision ?? item.comision_monto);
        const ivaComision = numero(item.dcl_iva_comision ?? item.iva_monto);
        const anticipo = numero(item.dcl_iva_percibido ?? item.anticipo_monto);
        const totalDescuento = comision + ivaComision + anticipo;

        acc.brutoPOS += numero(item.monto_bruto ?? item.monto_esperado);
        acc.comision += comision;
        acc.ivaComision += ivaComision;
        acc.anticipo += anticipo;
        acc.totalDescuentos += totalDescuento;
        acc.netoPOS += numero(item.monto_bruto ?? item.monto_esperado) - totalDescuento;

        return acc;
      },
      {
        brutoPOS: 0,
        comision: 0,
        ivaComision: 0,
        anticipo: 0,
        totalDescuentos: 0,
        netoPOS: 0,
      }
    );
  }, [resumenCorteBanco]);

  const resumenEspeciales = useMemo(() => {
    return movimientosEspeciales.reduce(
      (acc, item) => {
        const tipo = String(item.tipo_movimiento_conciliacion || "").toLowerCase();
        const monto = numero(item.abonos);

        if (tipo === "traslado") acc.traslados += monto;
        if (tipo === "otro_ingreso") acc.otrosIngresos += monto;
        if (tipo === "ajuste") acc.ajustes += monto;
        if (tipo === "no_identificado") acc.noIdentificados += monto;

        return acc;
      },
      {
        traslados: 0,
        otrosIngresos: 0,
        ajustes: 0,
        noIdentificados: 0,
      }
    );
  }, [movimientosEspeciales]);

  const alquileresFacturadosAutomaticos = useMemo(() => {
  return facturasDetalle
    .filter((f) => {
      const nombre = String(f.nombre || "").toLowerCase();
      const doc = String(f.numdoc || f.numdocal || "").toLowerCase();

      const categoriaManual = String(f.categoria_ingreso_manual || "").toLowerCase();
      const clasificacionNombre = String(f.clasificacion_ingreso_nombre || "").toLowerCase();

      return (
        nombre.includes("local") ||
        nombre.includes("inquil") ||
        categoriaManual.includes("alquiler") ||
        clasificacionNombre.includes("alquiler") ||
        doc.includes("alq")
      );
    })
    .map((f) => ({
      fecha: f.fecha,
      cliente_nombre: f.nombre || "Sin nombre",
      documento: f.numdoc || f.numdocal || "",
      monto_facturado: numero(f.totalvent),
    }));
}, [facturasDetalle]);

const resumenFacturacion = useMemo(() => {
  const mapa = {};

  facturasDetalle.forEach((f) => {
    const clasificacion = String(
      f.clasificacion_ingreso_nombre || f.categoria_ingreso_manual || "Sin clasificación"
    )
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");

    if (!mapa[clasificacion]) {
      mapa[clasificacion] = {
        nombre: clasificacion,
        total: 0,
      };
    }

    mapa[clasificacion].total += numero(f.totalvent);
  });

  const porClasificacion = Object.values(mapa)
    .map((item) => ({
      ...item,
      total: Number(item.total.toFixed(2)),
    }))
    .sort((a, b) => b.total - a.total);

  const totalFacturado = porClasificacion.reduce(
    (acc, item) => acc + numero(item.total),
    0
  );

  const alquilerFacturado = porClasificacion
    .filter((item) => item.nombre.includes("ALQUILER"))
    .reduce((acc, item) => acc + numero(item.total), 0);

  const serviciosFacturados = totalFacturado - alquilerFacturado;

  return {
    totalFacturado: Number(totalFacturado.toFixed(2)),
    alquilerFacturado: Number(alquilerFacturado.toFixed(2)),
    serviciosFacturados: Number(serviciosFacturados.toFixed(2)),
    porClasificacion,
  };
}, [facturasDetalle]);

const pagosAlquilerDesdeCorte = useMemo(() => {
  return resumenCorteBanco
    .filter((x) => numero(x.monto_conciliado) > 0)
    .map((x) => ({
      fecha: x.fecha_corte,
      banco: x.banco_destino || "",
      observacion: `
        ${x.observacion || ""}
        ${x.cliente_nombre || ""}
        ${x.nombre || ""}
        ${x.descripcion || ""}
        ${x.concepto || ""}
        ${x.detalle || ""}
      `,
      monto_pagado: numero(x.monto_conciliado),
    }));
}, [resumenCorteBanco]);

  const alquileresAgrupados = useMemo(() => {
    const mapa = {};

    alquileresFacturadosAutomaticos.forEach((item) => {
      const key = String(item.cliente_nombre || "")
  .trim()
  .toUpperCase()
  .replace(/\s+/g, " ");

      if (!mapa[key]) {
        mapa[key] = {
          cliente_nombre: item.cliente_nombre,
          monto_facturado_auto: 0,
          documentos: [],
        };
      }

      mapa[key].monto_facturado_auto += numero(item.monto_facturado);
      mapa[key].documentos.push(item.documento);
    });

    alquileresManual.forEach((item) => {
      const key = String(item.cliente_nombre || "")
  .trim()
  .toUpperCase()
  .replace(/\s+/g, " ");

      if (!mapa[key]) {
        mapa[key] = {
          cliente_nombre: item.cliente_nombre,
          monto_facturado_auto: 0,
          documentos: [],
        };
      }

      mapa[key].manual = item;
    });

    pagosAlquilerDesdeCorte.forEach((pago) => {
  const obs = String(pago.observacion || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  let mejorKey = null;
  let mejorCoincidencias = 0;

  Object.keys(mapa).forEach((key) => {
    const nombre = String(mapa[key].cliente_nombre || "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();

    const palabrasNombre = nombre
      .split(/\s+/)
      .filter((p) => p.length >= 4 && !["SOCIEDAD", "ANONIMA", "CAPITAL", "VARIABLE"].includes(p));

    const coincidencias = palabrasNombre.filter((p) => obs.includes(p)).length;

    if (coincidencias > mejorCoincidencias) {
      mejorCoincidencias = coincidencias;
      mejorKey = key;
    }
  });

  // Evita duplicar por una sola palabra compartida como MIXCO,
  // pero permite reconocer pagos reales aunque el nombre sea largo.
  const clienteElegido = mejorKey ? mapa[mejorKey] : null;

const palabrasCliente = String(clienteElegido?.cliente_nombre || "")
  .toUpperCase()
  .replace(/\s+/g, " ")
  .split(/\s+/)
  .filter(
    (p) =>
      p.length >= 4 &&
      !["SOCIEDAD", "ANONIMA", "CAPITAL", "VARIABLE"].includes(p)
  );

const permiteUnaCoincidencia = palabrasCliente.length <= 2;

if (
  mejorKey &&
  (mejorCoincidencias >= 2 || (permiteUnaCoincidencia && mejorCoincidencias >= 1))
) {
    mapa[mejorKey].pago_corte =
      (mapa[mejorKey].pago_corte || 0) + numero(pago.monto_pagado);

    mapa[mejorKey].banco_corte = pago.banco;
    mapa[mejorKey].fecha_corte = pago.fecha;
    mapa[mejorKey].observacion_corte = pago.observacion;
  }
});

    return Object.values(mapa).map((item) => {
      const manual = item.manual || null;
      const montoFacturado = manual
        ? numero(manual.monto_facturado || item.monto_facturado_auto)
        : numero(item.monto_facturado_auto);

      const montoPagado =
  (manual ? numero(manual.monto_pagado_manual) : 0) +
  numero(item.pago_corte);
      const deudaAnterior = manual ? numero(manual.deuda_anterior) : 0;
      const saldoActual = Number(
        (montoFacturado + deudaAnterior - montoPagado).toFixed(2)
      );

      const estado =
        manual?.estado ||
        estadoAlquilerTexto({
          montoFacturado,
          montoPagado,
          saldoActual,
          deudaAnterior,
        });

      return {
        cliente_nombre: item.cliente_nombre,
        documentos: item.documentos.join(", "),
        monto_facturado: montoFacturado,
        monto_pagado_manual: montoPagado,
        deuda_anterior: deudaAnterior,
        saldo_actual: saldoActual,
        estado,
        forma_cobro: manual?.forma_cobro || "",
        banco: manual?.banco || item.banco_corte || "",
fecha_acreditado: manual?.fecha_acreditado || item.fecha_corte || "",
observacion: manual?.observacion || item.observacion_corte || "",
      };
    });
  }, [alquileresFacturadosAutomaticos, alquileresManual, pagosAlquilerDesdeCorte]);

  const alquileresFiltrados = useMemo(() => {
    const t = filtroAlquiler.trim().toLowerCase();
    if (!t) return alquileresAgrupados;

    return alquileresAgrupados.filter(
      (a) =>
        String(a.cliente_nombre || "").toLowerCase().includes(t) ||
        String(a.estado || "").toLowerCase().includes(t) ||
        String(a.observacion || "").toLowerCase().includes(t)
    );
  }, [alquileresAgrupados, filtroAlquiler]);

  const resumenAlquileres = useMemo(() => {
    return alquileresAgrupados.reduce(
      (acc, item) => {
        acc.facturado += numero(item.monto_facturado);
        acc.pagado += numero(item.monto_pagado_manual);
        acc.deudaAnterior += numero(item.deuda_anterior);
        acc.saldo += numero(item.saldo_actual);

        const estado = String(item.estado || "").toLowerCase();
        if (estado === "pagado completo") acc.pagados += 1;
        if (estado === "pagado parcial") acc.parciales += 1;
        if (estado === "no pagado") acc.noPagados += 1;
        if (estado === "abono a deuda anterior") acc.abonosDeuda += 1;

        return acc;
      },
      {
        facturado: 0,
        pagado: 0,
        deudaAnterior: 0,
        saldo: 0,
        pagados: 0,
        parciales: 0,
        noPagados: 0,
        abonosDeuda: 0,
      }
    );
  }, [alquileresAgrupados]);

  const conciliacionIngresos = useMemo(() => {
    const filasClasificacion = resumenFacturacion.porClasificacion.map((item) => ({
      concepto: item.nombre,
      monto: item.total,
      estado: item.nombre.includes("ALQUILER") ? "Ver detalle abajo" : "Facturado",
    }));

    const filasExtra = [];

    filasExtra.push({
      concepto: "Cobro de alquileres en banco",
      monto: resumenAlquileres.pagado,
      estado: "Ver detalle abajo",
    });

    if (resumenDescuentosPOS.totalDescuentos > 0) {
      filasExtra.push({
        concepto: "Total descuentos POS",
        monto: resumenDescuentosPOS.totalDescuentos,
        estado: "Descuento bancario",
      });
    }

    if (resumenEspeciales.noIdentificados > 0) {
      filasExtra.push({
        concepto: "Pendientes de identificar",
        monto: resumenEspeciales.noIdentificados,
        estado: "En revisión",
      });
    }

    return [...filasClasificacion, ...filasExtra];
  }, [resumenFacturacion, resumenAlquileres, resumenEspeciales, resumenDescuentosPOS]);

  const observacionesOperacion = useMemo(() => {
    const obs = [];

    if (resumenGeneral.pendienteAnterior > 0) {
      obs.push(
        `Se incluyen pendientes acumulados anteriores al período por ${dinero(
          resumenGeneral.pendienteAnterior
        )}, debido a que aún no aparecen conciliados en banco.`
      );
    }

    if (resumenGeneral.pendientePeriodo > 0) {
      obs.push(
        `Del período seleccionado queda pendiente de depósito/acreditación el monto de ${dinero(
          resumenGeneral.pendientePeriodo
        )}.`
      );
    }

    if (resumenEspeciales.noIdentificados > 0) {
      obs.push(
        `Existen movimientos bancarios pendientes de identificar por ${dinero(
          resumenEspeciales.noIdentificados
        )}, los cuales quedan en revisión.`
      );
    }

    if (resumenAlquileres.saldo > 0) {
      obs.push(
        `En alquileres queda un saldo pendiente de cobro por ${dinero(
          resumenAlquileres.saldo
        )}.`
      );
    }

    if (obs.length === 0) {
      obs.push(
        "No se observan diferencias relevantes en el período seleccionado. Los ingresos se encuentran razonablemente conciliados."
      );
    }

    return obs;
  }, [resumenGeneral, resumenEspeciales, resumenAlquileres]);

  const diferenciaReal = useMemo(() => {
    const pendientePorDepositar = numero(resumenGeneral.totalPendienteDepositar);
    const noIdentificado = numero(resumenEspeciales.noIdentificados);

    return {
      pendientePorDepositar,
      noIdentificado,
      totalRevision: Number((pendientePorDepositar + noIdentificado).toFixed(2)),
    };
  }, [resumenGeneral, resumenEspeciales]);

  const guardarManualAlquiler = async () => {
    if (!clienteManual.trim()) {
      alert("Escribe el nombre del inquilino o cliente.");
      return;
    }

    setGuardandoManual(true);

    try {
      const payload = {
        empresa_id: Number(empresaId),
        periodo: periodoBase,
        cliente_nombre: clienteManual.trim(),
        monto_facturado: numero(manualForm.monto_facturado),
        monto_pagado_manual: numero(manualForm.monto_pagado_manual),
        deuda_anterior: numero(manualForm.deuda_anterior),
        saldo_actual: numero(manualForm.saldo_actual),
        estado: manualForm.estado || "pendiente",
        forma_cobro: manualForm.forma_cobro || null,
        banco: manualForm.banco || null,
        fecha_acreditado: manualForm.fecha_acreditado || null,
        observacion: manualForm.observacion || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("alquileres_control_manual")
        .upsert([payload], {
          onConflict: "empresa_id,periodo,cliente_nombre",
        });

      if (error) throw error;

      alert("Control manual de alquiler guardado.");
      setClienteManual("");
      setManualForm({
        monto_facturado: "",
        monto_pagado_manual: "",
        deuda_anterior: "",
        saldo_actual: "",
        estado: "pendiente",
        forma_cobro: "",
        banco: "",
        fecha_acreditado: "",
        observacion: "",
      });

      await cargarReportes();
    } catch (error) {
      console.error(error);
      alert(`Error guardando alquiler manual: ${error.message}`);
    } finally {
      setGuardandoManual(false);
    }
  };

  const nombreArchivoBase = useMemo(() => {
    const empresa = empresaActiva?.nombre || "Empresa";
    const limpio = empresa.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
    return `Reporte_Ingresos_${limpio}_${desde}_a_${hasta}`;
  }, [empresaActiva, desde, hasta]);

  const exportarExcel = () => {
    try {
      setExportandoExcel(true);

      const wb = XLSX.utils.book_new();

      const wsResumen = XLSX.utils.aoa_to_sheet([
        [`Reporte de Ingresos: ${empresaActiva?.nombre || ""}`],
        ["Período", `Del ${desde} al ${hasta}`],
        [""],
        ["1. Resumen de Ventas y Disponibilidad"],
        ["Ventas Totales (Facturadas)", numero(resumenFacturacion.totalFacturado)],
        ["Alquiler facturado", numero(resumenFacturacion.alquilerFacturado)],
        ["Servicios facturados", numero(resumenFacturacion.serviciosFacturados)],
        ["Total descuentos POS", numero(resumenDescuentosPOS.totalDescuentos)],
        ["Comisión POS", numero(resumenDescuentosPOS.comision)],
        ["IVA sobre comisión POS", numero(resumenDescuentosPOS.ivaComision)],
        ["Anticipo/retención POS", numero(resumenDescuentosPOS.anticipo)],
        ["Dinero Realmente Recibido", numero(resumenGeneral.dineroRecibido)],
        ["Depositado en Bancos", numero(resumenGeneral.totalConciliadoVentas)],
        ["Pendiente acumulado anterior", numero(resumenGeneral.pendienteAnterior)],
        ["Pendiente del período", numero(resumenGeneral.pendientePeriodo)],
        ["Efectivo en Caja (Pendiente de depósito)", numero(resumenGeneral.efectivoPendiente)],
        ["Ventas en Tarjeta (Pendiente de acreditar)", numero(resumenGeneral.ventasPosPendientes)],
        [""],
        ["2. Conciliación de Ingresos"],
        ["Concepto", "Monto", "Estado"],
        ...conciliacionIngresos.map((item) => [
          item.concepto,
          numero(item.monto),
          item.estado,
        ]),
        [""],
        ["3. Control de Alquileres"],
        ["Total esperado de alquileres", numero(resumenAlquileres.facturado)],
        ["Total recibido en banco", numero(resumenAlquileres.pagado)],
        ["Monto pendiente de cobro", numero(resumenAlquileres.saldo)],
      ]);
      wsResumen["!cols"] = [{ wch: 45 }, { wch: 20 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

      const wsBancos = XLSX.utils.json_to_sheet(
        esperadoPorBanco.map((item) => ({
          Banco: item.banco,
          Ventas_Facturadas_Periodo: numero(item.esperado),
          Depositado_en_Banco_Periodo: numero(item.conciliadoVentas),
          Pendiente_Acumulado_Anterior: numero(item.pendienteAnterior),
          Pendiente_Periodo: numero(item.pendientePeriodo),
          Efectivo_Pendiente: numero(item.efectivoPendiente),
          POS_Pendiente: numero(item.ventasPosPendientes),
          Total_Pendiente: numero(item.pendiente),
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsBancos, "Conciliacion_Bancos");

      const wsAlquileres = XLSX.utils.json_to_sheet(
        alquileresAgrupados.map((item) => ({
          Inquilino: item.cliente_nombre,
          Cuota_Facturada: numero(item.monto_facturado),
          Monto_Pagado: numero(item.monto_pagado_manual),
          Deuda_Anterior: numero(item.deuda_anterior),
          Fecha_Pago: item.fecha_acreditado,
          Saldo: numero(item.saldo_actual),
          Estado: item.estado,
          Forma_Cobro: item.forma_cobro,
          Banco: item.banco,
          Observacion: item.observacion,
          Documentos: item.documentos,
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsAlquileres, "Alquileres");

      const wsEspeciales = XLSX.utils.json_to_sheet(
        movimientosEspeciales.map((item) => ({
          Fecha: item.fecha || "",
          Banco: nombreBancoMovimiento(item),
          Descripcion: item.descripcion || "",
          Tipo: nombreTipoMovimiento(item.tipo_movimiento_conciliacion),
          Categoria: item.categoria_manual || "",
          Abono: numero(item.abonos),
          Estado:
            item.tipo_movimiento_conciliacion === "no_identificado"
              ? "En revisión"
              : "Identificado",
          Observacion: item.observacion_conciliacion || "",
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsEspeciales, "Movimientos_Especiales");

      const wsObservaciones = XLSX.utils.aoa_to_sheet([
        ["Observaciones de Operación"],
        ...observacionesOperacion.map((obs, index) => [`${index + 1}.`, obs]),
      ]);
      wsObservaciones["!cols"] = [{ wch: 8 }, { wch: 100 }];
      XLSX.utils.book_append_sheet(wb, wsObservaciones, "Observaciones");

      XLSX.writeFile(wb, `${nombreArchivoBase}.xlsx`);
    } catch (error) {
      console.error("Error exportando Excel:", error);
      alert(`Error al exportar Excel: ${error.message}`);
    } finally {
      setExportandoExcel(false);
    }
  };

  const exportarPDF = () => {
  try {
    setExportandoPdf(true);

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const morado = colores.morado;
    const moradoOscuro = colores.moradoOscuro;
    const grisClaro = "#eeeeef";
    const texto = colores.texto;

    const addHeaderFooter = () => {
      doc.setFillColor(...hexToRgb("#eeecef"));
      doc.circle(pageWidth - 25, -25, 75, "F");

      doc.setFillColor(...hexToRgb("#e6e6e6"));
      doc.circle(15, pageHeight + 35, 45, "F");

      doc.setTextColor(...hexToRgb(moradoOscuro));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Reporte de Ingresos", 14, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...hexToRgb(texto));
      doc.text(empresaActiva?.nombre || "Empresa", pageWidth - 14, 16, {
        align: "right",
      });
      doc.text(`Del ${desde} al ${hasta}`, pageWidth - 14, 22, {
        align: "right",
      });
      doc.text(`Generado: ${new Date().toLocaleString("es-SV")}`, pageWidth - 14, 28, {
        align: "right",
      });

      doc.setDrawColor(0, 0, 0);
      doc.line(14, pageHeight - 18, pageWidth - 14, pageHeight - 18);

      doc.setFontSize(9);
      doc.setTextColor(...hexToRgb(colores.textoSuave));
      doc.text(empresaActiva?.nombre || "Reporte", pageWidth / 2, pageHeight - 12, {
        align: "center",
      });
    };

    addHeaderFooter();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(21);
    doc.setTextColor(...hexToRgb(moradoOscuro));
    doc.text("Reporte #ING001", pageWidth - 14, 55, { align: "right" });

    autoTable(doc, {
      startY: 63,
      margin: { left: 14, right: 14 },
      theme: "plain",
      body: [
        [
          {
            content: "Empresa\n" + (empresaActiva?.nombre || "Empresa"),
            styles: { fontStyle: "bold" },
          },
          {
            content: "Período\n" + `Del ${desde} al ${hasta}`,
            styles: { fontStyle: "bold" },
          },
        ],
      ],
      styles: {
        fontSize: 9,
        cellPadding: 4,
        lineColor: [0, 0, 0],
        lineWidth: 0.3,
        textColor: hexToRgb(texto),
      },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 90 },
      },
      didDrawCell: (data) => {
        if (data.section === "body") {
          doc.roundedRect(
            data.cell.x,
            data.cell.y,
            data.cell.width,
            data.cell.height,
            2,
            2,
            "S"
          );
        }
      },
    });

    const resumenRows = [
      ["Ventas Totales (Facturadas)", dinero(resumenFacturacion.totalFacturado)],
      ["Alquiler facturado", dinero(resumenFacturacion.alquilerFacturado)],
      ...(numero(resumenFacturacion.serviciosFacturados) !== 0
        ? [["Servicios facturados", dinero(resumenFacturacion.serviciosFacturados)]]
        : []),
      ...(numero(resumenDescuentosPOS.totalDescuentos) !== 0
        ? [["Total descuentos POS", dinero(resumenDescuentosPOS.totalDescuentos)]]
        : []),
      ["Dinero Realmente Recibido", dinero(resumenGeneral.dineroRecibido)],
      ["Depositado en Bancos", dinero(resumenGeneral.totalConciliadoVentas)],
      ...(numero(resumenGeneral.pendienteAnterior) !== 0
        ? [["Pendiente acumulado anterior", dinero(resumenGeneral.pendienteAnterior)]]
        : []),
      ...(numero(resumenGeneral.pendientePeriodo) !== 0
        ? [["Pendiente del período", dinero(resumenGeneral.pendientePeriodo)]]
        : []),
      ...(numero(resumenGeneral.efectivoPendiente) !== 0
        ? [["Efectivo en Caja", dinero(resumenGeneral.efectivoPendiente)]]
        : []),
      ...(numero(resumenGeneral.ventasPosPendientes) !== 0
        ? [["Ventas en Tarjeta", dinero(resumenGeneral.ventasPosPendientes)]]
        : []),
    ];

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["DESCRIPCIÓN", "MONTO"]],
      body: resumenRows,
      theme: "grid",
      margin: { left: 14, right: 14 },
      headStyles: {
        fillColor: hexToRgb(morado),
        textColor: [255, 255, 255],
        fontStyle: "normal",
        fontSize: 9,
      },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: hexToRgb(texto),
        lineColor: [130, 130, 145],
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 52, halign: "right" },
      },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["INQUILINO", "CUOTA", "PAGADO", "FECHA", "SALDO"]],
      body:
        alquileresAgrupados.length > 0
          ? alquileresAgrupados.map((item) => [
              item.cliente_nombre,
              dinero(item.monto_facturado),
              dinero(item.monto_pagado_manual),
              item.fecha_acreditado || "--",
              dinero(item.saldo_actual < 0 ? 0 : item.saldo_actual),
            ])
          : [["-", "-", "-", "-", "-"]],
      theme: "grid",
      margin: { left: 14, right: 14 },
      headStyles: {
        fillColor: hexToRgb(morado),
        textColor: [255, 255, 255],
        fontStyle: "normal",
        fontSize: 8,
      },
      styles: {
        fontSize: 7.8,
        cellPadding: 2.5,
        textColor: hexToRgb(texto),
        lineColor: [130, 130, 145],
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { cellWidth: 72 },
        1: { cellWidth: 30, halign: "right" },
        2: { cellWidth: 30, halign: "right" },
        3: { cellWidth: 25 },
        4: { cellWidth: 25, halign: "right" },
      },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      body: [
        ["Total esperado de alquileres", dinero(resumenAlquileres.facturado)],
        ["Total recibido en banco", dinero(resumenAlquileres.pagado)],
        ["Monto pendiente de cobro", dinero(resumenAlquileres.saldo < 0 ? 0 : resumenAlquileres.saldo)],
      ],
      theme: "grid",
      margin: { left: 104, right: 14 },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: hexToRgb(texto),
        lineColor: [130, 130, 145],
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 37, halign: "right" },
      },
      didParseCell: (data) => {
        if (data.row.index === 2) {
          data.cell.styles.fillColor = hexToRgb(morado);
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    let y = doc.lastAutoTable.finalY + 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...hexToRgb(texto));

    doc.text("Observaciones:", 14, y);
    y += 6;

    observacionesOperacion.forEach((obs, index) => {
      const lines = doc.splitTextToSize(`${index + 1}. ${obs}`, 180);
      doc.text(lines, 14, y);
      y += lines.length * 5;
    });

// Último bloque agregado: Conciliación Bancaria por Cuenta
if (y + 70 > pageHeight - 24) {
  doc.addPage();
  addHeaderFooter();
  y = 42;
} else {
  y += 10;
}

doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.setTextColor(...hexToRgb(moradoOscuro));
doc.text("Conciliación Bancaria por Cuenta", 14, y);

autoTable(doc, {
  startY: y + 5,
  head: [[
    "BANCO",
    "VENTAS FACTURADAS",
    "DEPOSITADO BANCO",
    "PEND. ANTERIOR",
    "PEND. PERÍODO",
    "TOTAL PENDIENTE",
  ]],
  body:
    esperadoPorBanco.length > 0
      ? esperadoPorBanco.map((item) => [
          item.banco,
          dinero(item.esperado),
          dinero(item.conciliadoVentas),
          dinero(item.pendienteAnterior),
          dinero(item.pendientePeriodo),
          dinero(item.pendiente),
        ])
      : [["Sin banco", "-", "-", "-", "-", "-"]],
  theme: "grid",
  margin: { left: 8, right: 8 },
  headStyles: {
    fillColor: hexToRgb(morado),
    textColor: [255, 255, 255],
    fontStyle: "bold",
    fontSize: 6.8,
  },
  styles: {
    fontSize: 6.8,
    cellPadding: 1.8,
    textColor: hexToRgb(texto),
    lineColor: [130, 130, 145],
    lineWidth: 0.2,
    overflow: "linebreak",
  },
  columnStyles: {
    0: { cellWidth: 47 },
    1: { cellWidth: 31, halign: "right" },
    2: { cellWidth: 31, halign: "right" },
    3: { cellWidth: 29, halign: "right" },
    4: { cellWidth: 29, halign: "right" },
    5: { cellWidth: 29, halign: "right", fontStyle: "bold" },
  },
  didParseCell: (data) => {
    if (data.section === "body" && data.column.index === 2) {
      data.cell.styles.textColor = hexToRgb(colores.verdeTexto);
      data.cell.styles.fontStyle = "bold";
    }
    if (data.section === "body" && data.column.index === 5) {
      data.cell.styles.textColor = hexToRgb(colores.rojoTexto);
      data.cell.styles.fontStyle = "bold";
    }
  },
});

// Detalle de movimientos especiales en página horizontal
doc.addPage("a4", "landscape");
addHeaderFooter();

const pageWidthEspecial = doc.internal.pageSize.getWidth();

let yEspecial = 38;

doc.setFont("helvetica", "bold");
doc.setFontSize(15);
doc.setTextColor(...hexToRgb(moradoOscuro));
doc.text("Detalle de movimientos especiales", 14, yEspecial);

autoTable(doc, {
  startY: yEspecial + 7,
  head: [[
    "FECHA",
    "BANCO",
    "DESCRIPCIÓN",
    "TIPO",
    "CATEGORÍA",
    "ABONO",
    "ESTADO",
    "OBSERVACIÓN",
  ]],
  body:
    movimientosEspeciales.length > 0
      ? movimientosEspeciales.map((item) => {
          const estado =
            String(item.tipo_movimiento_conciliacion || "").toLowerCase() ===
            "no_identificado"
              ? "En revisión"
              : "Identificado";

          return [
            item.fecha || "-",
            nombreBancoMovimiento(item),
            item.descripcion || "-",
            nombreTipoMovimiento(item.tipo_movimiento_conciliacion),
            item.categoria_manual || "-",
            dinero(item.abonos),
            estado,
            item.observacion_conciliacion || "-",
          ];
        })
      : [["-", "-", "No hay movimientos especiales", "-", "-", "-", "-", "-"]],
  theme: "grid",
  margin: { left: 10, right: 10 },
  tableWidth: pageWidthEspecial - 20,
  headStyles: {
    fillColor: hexToRgb(morado),
    textColor: [255, 255, 255],
    fontStyle: "bold",
    fontSize: 7,
    halign: "left",
  },
  styles: {
    fontSize: 7,
    cellPadding: 1.8,
    textColor: hexToRgb(texto),
    lineColor: [130, 130, 145],
    lineWidth: 0.2,
    overflow: "linebreak",
    valign: "middle",
  },
  columnStyles: {
    0: { cellWidth: 20 },
    1: { cellWidth: 34 },
    2: { cellWidth: 62 },
    3: { cellWidth: 32 },
    4: { cellWidth: 34 },
    5: { cellWidth: 24, halign: "right", fontStyle: "bold" },
    6: { cellWidth: 25 },
    7: { cellWidth: 40 },
  },
  didParseCell: (data) => {
    if (data.section === "body" && data.column.index === 5) {
      data.cell.styles.fontStyle = "bold";
    }

    if (data.section === "body" && data.column.index === 6) {
      const estado = String(data.cell.raw || "").toLowerCase();

      if (estado.includes("revisión") || estado.includes("revision")) {
        data.cell.styles.textColor = hexToRgb(colores.rojoTexto);
        data.cell.styles.fontStyle = "bold";
      } else {
        data.cell.styles.textColor = hexToRgb(colores.verdeTexto);
        data.cell.styles.fontStyle = "bold";
      }
    }
  },
});

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(...hexToRgb(colores.textoSuave));
      doc.text(`Página ${i} / ${totalPages}`, pageWidth / 2, pageHeight - 5, {
        align: "center",
      });
    }

    doc.save(`${nombreArchivoBase}.pdf`);
  } catch (error) {
    console.error("Error exportando PDF:", error);
    alert(`Error al exportar PDF: ${error.message}`);
  } finally {
    setExportandoPdf(false);
  }
};

  return (
    <div
      className="page"
      style={{
        background: `
          radial-gradient(circle at top right, rgba(109,90,123,0.08), transparent 22%),
          radial-gradient(circle at bottom left, rgba(109,90,123,0.05), transparent 18%),
          ${colores.fondo}
        `,
        minHeight: "100vh",
        paddingBottom: "40px",
      }}
    >
      <div className="container" style={{ maxWidth: "1450px" }}>
        <div
          style={{
            ...cardStyle,
            marginTop: "20px",
            marginBottom: "20px",
            overflow: "hidden",
            position: "relative",
            background: "linear-gradient(180deg, #ffffff, #faf8fd)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-90px",
              right: "-90px",
              width: "310px",
              height: "310px",
              borderRadius: "50%",
              background: "#f2edf7",
            }}
          />
          <div style={{ padding: "30px", position: "relative", zIndex: 2 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "20px",
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: colores.morado,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Reporte de ingresos
                </p>
                <h1
                  style={{
                    margin: "8px 0 8px 0",
                    fontSize: "34px",
                    lineHeight: 1.1,
                    color: colores.texto,
                    fontWeight: 800,
                  }}
                >
                  {empresaActiva?.nombre
                    ? `Reporte de Ingresos: ${empresaActiva.nombre}`
                    : "Reporte de Ingresos"}
                </h1>
                <p
                  style={{
                    margin: 0,
                    color: colores.textoSuave,
                    fontSize: "15px",
                    maxWidth: "780px",
                  }}
                >
                  Período: Del {desde} al {hasta}. Vista gerencial de ventas,
                  disponibilidad, bancos, alquileres y diferencias en revisión.
                </p>
              </div>

              <div className="actions" style={{ flexWrap: "wrap" }}>
                <button
                  className="btn btn-secondary"
                  onClick={exportarExcel}
                  disabled={exportandoExcel || cargando || !empresaId}
                >
                  {exportandoExcel ? "Exportando Excel..." : "Exportar Excel"}
                </button>

                <button
                  className="btn btn-primary"
                  onClick={exportarPDF}
                  disabled={exportandoPdf || cargando || !empresaId}
                >
                  {exportandoPdf ? "Exportando PDF..." : "Exportar PDF"}
                </button>

                <button className="btn btn-secondary" onClick={() => navigate("/inicio")}>
                  Ir a Inicio
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: "22px", marginBottom: "20px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
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

            <div style={{ display: "flex", alignItems: "end" }}>
              <button className="btn btn-primary" onClick={cargarReportes}>
                Actualizar reporte
              </button>
            </div>
          </div>
        </div>

        {cargando ? (
          <div style={{ ...cardStyle, padding: "30px", textAlign: "center" }}>
            <p style={{ margin: 0, color: colores.textoSuave }}>
              Cargando reporte...
            </p>
          </div>
        ) : (
          <>
            <div style={{ ...cardStyle, padding: "22px", marginBottom: "22px" }}>
              <h2 style={{ margin: 0, color: colores.texto, fontSize: "22px" }}>
                1. Resumen de Ventas y Disponibilidad
              </h2>
              <p
                style={{
                  margin: "8px 0 18px 0",
                  color: colores.textoSuave,
                  fontSize: "14px",
                }}
              >
                Aquí se muestra que el dinero existe, aunque no todo esté aplicado
                todavía en banco.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: "16px",
                }}
              >
                <div style={{ background: colores.moradoSuave, padding: "18px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.textoSuave, fontSize: "13px" }}>
                    Ventas Totales (Facturadas)
                  </p>
                  <h2 style={{ margin: "8px 0 0 0", color: colores.texto }}>
                    {dinero(resumenFacturacion.totalFacturado)}
                  </h2>
                </div>

                <div style={{ background: colores.moradoSuave, padding: "18px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.textoSuave, fontSize: "13px" }}>
                    Alquiler facturado
                  </p>
                  <h2 style={{ margin: "8px 0 0 0", color: colores.texto }}>
                    {dinero(resumenFacturacion.alquilerFacturado)}
                  </h2>
                </div>

                <div style={{ background: colores.moradoSuave, padding: "18px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.textoSuave, fontSize: "13px" }}>
                    Servicios facturados
                  </p>
                  <h2 style={{ margin: "8px 0 0 0", color: colores.texto }}>
                    {dinero(resumenFacturacion.serviciosFacturados)}
                  </h2>
                </div>

                <div style={{ background: colores.azul, padding: "18px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.azulTexto, fontSize: "13px" }}>
                    Dinero Realmente Recibido
                  </p>
                  <h2 style={{ margin: "8px 0 0 0", color: colores.azulTexto }}>
                    {dinero(resumenGeneral.dineroRecibido)}
                  </h2>
                </div>

                <div style={{ background: colores.verde, padding: "18px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.verdeTexto, fontSize: "13px" }}>
                    Depositado en Bancos
                  </p>
                  <h2 style={{ margin: "8px 0 0 0", color: colores.verdeTexto }}>
                    {dinero(resumenGeneral.totalConciliadoVentas)}
                  </h2>
                </div>

                {numero(resumenDescuentosPOS.totalDescuentos) !== 0 && (
                  <div style={{ background: colores.amarillo, padding: "18px", borderRadius: "18px" }}>
                    <p style={{ margin: 0, color: colores.amarilloTexto, fontSize: "13px" }}>
                      Total descuentos POS
                    </p>
                    <h2 style={{ margin: "8px 0 0 0", color: colores.amarilloTexto }}>
                      {dinero(resumenDescuentosPOS.totalDescuentos)}
                    </h2>
                    <p style={{ margin: "6px 0 0 0", color: colores.amarilloTexto, fontSize: "12px" }}>
                      Comisión {dinero(resumenDescuentosPOS.comision)} · IVA {dinero(resumenDescuentosPOS.ivaComision)} · Anticipo {dinero(resumenDescuentosPOS.anticipo)}
                    </p>
                  </div>
                )}

                <div style={{ background: colores.amarillo, padding: "18px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.amarilloTexto, fontSize: "13px" }}>
                    Pendiente acumulado anterior
                  </p>
                  <h2 style={{ margin: "8px 0 0 0", color: colores.amarilloTexto }}>
                    {dinero(resumenGeneral.pendienteAnterior)}
                  </h2>
                </div>

                <div style={{ background: colores.amarillo, padding: "18px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.amarilloTexto, fontSize: "13px" }}>
                    Pendiente del período
                  </p>
                  <h2 style={{ margin: "8px 0 0 0", color: colores.amarilloTexto }}>
                    {dinero(resumenGeneral.pendientePeriodo)}
                  </h2>
                </div>

                <div style={{ background: colores.rojo, padding: "18px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.rojoTexto, fontSize: "13px" }}>
                    Total pendiente de depósito/acreditación
                  </p>
                  <h2 style={{ margin: "8px 0 0 0", color: colores.rojoTexto }}>
                    {dinero(resumenGeneral.totalPendienteDepositar)}
                  </h2>
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: "22px", marginBottom: "22px" }}>
              <h2 style={{ margin: 0, color: colores.texto, fontSize: "22px" }}>
                2. Conciliación de Ingresos
              </h2>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Concepto</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Monto</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conciliacionIngresos.map((item) => {
                      const badge = badgeEstado(item.estado);

                      return (
                        <tr key={item.concepto}>
                          <td style={tdStyle}>{item.concepto}</td>
                          <td style={{ ...tdStyle, fontWeight: 700 }}>
                            {dinero(item.monto)}
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                background: badge.background,
                                color: badge.color,
                                border: badge.border,
                                borderRadius: "999px",
                                padding: "5px 10px",
                                fontSize: "12px",
                                fontWeight: 700,
                                display: "inline-block",
                              }}
                            >
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: "22px", marginBottom: "22px" }}>
              <h2 style={{ margin: 0, color: colores.texto, fontSize: "22px" }}>
                3. Conciliación Bancaria por Cuenta
              </h2>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Banco</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Ventas Facturadas</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Depositado Banco</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Pendiente Anterior</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Pendiente Período</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Total Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {esperadoPorBanco.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ ...tdStyle, textAlign: "center" }}>
                          No hay datos por banco.
                        </td>
                      </tr>
                    ) : (
                      esperadoPorBanco.map((item) => (
                        <tr key={item.banco}>
                          <td style={tdStyle}>
                            <strong>{item.banco}</strong>
                          </td>
                          <td style={tdStyle}>{dinero(item.esperado)}</td>
                          <td style={{ ...tdStyle, color: colores.verdeTexto, fontWeight: 700 }}>
                            {dinero(item.conciliadoVentas)}
                          </td>
                          <td style={tdStyle}>{dinero(item.pendienteAnterior)}</td>
                          <td style={tdStyle}>{dinero(item.pendientePeriodo)}</td>
                          <td style={{ ...tdStyle, color: colores.rojoTexto, fontWeight: 700 }}>
                            {dinero(item.pendiente)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: "22px", marginBottom: "22px" }}>
              <h2 style={{ margin: 0, color: colores.texto, fontSize: "22px" }}>
                4. Control de Alquileres
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "14px",
                  marginBottom: "18px",
                }}
              >
                <div style={{ background: colores.verde, padding: "16px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.verdeTexto, fontSize: "13px" }}>
                    Total esperado de alquileres
                  </p>
                  <h3 style={{ margin: "8px 0 0 0", color: colores.verdeTexto }}>
                    {dinero(resumenAlquileres.facturado)}
                  </h3>
                </div>

                <div style={{ background: colores.azul, padding: "16px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.azulTexto, fontSize: "13px" }}>
                    Total recibido en banco
                  </p>
                  <h3 style={{ margin: "8px 0 0 0", color: colores.azulTexto }}>
                    {dinero(resumenAlquileres.pagado)}
                  </h3>
                </div>

                <div style={{ background: colores.rojo, padding: "16px", borderRadius: "18px" }}>
                  <p style={{ margin: 0, color: colores.rojoTexto, fontSize: "13px" }}>
                    Monto pendiente de cobro
                  </p>
                  <h3 style={{ margin: "8px 0 0 0", color: colores.rojoTexto }}>
                    {dinero(resumenAlquileres.saldo)}
                  </h3>
                </div>
              </div>

              <div
                style={{
                  ...cardStyle,
                  padding: "18px",
                  marginBottom: "18px",
                  background: "linear-gradient(180deg, #fff, #fbf9fd)",
                }}
              >
                <h3 style={{ marginTop: 0, color: colores.texto }}>
                  Ajuste manual rápido
                </h3>

                <div className="grid grid-4">
                  <div>
                    <label className="label">Cliente / Inquilino</label>
                    <input
                      className="input"
                      value={clienteManual}
                      onChange={(e) => setClienteManual(e.target.value)}
                      placeholder="Ej. LOCAL #2 DELIDIETAS"
                    />
                  </div>

                  <div>
                    <label className="label">Monto facturado</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={manualForm.monto_facturado}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, monto_facturado: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="label">Pagado manual</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={manualForm.monto_pagado_manual}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          monto_pagado_manual: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="label">Deuda anterior</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={manualForm.deuda_anterior}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, deuda_anterior: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="label">Saldo actual</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={manualForm.saldo_actual}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, saldo_actual: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="label">Estado</label>
                    <select
                      className="select"
                      value={manualForm.estado}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, estado: e.target.value })
                      }
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado completo">Pagado completo</option>
                      <option value="pagado parcial">Pagado parcial</option>
                      <option value="no pagado">No pagado</option>
                      <option value="abono a deuda anterior">Abono a deuda anterior</option>
                      <option value="pendiente de facturar">Pendiente de facturar</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Forma de cobro</label>
                    <input
                      className="input"
                      value={manualForm.forma_cobro}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, forma_cobro: e.target.value })
                      }
                      placeholder="TRSF / CASH / MIXTO"
                    />
                  </div>

                  <div>
                    <label className="label">Banco</label>
                    <input
                      className="input"
                      value={manualForm.banco}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, banco: e.target.value })
                      }
                      placeholder="HIPOTECARIO / BAC"
                    />
                  </div>

                  <div>
                    <label className="label">Fecha acreditado</label>
                    <input
                      type="date"
                      className="input"
                      value={manualForm.fecha_acreditado}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          fecha_acreditado: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div style={{ gridColumn: "span 3" }}>
                    <label className="label">Observación</label>
                    <input
                      className="input"
                      value={manualForm.observacion}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, observacion: e.target.value })
                      }
                      placeholder="Ej. No se facturó abril, abonó $400 a deuda anterior"
                    />
                  </div>
                </div>

                <div className="actions" style={{ marginTop: "14px" }}>
                  <button
                    className="btn btn-primary"
                    onClick={guardarManualAlquiler}
                    disabled={guardandoManual || !empresaId}
                  >
                    {guardandoManual ? "Guardando..." : "Guardar ajuste manual"}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label className="label">Buscar alquiler</label>
                <input
                  className="input"
                  value={filtroAlquiler}
                  onChange={(e) => setFiltroAlquiler(e.target.value)}
                  placeholder="inquilino, estado, observación..."
                />
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Inquilino</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Cuota / Facturado</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Monto Pagado</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Fecha de Pago</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Saldo</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Estado</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Banco</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alquileresFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ ...tdStyle, textAlign: "center" }}>
                          No hay alquileres para mostrar en este período.
                        </td>
                      </tr>
                    ) : (
                      alquileresFiltrados.map((item, index) => {
                        const badge = badgeEstado(item.estado);

                        return (
                          <tr key={`${item.cliente_nombre}-${index}`}>
                            <td style={tdStyle}>
                              <strong>{item.cliente_nombre}</strong>
                              {item.documentos ? (
                                <div
                                  style={{
                                    color: colores.textoSuave,
                                    fontSize: "12px",
                                    marginTop: "4px",
                                  }}
                                >
                                  {item.documentos}
                                </div>
                              ) : null}
                            </td>
                            <td style={tdStyle}>{dinero(item.monto_facturado)}</td>
                            <td style={tdStyle}>{dinero(item.monto_pagado_manual)}</td>
                            <td style={tdStyle}>{item.fecha_acreditado || "--"}</td>
                            <td style={{ ...tdStyle, fontWeight: 700, color: colores.rojoTexto }}>
                              {dinero(item.saldo_actual)}
                            </td>
                            <td style={tdStyle}>
                              <span
                                style={{
                                  background: badge.background,
                                  color: badge.color,
                                  border: badge.border,
                                  borderRadius: "999px",
                                  padding: "5px 10px",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  display: "inline-block",
                                }}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td style={tdStyle}>{item.banco || "-"}</td>
                            <td style={tdStyle}>{item.observacion || "-"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "20px",
                marginBottom: "22px",
              }}
            >
              <div style={{ ...cardStyle, padding: "22px" }}>
                <h2 style={{ margin: 0, color: colores.texto, fontSize: "22px" }}>
                  5. Otros ingresos y movimientos especiales
                </h2>

                <div className="grid">
                  <div style={{ background: colores.moradoSuave, padding: "16px", borderRadius: "18px" }}>
                    <p style={{ margin: 0, color: colores.textoSuave, fontSize: "13px" }}>
                      Traslados entre cuentas
                    </p>
                    <h3 style={{ margin: "8px 0 0 0", color: colores.texto }}>
                      {dinero(resumenEspeciales.traslados)}
                    </h3>
                  </div>

                  <div style={{ background: colores.moradoSuave, padding: "16px", borderRadius: "18px" }}>
                    <p style={{ margin: 0, color: colores.textoSuave, fontSize: "13px" }}>
                      Otros ingresos
                    </p>
                    <h3 style={{ margin: "8px 0 0 0", color: colores.texto }}>
                      {dinero(resumenEspeciales.otrosIngresos)}
                    </h3>
                  </div>

                  <div style={{ background: colores.moradoSuave, padding: "16px", borderRadius: "18px" }}>
                    <p style={{ margin: 0, color: colores.textoSuave, fontSize: "13px" }}>
                      Ajustes
                    </p>
                    <h3 style={{ margin: "8px 0 0 0", color: colores.texto }}>
                      {dinero(resumenEspeciales.ajustes)}
                    </h3>
                  </div>

                  <div style={{ background: colores.rojo, padding: "16px", borderRadius: "18px" }}>
                    <p style={{ margin: 0, color: colores.rojoTexto, fontSize: "13px" }}>
                      Pendientes de identificar
                    </p>
                    <h3 style={{ margin: "8px 0 0 0", color: colores.rojoTexto }}>
                      {dinero(resumenEspeciales.noIdentificados)}
                    </h3>
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, padding: "22px" }}>
                <h2 style={{ margin: 0, color: colores.texto, fontSize: "22px" }}>
                  6. Observaciones de Operación
                </h2>

                <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
                  {observacionesOperacion.map((obs, index) => (
                    <div
                      key={index}
                      style={{
                        background: colores.moradoSuave,
                        padding: "14px",
                        borderRadius: "16px",
                        color: colores.texto,
                        fontSize: "14px",
                        lineHeight: 1.6,
                      }}
                    >
                      <strong>Observación {index + 1}:</strong> {obs}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "18px 20px",
                  borderBottom: `1px solid ${colores.borde}`,
                  background: "linear-gradient(180deg, #fcfbfe, #faf8fd)",
                }}
              >
                <h2 style={{ margin: 0, color: colores.texto, fontSize: "20px" }}>
                  Detalle de movimientos especiales
                </h2>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Fecha</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Banco</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Descripción</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Tipo</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Categoría</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Abono</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Estado</th>
                      <th style={{ ...tableHeadStyle, padding: "14px" }}>Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientosEspeciales.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ ...tdStyle, textAlign: "center" }}>
                          No hay movimientos especiales en este período.
                        </td>
                      </tr>
                    ) : (
                      movimientosEspeciales.map((item) => {
                        const estado =
                          item.tipo_movimiento_conciliacion === "no_identificado"
                            ? "En revisión"
                            : "Identificado";

                        const badge = badgeEstado(estado);

                        return (
                          <tr key={item.estado_banco_detalle_id}>
                            <td style={tdStyle}>{item.fecha}</td>
                            <td style={tdStyle}>
                              <strong>{nombreBancoMovimiento(item)}</strong>
                            </td>
                            <td style={tdStyle}>{item.descripcion || "-"}</td>
                            <td style={tdStyle}>
                              {nombreTipoMovimiento(item.tipo_movimiento_conciliacion)}
                            </td>
                            <td style={tdStyle}>{item.categoria_manual || "-"}</td>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>
                              {dinero(item.abonos)}
                            </td>
                            <td style={tdStyle}>
                              
                              <span
                                style={{
                                  background: badge.background,
                                  color: badge.color,
                                  border: badge.border,
                                  borderRadius: "999px",
                                  padding: "5px 10px",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  display: "inline-block",
                                }}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td>
  <input
    className="input"
    defaultValue={item.observacion_conciliacion || item.observacion || ""}
    style={{ minWidth: "180px" }}
    onBlur={async (e) => {
      const nuevaObs = e.target.value;

      const { error } = await supabase
        .from("estado_cuenta_banco_detalle")
        .update({
          observacion_conciliacion: nuevaObs,
        })
        .eq("id", item.estado_banco_detalle_id || item.id);

      if (error) {
        alert("Error guardando observación: " + error.message);
        return;
      }

      // recargar
      cargarReportes();
    }}
  />
</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}