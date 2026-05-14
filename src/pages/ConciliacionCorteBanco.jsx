import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
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

const dinero = (n) => Number(n || 0).toFixed(2);

const textoIncluye = (a, b) =>
  String(a || "")
    .toLowerCase()
    .includes(String(b || "").toLowerCase());


const deduplicarCortePorDetalleId = (lista = []) => {
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
      monto_conciliado:
        Number(item.monto_conciliado || 0) > Number(anterior.monto_conciliado || 0)
          ? item.monto_conciliado
          : anterior.monto_conciliado,
      dcl_liquido_pagar:
        Number(item.dcl_liquido_pagar || 0) > 0
          ? item.dcl_liquido_pagar
          : anterior.dcl_liquido_pagar,
      dcl_valor_operaciones:
        Number(item.dcl_valor_operaciones || 0) > 0
          ? item.dcl_valor_operaciones
          : anterior.dcl_valor_operaciones,
    });
  });

  return Array.from(mapa.values());
};

const prepararFilasCorteBanco = (lista = []) => {
  // Maneja los dos escenarios:
  // 1 corte -> varios DCL
  // varios cortes -> 1 DCL
  //
  // La clave es agrupar por componente conectado:
  // si dos cortes comparten un DCL, se muestran como una sola fila.
  // si un corte tiene varios DCL, también se muestra como una sola fila.
  const grupos = [];

  const obtenerDclIds = (item) => {
    if (Array.isArray(item.dcl_ids) && item.dcl_ids.length > 0) {
      return item.dcl_ids.map(Number).filter(Boolean);
    }

    if (item.dcl_id) return [Number(item.dcl_id)].filter(Boolean);

    return [];
  };

  const obtenerCorteId = (item) => Number(item.corte_detalle_id);

  const fusionarGrupo = (grupo, item) => {
    const corteId = obtenerCorteId(item);
    const dclIds = obtenerDclIds(item);

    const cortes = new Set([...(grupo._corte_detalle_ids || []), corteId].filter(Boolean));
    const dcls = new Set([...(grupo.dcl_ids || []), ...dclIds].filter(Boolean));

    const detallesPrevios = Array.isArray(grupo.dcl_detalles) ? grupo.dcl_detalles : [];
    const detallesNuevos = Array.isArray(item.dcl_detalles) ? item.dcl_detalles : [];

    const mapaDetalles = new Map();

    [...detallesPrevios, ...detallesNuevos].forEach((d) => {
      const id = Number(d.dcl_id);
      if (!id || mapaDetalles.has(id)) return;
      mapaDetalles.set(id, d);
    });

    const dclDetalles = Array.from(mapaDetalles.values());

    const sumaDcl = dclDetalles.reduce(
      (acc, d) => {
        acc.valor_operaciones += Number(d.valor_operaciones || 0);
        acc.comision += Number(d.comision || 0);
        acc.iva_comision += Number(d.iva_comision || 0);
        acc.iva_percibido += Number(d.iva_percibido || 0);
        acc.liquido_pagar += Number(d.liquido_pagar || 0);
        return acc;
      },
      {
        valor_operaciones: 0,
        comision: 0,
        iva_comision: 0,
        iva_percibido: 0,
        liquido_pagar: 0,
      }
    );

    const montoBrutoCortes = Number(grupo.monto_bruto || 0) + Number(item.monto_bruto || 0);
    const montoNetoCortes = Number(grupo.monto_neto || 0) + Number(item.monto_neto || 0);

    return {
      ...grupo,
      fecha_corte:
        String(item.fecha_corte || "") < String(grupo.fecha_corte || "")
          ? item.fecha_corte
          : grupo.fecha_corte,
      tipo_ingreso: grupo.tipo_ingreso || item.tipo_ingreso,
      subtipo: grupo.subtipo || item.subtipo,
      banco_destino: grupo.banco_destino || item.banco_destino,
      numero_remesa: grupo.numero_remesa || item.numero_remesa,
      observacion: [grupo.observacion, item.observacion].filter(Boolean).join(" | "),
      corte_detalle_id: grupo.corte_detalle_id || corteId,
      _grupo_corte: true,
      _corte_detalle_ids: Array.from(cortes),
      dcl_ids: Array.from(dcls),
      dcl_id: Array.from(dcls)[0] || null,
      dcl_cantidad: dclDetalles.length || Array.from(dcls).length,
      dcl_detalles: dclDetalles,
      dcl_conciliacion_id: grupo.dcl_conciliacion_id || item.dcl_conciliacion_id,
      dcl_observacion: [grupo.dcl_observacion, item.dcl_observacion]
        .filter(Boolean)
        .join(" | "),
      dcl_fecha_emision: grupo.dcl_fecha_emision || item.dcl_fecha_emision,
      dcl_emisor_nombre: grupo.dcl_emisor_nombre || item.dcl_emisor_nombre,
      dcl_banco_sugerido: grupo.dcl_banco_sugerido || item.dcl_banco_sugerido,

      // Si hay DCL, el monto objetivo será la suma única de líquidos DCL.
      // Si no hay DCL, usamos el total de cortes.
      dcl_valor_operaciones: Number(sumaDcl.valor_operaciones.toFixed(2)),
      dcl_comision: Number(sumaDcl.comision.toFixed(2)),
      dcl_iva_comision: Number(sumaDcl.iva_comision.toFixed(2)),
      dcl_iva_percibido: Number(sumaDcl.iva_percibido.toFixed(2)),
      dcl_liquido_pagar: Number(sumaDcl.liquido_pagar.toFixed(2)),

      monto_bruto: Number(montoBrutoCortes.toFixed(2)),
      monto_neto: Number(montoNetoCortes.toFixed(2)),

      monto_conciliado:
        Number(item.monto_conciliado || 0) > Number(grupo.monto_conciliado || 0)
          ? item.monto_conciliado
          : grupo.monto_conciliado,
      es_arrastre: grupo.es_arrastre && item.es_arrastre,
    };
  };

  lista.forEach((item) => {
    const corteId = obtenerCorteId(item);
    const dclIds = obtenerDclIds(item);

    if (!corteId) return;

    let indicesRelacionados = [];

    if (dclIds.length > 0) {
      grupos.forEach((grupo, index) => {
        const grupoDcls = new Set((grupo.dcl_ids || []).map(Number));
        const comparteDcl = dclIds.some((id) => grupoDcls.has(Number(id)));

        if (comparteDcl) indicesRelacionados.push(index);
      });
    }

    if (indicesRelacionados.length === 0) {
      grupos.push({
        ...item,
        _grupo_corte: true,
        _corte_detalle_ids: [corteId],
        dcl_ids: dclIds,
        dcl_id: dclIds[0] || item.dcl_id || null,
        dcl_cantidad:
          Array.isArray(item.dcl_detalles) && item.dcl_detalles.length > 0
            ? item.dcl_detalles.length
            : dclIds.length,
      });
      return;
    }

    const principalIndex = indicesRelacionados[0];
    let principal = fusionarGrupo(grupos[principalIndex], item);

    // Si el nuevo item conecta varios grupos, los fusionamos todos.
    const restantes = indicesRelacionados.slice(1).sort((a, b) => b - a);

    restantes.forEach((idx) => {
      principal = fusionarGrupo(principal, grupos[idx]);
      grupos.splice(idx, 1);
    });

    grupos[principalIndex] = principal;
  });

  return grupos;
};

const aplicarMontoConciliadoReal = (filas = [], aplicaciones = []) => {
  const mapaMonto = aplicaciones.reduce((acc, item) => {
    const corteId = Number(item.corte_detalle_id);
    if (!corteId) return acc;

    acc[corteId] = Number(
      (Number(acc[corteId] || 0) + Number(item.monto_aplicado || 0)).toFixed(2)
    );

    return acc;
  }, {});

  return filas.map((fila) => {
    const idsCorte = fila._corte_detalle_ids?.length
      ? fila._corte_detalle_ids.map(Number)
      : [Number(fila.corte_detalle_id)];

    const montoConciliadoReal = idsCorte.reduce(
      (acc, id) => acc + Number(mapaMonto[id] || 0),
      0
    );

    return {
      ...fila,
      monto_conciliado: Number(montoConciliadoReal.toFixed(2)),
    };
  });
};


const nombreCuenta = (c) => {
  if (!c) return "";
  if (c.nombre_banco && c.nombre_cuenta) {
    return `${c.nombre_banco} - ${c.nombre_cuenta}`;
  }
  if (c.nombre_banco && c.numero_cuenta) {
    return `${c.nombre_banco} - ${c.numero_cuenta}`;
  }
  return c.nombre_banco || c.nombre_cuenta || c.numero_cuenta || `Cuenta ${c.id}`;
};

const colorEstado = (estado) => {
  switch (estado) {
    case "conciliado":
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #86efac",
      };
    case "parcial":
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fcd34d",
      };
    case "pendiente":
      return {
        background: "#e2e8f0",
        color: "#334155",
        border: "1px solid #cbd5e1",
      };
    case "revisar":
      return {
        background: "#dbeafe",
        color: "#1d4ed8",
        border: "1px solid #93c5fd",
      };
    case "pendiente_dcl":
      return {
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #fca5a5",
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
    case "parcial":
      return "Parcial";
    case "pendiente":
      return "Pendiente";
    case "revisar":
      return "Revisar";
    case "pendiente_dcl":
      return "Pendiente DCL";
    default:
      return estado || "-";
  }
};

const esPOS = (fila) => String(fila?.tipo_ingreso || "").toLowerCase() === "pos";

const tieneDCL = (fila) => {
  if (!esPOS(fila)) return true;
  return Number(fila?.dcl_liquido_pagar || 0) > 0;
};

const esPOSConciliadoAntesSinDCL = (fila) => {
  return esPOS(fila) && !tieneDCL(fila) && Number(fila?.monto_conciliado || 0) > 0.009;
};

const puedeConciliarFila = (fila) => {
  if (!esPOS(fila)) return true;
  return tieneDCL(fila) || esPOSConciliadoAntesSinDCL(fila);
};

const montoObjetivoFila = (fila) => {
  if (!fila) return 0;

  if (esPOS(fila)) {
    // Regla nueva: para POS manda el líquido del DCL.
    // Excepción de protección: si ya estaba conciliado antes y todavía no tiene DCL relacionado,
    // dejamos como objetivo lo ya aplicado para no romper conciliaciones históricas.
    if (tieneDCL(fila)) return Number(fila.dcl_liquido_pagar || 0);
    if (esPOSConciliadoAntesSinDCL(fila)) return Number(fila.monto_conciliado || 0);
    return 0;
  }

  return Number(fila.monto_esperado ?? fila.monto_bruto ?? 0);
};

const saldoPendienteFila = (fila) => {
  if (!fila) return 0;

  return Number(
    (
      montoObjetivoFila(fila) - Number(fila.monto_conciliado || 0)
    ).toFixed(2)
  );
};

const distribuirMontoEntreCortes = (fila, montoTotal) => {
  const total = Number(montoTotal || 0);

  const ids = fila?._corte_detalle_ids?.length
    ? fila._corte_detalle_ids.map(Number).filter(Boolean)
    : [Number(fila?.corte_detalle_id)].filter(Boolean);

  if (ids.length <= 1) {
    return [{ corte_detalle_id: ids[0], monto: Number(total.toFixed(2)) }];
  }

  const dclTotal = Number(fila?.dcl_valor_operaciones || 0);
  const liquidoTotal = Number(fila?.dcl_liquido_pagar || 0);

  // Si el grupo viene de varios cortes para un mismo DCL,
  // usamos el bruto de cada corte como proporción para repartir el neto aplicado.
  const brutoTotalCortes = Number(fila?.monto_bruto || 0);

  let pendientes = ids.map((id) => ({
    corte_detalle_id: id,
    brutoBase: brutoTotalCortes > 0 ? brutoTotalCortes / ids.length : 1,
  }));

  // Si no tenemos detalle por corte, usamos división proporcional simple.
  // Lo importante es que todos los cortes queden con aplicación real,
  // para que el reporte no deje un corte pendiente falso.
  if (pendientes.length > 0) {
    const baseTotal = pendientes.reduce((acc, x) => acc + Number(x.brutoBase || 0), 0) || pendientes.length;

    let acumulado = 0;

    return pendientes.map((item, index) => {
      if (index === pendientes.length - 1) {
        return {
          corte_detalle_id: item.corte_detalle_id,
          monto: Number((total - acumulado).toFixed(2)),
        };
      }

      const monto = Number(((total * Number(item.brutoBase || 0)) / baseTotal).toFixed(2));
      acumulado += monto;

      return {
        corte_detalle_id: item.corte_detalle_id,
        monto,
      };
    });
  }

  return [{ corte_detalle_id: Number(fila?.corte_detalle_id), monto: Number(total.toFixed(2)) }];
};

const estadoVisibleFila = (fila) => {
  if (!fila) return "pendiente";

  if (esPOS(fila) && !tieneDCL(fila) && !esPOSConciliadoAntesSinDCL(fila)) {
    return "pendiente_dcl";
  }

  const saldo = saldoPendienteFila(fila);
  const conciliado = Number(fila.monto_conciliado || 0);

  if (Math.abs(saldo) <= 0.009) return "conciliado";
  if (conciliado > 0.009) return "parcial";

  return String(fila.estado_calculado || "pendiente").toLowerCase();
};

 
export default function ConciliacionCorteBanco() {
  const navigate = useNavigate();

  const [empresaId, setEmpresaId] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());

  const [empresas, setEmpresas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [filas, setFilas] = useState([]);
  const [movimientosBanco, setMovimientosBanco] = useState([]);
  const [detalleAplicaciones, setDetalleAplicaciones] = useState([]);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardandoClasificacion, setGuardandoClasificacion] = useState(null);

  const [mostrarConciliados, setMostrarConciliados] = useState(false);
  const [incluirPendientesAnteriores, setIncluirPendientesAnteriores] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaBancoPendiente, setBusquedaBancoPendiente] = useState("");

  const [modalAbierto, setModalAbierto] = useState(false);
  const [filaActiva, setFilaActiva] = useState(null);

  const [selecciones, setSelecciones] = useState({});
  const [observacionModal, setObservacionModal] = useState("");
  const [mostrarSoloDisponibles, setMostrarSoloDisponibles] = useState(true);
  const [buscarBanco, setBuscarBanco] = useState("");
  const [verTodosMovimientos, setVerTodosMovimientos] = useState(false);

  useEffect(() => {
    cargarEmpresas();
    cargarEmpresaSeleccionada();
  }, []);

  useEffect(() => {
    if (empresaId) {
      cargarCuentas(empresaId);
    } else {
      setCuentas([]);
      setCuentaId("");
    }
  }, [empresaId]);

  useEffect(() => {
    if (empresaId && desde && hasta) {
      cargarTodo();
    } else {
      setFilas([]);
      setMovimientosBanco([]);
      setDetalleAplicaciones([]);
    }
  }, [empresaId, cuentaId, desde, hasta, incluirPendientesAnteriores]);

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

  const cargarCuentas = async (empresa_id) => {
    const { data, error } = await supabase
      .from("cuentas_bancarias")
      .select("id, nombre_banco, nombre_cuenta, numero_cuenta, activo")
      .eq("empresa_id", Number(empresa_id))
      .order("id", { ascending: true });

    if (error) {
      console.error("Error cargando cuentas bancarias:", error);
      return;
    }

    setCuentas((data || []).filter((c) => c.activo !== false));
  };

  const obtenerNombreBancoPorCuenta = (idCuenta) => {
    const cuenta = cuentas.find((c) => String(c.id) === String(idCuenta));
    return cuenta?.nombre_banco || "";
  };

  const cargarTodo = async () => {
    setCargando(true);

    try {
      let dataCorteFinal = [];

      if (incluirPendientesAnteriores) {
        let queryCorte = supabase
          .from("vw_corte_banco_resumen")
          .select("*")
          .eq("empresa_id", Number(empresaId))
          .lte("fecha_corte", hasta)
          .order("fecha_corte", { ascending: true });

        if (cuentaId) {
          queryCorte = queryCorte.eq("banco_destino", obtenerNombreBancoPorCuenta(cuentaId));
        }

        const { data: dataCorte, error: errorCorte } = await queryCorte;

        if (errorCorte) {
          console.error("Error cargando vw_corte_banco_resumen:", errorCorte);
          return;
        }

        dataCorteFinal = (dataCorte || []).filter((item) => {
          // Cargamos todo hasta la fecha final y después el UI oculta lo conciliado
          // usando el monto real de conciliacion_corte_banco_detalle.
          return item.fecha_corte <= hasta;
        });
      } else {
        let queryCorte = supabase
          .from("vw_corte_banco_resumen")
          .select("*")
          .eq("empresa_id", Number(empresaId))
          .gte("fecha_corte", desde)
          .lte("fecha_corte", hasta)
          .order("fecha_corte", { ascending: true });

        if (cuentaId) {
          queryCorte = queryCorte.eq("banco_destino", obtenerNombreBancoPorCuenta(cuentaId));
        }

        const { data: dataCorte, error: errorCorte } = await queryCorte;

        if (errorCorte) {
          console.error("Error cargando vw_corte_banco_resumen:", errorCorte);
          return;
        }

        dataCorteFinal = dataCorte || [];
      }

      dataCorteFinal = deduplicarCortePorDetalleId(dataCorteFinal);

      const corteDetalleIds = dataCorteFinal
        .map((item) => Number(item.corte_detalle_id))
        .filter(Boolean);

      let mapaDclPorCorte = {};

      if (corteDetalleIds.length > 0) {
        const { data: dataDclConciliacion, error: errorDclConciliacion } = await supabase
          .from("dcl_conciliacion")
          .select("id, dcl_id, corte_detalle_id, observacion, monto_aplicado")
          .eq("empresa_id", Number(empresaId))
          .in("corte_detalle_id", corteDetalleIds);

        if (errorDclConciliacion) {
          console.error("Error cargando relaciones DCL:", errorDclConciliacion);
        } else {
          const dclIds = (dataDclConciliacion || [])
            .map((d) => Number(d.dcl_id))
            .filter(Boolean);

          let mapaDcl = {};

          if (dclIds.length > 0) {
            const { data: dataDclResumen, error: errorDclResumen } = await supabase
              .from("vw_dcl_resumen")
              .select("id, fecha_emision, emisor_nombre, valor_operaciones, comision, iva_comision, iva_percibido, liquido_pagar, banco_sugerido")
              .in("id", dclIds);

            if (errorDclResumen) {
              console.error("Error cargando resumen DCL:", errorDclResumen);
            } else {
              mapaDcl = (dataDclResumen || []).reduce((acc, dcl) => {
                acc[Number(dcl.id)] = dcl;
                return acc;
              }, {});
            }
          }

          mapaDclPorCorte = (dataDclConciliacion || []).reduce((acc, rel) => {
            const corteId = Number(rel.corte_detalle_id);
            const dcl = mapaDcl[Number(rel.dcl_id)] || {};

            if (!acc[corteId]) {
              acc[corteId] = {
                dcl_conciliacion_id: rel.id,
                dcl_ids: [],
                dcl_id: null,
                dcl_observacion: "",
                dcl_fecha_emision: null,
                dcl_emisor_nombre: null,
                dcl_valor_operaciones: 0,
                dcl_comision: 0,
                dcl_iva_comision: 0,
                dcl_iva_percibido: 0,
                dcl_liquido_pagar: 0,
                dcl_banco_sugerido: null,
                dcl_cantidad: 0,
                dcl_detalles: [],
              };
            }

            const base = acc[corteId];

            const valorOperaciones = Number(dcl.valor_operaciones || 0);
            const liquidoPagar = Number(dcl.liquido_pagar || 0);
            const montoAplicadoBruto = Number(rel.monto_aplicado || 0);

            // Si existe monto_aplicado, usamos proporción.
            // Ejemplo: DCL bruto 341.10, líquido 311.19.
            // Si aplicó todo, suma 311.19.
            // Si algún día se parte entre cortes, prorratea.
            const proporcion =
              montoAplicadoBruto > 0 && valorOperaciones > 0
                ? Math.min(montoAplicadoBruto / valorOperaciones, 1)
                : 1;

            const liquidoAplicado = Number((liquidoPagar * proporcion).toFixed(2));
            const comisionAplicada = Number((Number(dcl.comision || 0) * proporcion).toFixed(2));
            const ivaComisionAplicada = Number((Number(dcl.iva_comision || 0) * proporcion).toFixed(2));
            const ivaPercibidoAplicado = Number((Number(dcl.iva_percibido || 0) * proporcion).toFixed(2));
            const brutoAplicado = Number(
              (montoAplicadoBruto > 0 ? montoAplicadoBruto : valorOperaciones).toFixed(2)
            );

            base.dcl_ids.push(Number(rel.dcl_id));

            if (!base.dcl_detalles.some((x) => Number(x.dcl_id) === Number(rel.dcl_id))) {
              base.dcl_detalles.push({
                dcl_id: Number(rel.dcl_id),
                valor_operaciones: brutoAplicado,
                comision: comisionAplicada,
                iva_comision: ivaComisionAplicada,
                iva_percibido: ivaPercibidoAplicado,
                liquido_pagar: liquidoAplicado,
              });
            }

            base.dcl_id = base.dcl_ids[0];
            base.dcl_conciliacion_id = base.dcl_conciliacion_id || rel.id;
            base.dcl_observacion = [base.dcl_observacion, rel.observacion]
              .filter(Boolean)
              .join(" | ");
            base.dcl_fecha_emision = base.dcl_fecha_emision || dcl.fecha_emision || null;
            base.dcl_emisor_nombre = base.dcl_emisor_nombre || dcl.emisor_nombre || null;
            base.dcl_valor_operaciones = Number(
              (Number(base.dcl_valor_operaciones || 0) + brutoAplicado).toFixed(2)
            );
            base.dcl_comision = Number(
              (Number(base.dcl_comision || 0) + comisionAplicada).toFixed(2)
            );
            base.dcl_iva_comision = Number(
              (Number(base.dcl_iva_comision || 0) + ivaComisionAplicada).toFixed(2)
            );
            base.dcl_iva_percibido = Number(
              (Number(base.dcl_iva_percibido || 0) + ivaPercibidoAplicado).toFixed(2)
            );
            base.dcl_liquido_pagar = Number(
              (Number(base.dcl_liquido_pagar || 0) + liquidoAplicado).toFixed(2)
            );
            base.dcl_banco_sugerido = base.dcl_banco_sugerido || dcl.banco_sugerido || null;
            base.dcl_cantidad = base.dcl_ids.length;

            acc[corteId] = base;
            return acc;
          }, {});
        }
      }

      dataCorteFinal = dataCorteFinal.map((item) => ({
        ...item,
        ...(mapaDclPorCorte[Number(item.corte_detalle_id)] || {}),
        es_arrastre: item.fecha_corte < desde,
      }));

      dataCorteFinal = deduplicarCortePorDetalleId(dataCorteFinal);
      dataCorteFinal = prepararFilasCorteBanco(dataCorteFinal);

      let queryBanco = supabase
        .from("vw_banco_conciliacion_resumen")
        .select("*")
        .eq("empresa_id", Number(empresaId))
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: true });

      if (cuentaId) {
        queryBanco = queryBanco.eq("cuenta_bancaria_id", Number(cuentaId));
      }

      const { data: dataBanco, error: errorBanco } = await queryBanco;

      if (errorBanco) {
        console.error("Error cargando vw_banco_conciliacion_resumen:", errorBanco);
        return;
      }

      const { data: dataDetalle, error: errorDetalle } = await supabase
        .from("conciliacion_corte_banco_detalle")
        .select("*")
        .eq("empresa_id", Number(empresaId));

      if (errorDetalle) {
        console.error("Error cargando conciliacion_corte_banco_detalle:", errorDetalle);
        return;
      }

      setFilas(aplicarMontoConciliadoReal(dataCorteFinal, dataDetalle || []));
      setMovimientosBanco(dataBanco || []);
      setDetalleAplicaciones(dataDetalle || []);
    } catch (error) {
      console.error("Error general cargando conciliación corte banco:", error);
    } finally {
      setCargando(false);
    }
  };

  const filasFiltradas = useMemo(() => {
    let data = [...filas];

    if (!mostrarConciliados) {
      data = data.filter((f) => estadoVisibleFila(f) !== "conciliado");
    }

    if (busqueda.trim()) {
      data = data.filter(
        (f) =>
          textoIncluye(f.tipo_ingreso, busqueda) ||
          textoIncluye(f.subtipo, busqueda) ||
          textoIncluye(f.numero_remesa, busqueda) ||
          textoIncluye(f.banco_destino, busqueda) ||
          textoIncluye(f.observacion, busqueda) ||
          textoIncluye(f.fecha_corte, busqueda) ||
          textoIncluye(f.es_arrastre ? "arrastre" : "actual", busqueda)
      );
    }

    return data;
  }, [filas, mostrarConciliados, busqueda]);

  const resumen = useMemo(() => {
    return filas.reduce(
      (acc, fila) => {
        const estado = estadoVisibleFila(fila);

        acc.totalEsperado += montoObjetivoFila(fila);
        acc.totalConciliado += Number(fila.monto_conciliado || 0);
        acc.totalPendiente += saldoPendienteFila(fila);

        if (estado === "pendiente" || estado === "pendiente_dcl") acc.pendientes += 1;
        if (estado === "parcial") acc.parciales += 1;
        if (estado === "conciliado") acc.conciliados += 1;
        if (fila.es_arrastre) acc.arrastres += 1;

        return acc;
      },
      {
        totalEsperado: 0,
        totalConciliado: 0,
        totalPendiente: 0,
        pendientes: 0,
        parciales: 0,
        conciliados: 0,
        arrastres: 0,
      }
    );
  }, [filas]);

  const abrirModal = (fila) => {
    if (!puedeConciliarFila(fila)) {
      alert("Este POS está pendiente de DCL. Primero conciliá el DCL para usar el líquido real del banco.");
      return;
    }

    setFilaActiva(fila);
    setModalAbierto(true);
    setObservacionModal("");
    setBuscarBanco("");
    setMostrarSoloDisponibles(true);
    setVerTodosMovimientos(false);

    const idsCorte = fila._corte_detalle_ids?.length
      ? fila._corte_detalle_ids.map(Number)
      : [Number(fila.corte_detalle_id)];

    const relacionadas = detalleAplicaciones.filter((d) =>
      idsCorte.includes(Number(d.corte_detalle_id))
    );

    const base = {};
    relacionadas.forEach((r) => {
      base[r.estado_banco_detalle_id] = {
        selected: true,
        monto_aplicar: Number(r.monto_aplicado || 0),
        existente: true,
        detalle_id: r.id,
      };
    });

    setSelecciones(base);
  };

  const cerrarModal = () => {
    if (guardando) return;
    setModalAbierto(false);
    setFilaActiva(null);
    setSelecciones({});
    setObservacionModal("");
  };

  const movimientosAplicadosFilaActiva = useMemo(() => {
    if (!filaActiva) return [];

    const idsCorte = filaActiva._corte_detalle_ids?.length
      ? filaActiva._corte_detalle_ids.map(Number)
      : [Number(filaActiva.corte_detalle_id)];

    return detalleAplicaciones
      .filter((d) => idsCorte.includes(Number(d.corte_detalle_id)))
      .map((d) => {
        const mov = movimientosBanco.find(
          (m) => Number(m.estado_banco_detalle_id) === Number(d.estado_banco_detalle_id)
        );

        return {
          ...d,
          movimiento: mov || null,
        };
      });
  }, [filaActiva, detalleAplicaciones, movimientosBanco]);

  const candidatosBanco = useMemo(() => {
    if (!filaActiva) return [];

    let data = [...movimientosBanco];

    data = data.filter((m) => Number(m.abonos || 0) > 0);

    if (cuentaId) {
      data = data.filter(
        (m) => String(m.cuenta_bancaria_id) === String(cuentaId)
      );
    }

    if (filaActiva?.banco_destino && !verTodosMovimientos) {
      data = data.filter((m) => {
        const cuenta = cuentas.find(
          (c) => Number(c.id) === Number(m.cuenta_bancaria_id)
        );

        const bancoNombre = cuenta?.nombre_banco || "";
        return (
          textoIncluye(bancoNombre, filaActiva.banco_destino) ||
          textoIncluye(filaActiva.banco_destino, bancoNombre) ||
          textoIncluye(m.descripcion, filaActiva.banco_destino)
        );
      });
    }

    if (mostrarSoloDisponibles) {
      data = data.filter((m) => Number(m.saldo_disponible || 0) > 0.009);
    }

    data = data.filter(
      (m) =>
        !["traslado", "otro_ingreso", "ajuste", "no_identificado"].includes(
          String(m.tipo_movimiento_conciliacion || "")
        ) || selecciones[m.estado_banco_detalle_id]?.existente
    );

    if (buscarBanco.trim()) {
      data = data.filter(
        (m) =>
          textoIncluye(m.fecha, buscarBanco) ||
          textoIncluye(m.descripcion, buscarBanco) ||
          textoIncluye(m.abonos, buscarBanco) ||
          textoIncluye(m.observacion_conciliacion, buscarBanco)
      );
    }

    return data;
  }, [
    filaActiva,
    movimientosBanco,
    mostrarSoloDisponibles,
    buscarBanco,
    cuentaId,
    verTodosMovimientos,
    cuentas,
    selecciones,
  ]);

  const totalSeleccionado = useMemo(() => {
    return Object.entries(selecciones).reduce((acc, [, val]) => {
      if (!val?.selected) return acc;
      return acc + Number(val.monto_aplicar || 0);
    }, 0);
  }, [selecciones]);

  const saldoFilaActiva = useMemo(() => {
    if (!filaActiva) return 0;
    return Number(
      (
        montoObjetivoFila(filaActiva) - Number(totalSeleccionado || 0)
      ).toFixed(2)
    );
  }, [filaActiva, totalSeleccionado]);

  const toggleSeleccion = (movimiento) => {
    const movId = movimiento.estado_banco_detalle_id;

    setSelecciones((prev) => {
      const actual = prev[movId];
      const disponibleReal = actual?.existente
        ? Number(actual.monto_aplicar || 0)
        : Number(movimiento.saldo_disponible || 0);

      if (actual?.selected) {
        return {
          ...prev,
          [movId]: {
            ...actual,
            selected: false,
          },
        };
      }

      const montoSugerido = Number(
        Math.min(
          Number(
            saldoFilaActiva > 0
              ? saldoFilaActiva
              : saldoPendienteFila(filaActiva)
          ),
          disponibleReal
        ).toFixed(2)
      );

      return {
        ...prev,
        [movId]: {
          selected: true,
          monto_aplicar: montoSugerido > 0 ? montoSugerido : disponibleReal,
          existente: actual?.existente || false,
          detalle_id: actual?.detalle_id || null,
        },
      };
    });
  };

  const cambiarMontoAplicar = (movimiento, valor) => {
    const movId = movimiento.estado_banco_detalle_id;
    const num = Number(valor || 0);

    setSelecciones((prev) => ({
      ...prev,
      [movId]: {
        ...(prev[movId] || {}),
        selected: true,
        monto_aplicar: num,
        existente: prev[movId]?.existente || false,
        detalle_id: prev[movId]?.detalle_id || null,
      },
    }));
  };

  const validarSelecciones = () => {
    if (!filaActiva) {
      alert("No hay fila activa.");
      return false;
    }

    if (!puedeConciliarFila(filaActiva)) {
      alert("Este POS está pendiente de DCL. Primero conciliá el DCL para usar el líquido real del banco.");
      return false;
    }

    const activos = Object.entries(selecciones).filter(([, val]) => val?.selected);

    if (activos.length === 0) {
      alert("Seleccioná al menos un movimiento bancario.");
      return false;
    }

    for (const [movId, val] of activos) {
      const movimiento = movimientosBanco.find(
        (m) => Number(m.estado_banco_detalle_id) === Number(movId)
      );

      if (!movimiento) {
        alert("Uno de los movimientos seleccionados ya no existe.");
        return false;
      }

      const monto = Number(val.monto_aplicar || 0);
      if (monto <= 0) {
        alert("Todos los montos a aplicar deben ser mayores a 0.");
        return false;
      }

      const disponible = val.existente
        ? Number(val.monto_aplicar || 0)
        : Number(movimiento.saldo_disponible || 0);

      if (monto - disponible > 0.009) {
        alert(
          `El monto aplicado en un movimiento excede el saldo disponible. Movimiento ${movimiento.fecha} - ${movimiento.descripcion}`
        );
        return false;
      }
    }

    const esperado = montoObjetivoFila(filaActiva);
    const total = Number(totalSeleccionado || 0);

    if (total - esperado > 0.009) {
      alert("El total aplicado no puede ser mayor que el monto a conciliar del corte.");
      return false;
    }

    return true;
  };

  const guardarConciliacion = async () => {
    if (!filaActiva) return;
    if (!validarSelecciones()) return;

    setGuardando(true);

    try {
      const activos = Object.entries(selecciones).filter(([, val]) => val?.selected);
      const existentes = Object.entries(selecciones).filter(
        ([, val]) => val?.existente && !val?.selected && val?.detalle_id
      );

      for (const [, val] of existentes) {
        const { error } = await supabase
          .from("conciliacion_corte_banco_detalle")
          .delete()
          .eq("id", Number(val.detalle_id));

        if (error) throw error;
      }

      for (const [movId, val] of activos) {
        const montoAplicarMovimiento = Number(val.monto_aplicar || 0);
        const distribucion = distribuirMontoEntreCortes(
          filaActiva,
          montoAplicarMovimiento
        ).filter((x) => Number(x.monto || 0) > 0);

        // Si es una fila agrupada por varios cortes, primero eliminamos aplicaciones
        // previas de ese movimiento para esos cortes y luego insertamos la nueva distribución.
        const idsCorteGrupo = distribucion.map((x) => Number(x.corte_detalle_id));

        if (idsCorteGrupo.length > 0) {
          const { error: errorDeletePrevio } = await supabase
            .from("conciliacion_corte_banco_detalle")
            .delete()
            .eq("empresa_id", Number(empresaId))
            .eq("estado_banco_detalle_id", Number(movId))
            .in("corte_detalle_id", idsCorteGrupo);

          if (errorDeletePrevio) throw errorDeletePrevio;
        }

        const payloads = distribucion.map((x) => ({
          empresa_id: Number(empresaId),
          corte_detalle_id: Number(x.corte_detalle_id),
          estado_banco_detalle_id: Number(movId),
          monto_aplicado: Number(x.monto || 0),
          observacion: observacionModal || null,
        }));

        const { error } = await supabase
          .from("conciliacion_corte_banco_detalle")
          .upsert(payloads, {
            onConflict: "corte_detalle_id,estado_banco_detalle_id",
          });

        if (error) throw error;

        const { error: errorTipo } = await supabase
          .from("estado_cuenta_banco_detalle")
          .update({
            tipo_movimiento_conciliacion: "venta",
            observacion_conciliacion: observacionModal || null,
          })
          .eq("id", Number(movId));

        if (errorTipo) throw errorTipo;
      }

      alert("Conciliación guardada correctamente.");
      await cargarTodo();
      cerrarModal();
    } catch (error) {
      console.error("Error guardando conciliación:", error);
      alert(`Error al guardar conciliación: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const deshacerConciliacionCorte = async (fila) => {
    if (!fila) return;

    const idsCorte = fila._corte_detalle_ids?.length
      ? fila._corte_detalle_ids.map(Number)
      : [Number(fila.corte_detalle_id)];

    const relacionadas = detalleAplicaciones.filter((d) =>
      idsCorte.includes(Number(d.corte_detalle_id))
    );

    if (relacionadas.length === 0) {
      alert("Este corte no tiene movimientos bancarios aplicados.");
      return;
    }

    const ok = window.confirm(
      `¿Deshacer conciliación de este corte?\n\nSe quitarán ${relacionadas.length} movimiento(s) aplicado(s) y volverán a quedar disponibles en banco.`
    );

    if (!ok) return;

    setGuardando(true);

    try {
      const idsBanco = relacionadas
        .map((r) => Number(r.estado_banco_detalle_id))
        .filter(Boolean);

      const idsDetalle = relacionadas
        .map((r) => Number(r.id))
        .filter(Boolean);

      if (idsDetalle.length > 0) {
        const { error: errorDelete } = await supabase
          .from("conciliacion_corte_banco_detalle")
          .delete()
          .in("id", idsDetalle);

        if (errorDelete) throw errorDelete;
      }

      if (idsBanco.length > 0) {
        const { data: restantes, error: errorRestantes } = await supabase
          .from("conciliacion_corte_banco_detalle")
          .select("estado_banco_detalle_id")
          .in("estado_banco_detalle_id", idsBanco);

        if (errorRestantes) throw errorRestantes;

        const usadosTodavia = new Set(
          (restantes || []).map((r) => Number(r.estado_banco_detalle_id))
        );

        const idsParaLiberar = idsBanco.filter((id) => !usadosTodavia.has(Number(id)));

        if (idsParaLiberar.length > 0) {
          const { error: errorBanco } = await supabase
            .from("estado_cuenta_banco_detalle")
            .update({
              tipo_movimiento_conciliacion: "pendiente",
              observacion_conciliacion: null,
            })
            .in("id", idsParaLiberar);

          if (errorBanco) throw errorBanco;
        }
      }

      alert("Conciliación deshecha correctamente.");
      await cargarTodo();
      cerrarModal();
    } catch (error) {
      console.error("Error deshaciendo conciliación:", error);
      alert(`Error al deshacer conciliación: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const clasificarMovimientoBanco = async (movimiento, tipo, categoria) => {
    const confirmar = window.confirm(
      `¿Seguro que querés marcar este movimiento como "${categoria}"?`
    );
    if (!confirmar) return;

    setGuardandoClasificacion(movimiento.estado_banco_detalle_id);

    try {
      const { error } = await supabase
        .from("estado_cuenta_banco_detalle")
        .update({
          tipo_movimiento_conciliacion: tipo,
          categoria_manual: categoria,
          observacion_conciliacion: categoria,
        })
        .eq("id", Number(movimiento.estado_banco_detalle_id));

      if (error) throw error;

      await cargarTodo();
      alert("Movimiento clasificado.");
    } catch (error) {
      console.error("Error clasificando movimiento:", error);
      alert(`Error al clasificar movimiento: ${error.message}`);
    } finally {
      setGuardandoClasificacion(null);
    }
  };

  const badgeTipoBanco = (tipo) => {
    const mapa = {
      pendiente: { bg: "#e2e8f0", color: "#334155", text: "Pendiente" },
      venta: { bg: "#dcfce7", color: "#166534", text: "Venta" },
      traslado: { bg: "#fef3c7", color: "#92400e", text: "Traslado" },
      otro_ingreso: { bg: "#dbeafe", color: "#1d4ed8", text: "Otro ingreso" },
      ajuste: { bg: "#ede9fe", color: "#5b21b6", text: "Ajuste" },
      no_identificado: { bg: "#fee2e2", color: "#991b1b", text: "No identificado" },
    };

    const item = mapa[String(tipo || "").toLowerCase()] || mapa.pendiente;

    return (
      <span
        style={{
          display: "inline-block",
          padding: "4px 10px",
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: 600,
          background: item.bg,
          color: item.color,
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        {item.text}
      </span>
    );
  };

  const movimientosBancoPendientes = useMemo(() => {
    let data = [...movimientosBanco].filter((m) => Number(m.abonos || 0) > 0);

    data = data.filter((m) => {
      const tipo = String(m.tipo_movimiento_conciliacion || "").toLowerCase();
      return tipo !== "venta";
    });

    if (busquedaBancoPendiente.trim()) {
      data = data.filter(
        (m) =>
          textoIncluye(m.fecha, busquedaBancoPendiente) ||
          textoIncluye(m.descripcion, busquedaBancoPendiente) ||
          textoIncluye(m.abonos, busquedaBancoPendiente) ||
          textoIncluye(m.observacion_conciliacion, busquedaBancoPendiente) ||
          textoIncluye(m.categoria_manual, busquedaBancoPendiente)
      );
    }

    return data;
  }, [movimientosBanco, busquedaBancoPendiente]);

  const exportarReporteBancoPendientes = () => {
    try {
      const rows = movimientosBancoPendientes.map((m) => {
        const cuenta = cuentas.find(
          (c) => Number(c.id) === Number(m.cuenta_bancaria_id)
        );

        return {
          Fecha: m.fecha || "",
          Cuenta: nombreCuenta(cuenta) || "",
          Descripcion: m.descripcion || "",
          Abono: Number(m.abonos || 0),
          Saldo_Disponible: Number(m.saldo_disponible || 0),
          Tipo_Clasificacion: m.tipo_movimiento_conciliacion || "pendiente",
          Categoria: m.categoria_manual || "",
          Observacion: m.observacion_conciliacion || "",
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 14 },
        { wch: 28 },
        { wch: 50 },
        { wch: 14 },
        { wch: 18 },
        { wch: 18 },
        { wch: 22 },
        { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "IngresosEstadoCuenta");
      XLSX.writeFile(
        wb,
        `Reporte_Ingresos_Estado_Cuenta_${desde}_a_${hasta}.xlsx`
      );
    } catch (error) {
      console.error("Error exportando reporte:", error);
      alert(`Error exportando reporte: ${error.message}`);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🏦 Conciliación Corte vs Banco</h1>
            <p className="subtitle">
              Revisa solo lo pendiente y concilia cada ingreso del corte con uno o varios movimientos bancarios.
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
              <label className="label">Cuenta bancaria</label>
              <select
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="select"
              >
                <option value="">Todas las cuentas</option>
                {cuentas.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {nombreCuenta(cuenta)}
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
            <div style={{ minWidth: "280px", flex: 1 }}>
              <label className="label">Buscar</label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="input"
                placeholder="fecha, tipo, remesa, banco, observación..."
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "20px",
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

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "20px",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              <input
                type="checkbox"
                checked={incluirPendientesAnteriores}
                onChange={(e) => setIncluirPendientesAnteriores(e.target.checked)}
              />
              Incluir pendientes anteriores
            </label>
          </div>
        </div>

        <div className="grid grid-4" style={{ marginBottom: "18px" }}>
          <div className="stat-card">
            <p className="stat-title">Total esperado</p>
            <p className="stat-value">${dinero(resumen.totalEsperado)}</p>
          </div>

          <div className="stat-card">
            <p className="stat-title">Total conciliado</p>
            <p className="stat-value">${dinero(resumen.totalConciliado)}</p>
          </div>

          <div className="stat-card">
            <p className="stat-title">Saldo pendiente</p>
            <p className="stat-value">${dinero(resumen.totalPendiente)}</p>
          </div>

          <div className="stat-card">
            <p className="stat-title">Arrastres</p>
            <p className="stat-value">{resumen.arrastres}</p>
          </div>
        </div>

        <div className="grid grid-3" style={{ marginBottom: "18px" }}>
          <div className="card">
            <h2 className="module-title" style={{ marginBottom: "10px" }}>
              Estados
            </h2>
            <div className="grid">
              <span className="badge">Pendientes: {resumen.pendientes}</span>
              <span className="badge">Parciales: {resumen.parciales}</span>
              <span className="badge">Conciliados: {resumen.conciliados}</span>
            </div>
          </div>

          <div className="card">
            <h2 className="module-title" style={{ marginBottom: "10px" }}>
              Vista principal
            </h2>
            <div className="grid">
              <span className="badge">Por defecto no muestra conciliados</span>
              <span className="badge">Trabajás solo lo pendiente</span>
              <span className="badge">La conciliación se hace por modal</span>
            </div>
          </div>

          <div className="card">
            <h2 className="module-title" style={{ marginBottom: "10px" }}>
              Pendientes anteriores
            </h2>
            <div className="grid">
              <span className="badge">Se muestran como arrastre</span>
              <span className="badge">No se duplican</span>
              <span className="badge">Se concilian en el mes actual</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
          <h2 className="module-title" style={{ marginBottom: "14px" }}>
            Ingresos del corte pendientes de conciliar
          </h2>

          {cargando ? (
            <p className="module-text">Cargando conciliación...</p>
          ) : filasFiltradas.length === 0 ? (
            <p className="module-text">
              No hay registros pendientes con los filtros seleccionados.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Origen</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Subtipo</th>
                    <th>Banco destino</th>
                    <th>Remesa</th>
                    <th>A conciliar</th>
                    <th>Conciliado</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filasFiltradas.map((fila) => {
                    const estado = estadoVisibleFila(fila);

                    return (
                      <tr key={(fila.dcl_ids?.length ? `dcl-${fila.dcl_ids.join("-")}` : `corte-${fila.corte_detalle_id}`)}>
                        <td>
                          <span className="badge">
                            {fila.es_arrastre ? "Arrastre" : "Actual"}
                          </span>
                        </td>
                        <td>{fila.fecha_corte}</td>
                        <td>{fila.tipo_ingreso || "-"}</td>
                        <td>{fila.subtipo || "-"}</td>
                        <td>{fila.banco_destino || "-"}</td>
                        <td>{fila.numero_remesa || "-"}</td>
                        <td>
                          ${dinero(montoObjetivoFila(fila))}
                          {esPOS(fila) && tieneDCL(fila) ? (
                            <div style={{ fontSize: "11px", color: "#166534", fontWeight: 700 }}>
                              Neto DCL
                              {Number(fila.dcl_cantidad || 0) > 1
                                ? ` (${fila.dcl_cantidad} DCL)`
                                : ""}
                              {fila._corte_detalle_ids?.length > 1
                                ? ` / ${fila._corte_detalle_ids.length} cortes`
                                : ""}
                            </div>
                          ) : null}
                          {esPOS(fila) && !tieneDCL(fila) && !esPOSConciliadoAntesSinDCL(fila) ? (
                            <div style={{ fontSize: "11px", color: "#991b1b", fontWeight: 700 }}>
                              Falta DCL
                            </div>
                          ) : null}
                        </td>
                        <td>${dinero(fila.monto_conciliado)}</td>
                        <td>${dinero(saldoPendienteFila(fila))}</td>
                        <td>
                          <span
                            style={{
                              ...colorEstado(estado),
                              padding: "4px 10px",
                              borderRadius: "999px",
                              fontSize: "12px",
                              fontWeight: 600,
                              display: "inline-block",
                            }}
                          >
                            {etiquetaEstado(estado)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button
                              className="btn btn-primary"
                              onClick={() => abrirModal(fila)}
                              disabled={!puedeConciliarFila(fila)}
                            >
                              {puedeConciliarFila(fila) ? "Conciliar" : "Pendiente DCL"}
                            </button>

                            {Number(fila.monto_conciliado || 0) > 0.009 ? (
                              <button
                                className="btn btn-secondary"
                                onClick={() => deshacerConciliacionCorte(fila)}
                                disabled={guardando}
                              >
                                Deshacer
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
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
                Abonos del banco por identificar / clasificar
              </h2>
              <p className="module-text" style={{ margin: 0 }}>
                Aquí podés justificar ingresos del estado de cuenta como traslado, otro ingreso o no identificado.
              </p>
            </div>

            <div className="actions">
              <button className="btn btn-secondary" onClick={exportarReporteBancoPendientes}>
                Exportar Excel
              </button>
            </div>
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label className="label">Buscar en estado de cuenta</label>
            <input
              type="text"
              value={busquedaBancoPendiente}
              onChange={(e) => setBusquedaBancoPendiente(e.target.value)}
              className="input"
              placeholder="fecha, descripción, observación, categoría..."
            />
          </div>

          {movimientosBancoPendientes.length === 0 ? (
            <p className="module-text">No hay abonos pendientes de clasificar en este rango.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Descripción</th>
                    <th>Cuenta</th>
                    <th>Abono</th>
                    <th>Disponible</th>
                    <th>Estado</th>
                    <th>Categoría</th>
                    <th>Observación</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosBancoPendientes.map((mov) => {
                    const cuenta = cuentas.find(
                      (c) => Number(c.id) === Number(mov.cuenta_bancaria_id)
                    );

                    return (
                      <tr key={mov.estado_banco_detalle_id}>
                        <td>{mov.fecha}</td>
                        <td>{mov.descripcion || "-"}</td>
                        <td>{nombreCuenta(cuenta) || "-"}</td>
                        <td>${dinero(mov.abonos)}</td>
                        <td>${dinero(mov.saldo_disponible)}</td>
                        <td>{badgeTipoBanco(mov.tipo_movimiento_conciliacion)}</td>
                        <td>{mov.categoria_manual || "-"}</td>
                        <td>{mov.observacion_conciliacion || "-"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <button
                              className="btn btn-secondary"
                              disabled={guardandoClasificacion === mov.estado_banco_detalle_id}
                              onClick={() =>
                                clasificarMovimientoBanco(
                                  mov,
                                  "traslado",
                                  "transferencia_entre_cuentas"
                                )
                              }
                            >
                              Traslado
                            </button>

                            <button
                              className="btn btn-secondary"
                              disabled={guardandoClasificacion === mov.estado_banco_detalle_id}
                              onClick={() =>
                                clasificarMovimientoBanco(
                                  mov,
                                  "otro_ingreso",
                                  "otro_ingreso"
                                )
                              }
                            >
                              Otro ingreso
                            </button>

                            <button
                              className="btn btn-secondary"
                              disabled={guardandoClasificacion === mov.estado_banco_detalle_id}
                              onClick={() =>
                                clasificarMovimientoBanco(
                                  mov,
                                  "no_identificado",
                                  "abono_no_identificado"
                                )
                              }
                            >
                              No identificado
                            </button>

                            <button
                              className="btn btn-secondary"
                              disabled={guardandoClasificacion === mov.estado_banco_detalle_id}
                              onClick={() =>
                                clasificarMovimientoBanco(
                                  mov,
                                  "venta",
                                  "venta_identificada"
                                )
                              }
                            >
                              Venta
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
                width: "min(1200px, 96vw)",
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
                    Conciliar ingreso del corte
                  </h2>
                  <p className="module-text" style={{ margin: 0 }}>
                    Seleccioná uno o varios abonos del banco y aplicá montos parciales si hace falta.
                  </p>
                </div>

                <button className="btn btn-secondary" onClick={cerrarModal}>
                  Cerrar
                </button>
              </div>

              <div className="grid grid-4" style={{ marginBottom: "18px" }}>
                <div className="stat-card">
                  <p className="stat-title">Origen</p>
                  <p className="stat-value" style={{ fontSize: "18px" }}>
                    {filaActiva.es_arrastre ? "Arrastre" : "Actual"}
                  </p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Fecha corte</p>
                  <p className="stat-value" style={{ fontSize: "18px" }}>
                    {filaActiva.fecha_corte}
                  </p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Tipo</p>
                  <p className="stat-value" style={{ fontSize: "18px" }}>
                    {filaActiva.tipo_ingreso || "-"}
                  </p>
                </div>

                <div className="stat-card">
                  <p className="stat-title">Saldo por cubrir</p>
                  <p className="stat-value">${dinero(saldoFilaActiva)}</p>
                </div>
              </div>

              <div className="grid grid-2" style={{ marginBottom: "18px" }}>
                <div className="card">
                  <h3 className="module-title" style={{ marginBottom: "10px" }}>
                    Resumen del corte
                  </h3>

                  <div className="grid">
                    <span className="badge">Subtipo: {filaActiva.subtipo || "-"}</span>
                    <span className="badge">Banco destino: {filaActiva.banco_destino || "-"}</span>
                    <span className="badge">Remesa: {filaActiva.numero_remesa || "-"}</span>
                    <span className="badge">Bruto: ${dinero(filaActiva.monto_bruto)}</span>
                    <span className="badge">Neto calculado corte: ${dinero(filaActiva.monto_neto)}</span>
                    {esPOS(filaActiva) ? (
                      <span className="badge">
                        Neto DCL: {tieneDCL(filaActiva)
                          ? `${dinero(filaActiva.dcl_liquido_pagar)}${
                              Number(filaActiva.dcl_cantidad || 0) > 1
                                ? ` (${filaActiva.dcl_cantidad} DCL)`
                                : ""
                            }`
                          : "Pendiente DCL"}
                      </span>
                    ) : null}
                    <span className="badge">A conciliar: ${dinero(montoObjetivoFila(filaActiva))}</span>
                    <span className="badge">
                      Estado actual: {etiquetaEstado(estadoVisibleFila(filaActiva))}
                    </span>
                  </div>

                  <div style={{ marginTop: "14px" }}>
                    <label className="label">Observación</label>
                    <input
                      type="text"
                      value={observacionModal}
                      onChange={(e) => setObservacionModal(e.target.value)}
                      className="input"
                      placeholder="Comentario de esta conciliación"
                    />
                  </div>
                </div>

                <div className="card">
                  <h3 className="module-title" style={{ marginBottom: "10px" }}>
                    Movimientos ya aplicados
                  </h3>

                  {movimientosAplicadosFilaActiva.length === 0 ? (
                    <p className="module-text">Todavía no hay movimientos aplicados.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th>Monto aplicado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movimientosAplicadosFilaActiva.map((item) => (
                            <tr key={item.id}>
                              <td>{item.movimiento?.fecha || "-"}</td>
                              <td>{item.movimiento?.descripcion || "-"}</td>
                              <td>${dinero(item.monto_aplicado)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="card" style={{ marginBottom: "18px" }}>
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
                  <div style={{ minWidth: "260px", flex: 1 }}>
                    <label className="label">Buscar movimiento bancario</label>
                    <input
                      type="text"
                      value={buscarBanco}
                      onChange={(e) => setBuscarBanco(e.target.value)}
                      className="input"
                      placeholder="fecha, descripción, monto..."
                    />
                  </div>

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
                      checked={mostrarSoloDisponibles}
                      onChange={(e) => setMostrarSoloDisponibles(e.target.checked)}
                    />
                    Mostrar solo disponibles
                  </label>

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
                      checked={verTodosMovimientos}
                      onChange={(e) => setVerTodosMovimientos(e.target.checked)}
                    />
                    Ver todos los bancos
                  </label>
                </div>

                <h3 className="module-title" style={{ marginBottom: "10px" }}>
                  Movimientos bancarios sugeridos
                </h3>

                {candidatosBanco.length === 0 ? (
                  <p className="module-text">No hay movimientos bancarios disponibles con esos filtros.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Sel.</th>
                          <th>Fecha</th>
                          <th>Descripción</th>
                          <th>Cuenta</th>
                          <th>Abono</th>
                          <th>Disponible</th>
                          <th>Aplicar</th>
                          <th>Tipo</th>
                          <th>Acciones rápidas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidatosBanco.map((mov) => {
                          const cuenta = cuentas.find(
                            (c) => Number(c.id) === Number(mov.cuenta_bancaria_id)
                          );

                          const control = selecciones[mov.estado_banco_detalle_id];
                          const montoAplicar = control?.monto_aplicar ?? "";
                          const checked = !!control?.selected;

                          return (
                            <tr key={mov.estado_banco_detalle_id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSeleccion(mov)}
                                />
                              </td>
                              <td>{mov.fecha}</td>
                              <td>{mov.descripcion || "-"}</td>
                              <td>{nombreCuenta(cuenta) || "-"}</td>
                              <td>${dinero(mov.abonos)}</td>
                              <td>${dinero(mov.saldo_disponible)}</td>
                              <td style={{ minWidth: "130px" }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={montoAplicar}
                                  onChange={(e) =>
                                    cambiarMontoAplicar(mov, e.target.value)
                                  }
                                  className="input"
                                  disabled={!checked}
                                />
                              </td>
                              <td>{badgeTipoBanco(mov.tipo_movimiento_conciliacion)}</td>
                              <td>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "6px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <button
                                    className="btn btn-secondary"
                                    disabled={
                                      guardandoClasificacion === mov.estado_banco_detalle_id
                                    }
                                    onClick={() =>
                                      clasificarMovimientoBanco(
                                        mov,
                                        "traslado",
                                        "transferencia_entre_cuentas"
                                      )
                                    }
                                  >
                                    Traslado
                                  </button>

                                  <button
                                    className="btn btn-secondary"
                                    disabled={
                                      guardandoClasificacion === mov.estado_banco_detalle_id
                                    }
                                    onClick={() =>
                                      clasificarMovimientoBanco(
                                        mov,
                                        "otro_ingreso",
                                        "otro_ingreso"
                                      )
                                    }
                                  >
                                    Otro ingreso
                                  </button>

                                  <button
                                    className="btn btn-secondary"
                                    disabled={
                                      guardandoClasificacion === mov.estado_banco_detalle_id
                                    }
                                    onClick={() =>
                                      clasificarMovimientoBanco(
                                        mov,
                                        "no_identificado",
                                        "abono_no_identificado"
                                      )
                                    }
                                  >
                                    No identificado
                                  </button>

                                  <button
                                    className="btn btn-secondary"
                                    disabled={
                                      guardandoClasificacion === mov.estado_banco_detalle_id
                                    }
                                    onClick={() =>
                                      clasificarMovimientoBanco(
                                        mov,
                                        "venta",
                                        "venta_identificada"
                                      )
                                    }
                                  >
                                    Venta
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div className="grid">
                  <span className="badge">
                    Total seleccionado: ${dinero(totalSeleccionado)}
                  </span>
                  <span className="badge">
                    Saldo pendiente: ${dinero(saldoFilaActiva)}
                  </span>
                </div>

                <div className="actions">
                  <button className="btn btn-secondary" onClick={cerrarModal}>
                    Cancelar
                  </button>

                  {movimientosAplicadosFilaActiva.length > 0 ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => deshacerConciliacionCorte(filaActiva)}
                      disabled={guardando}
                    >
                      Deshacer conciliación
                    </button>
                  ) : null}

                  <button
                    className="btn btn-primary"
                    onClick={guardarConciliacion}
                    disabled={guardando}
                  >
                    {guardando ? "Guardando..." : "Guardar conciliación"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}