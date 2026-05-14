import React, { useEffect, useMemo, useState } from "react";
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

const dinero = (n) => Number(n || 0).toFixed(2);
const numero = (n) => Number(n || 0);
const redondear = (n) => Number(numero(n).toFixed(2));
const diff = (a, b) => redondear(numero(a) - numero(b));

const normalizar = (txt) =>
  String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();


const deduplicarPorId = (lista = []) => {
  const mapa = new Map();

  lista.forEach((item) => {
    const id = Number(item.id);
    if (!id) return;

    if (!mapa.has(id)) {
      mapa.set(id, item);
    }
  });

  return Array.from(mapa.values());
};

const deduplicarCortesPorDetalleId = (lista = []) => {
  const mapa = new Map();

  lista.forEach((item) => {
    const id = Number(item.corte_detalle_id || item.id);
    if (!id) return;

    if (!mapa.has(id)) {
      mapa.set(id, item);
      return;
    }

    const anterior = mapa.get(id);

    mapa.set(id, {
      ...anterior,
      ...item,
      monto_bruto:
        Number(item.monto_bruto || 0) > 0 ? item.monto_bruto : anterior.monto_bruto,
      monto_neto:
        Number(item.monto_neto || 0) > 0 ? item.monto_neto : anterior.monto_neto,
      comision_monto:
        Number(item.comision_monto || 0) > 0
          ? item.comision_monto
          : anterior.comision_monto,
      iva_monto:
        Number(item.iva_monto || 0) > 0 ? item.iva_monto : anterior.iva_monto,
      anticipo_monto:
        Number(item.anticipo_monto || 0) > 0
          ? item.anticipo_monto
          : anterior.anticipo_monto,
    });
  });

  return Array.from(mapa.values());
};

const badgeColor = (ok) => ({
  background: ok ? "#dcfce7" : "#fee2e2",
  color: ok ? "#166534" : "#991b1b",
  border: ok ? "1px solid #86efac" : "1px solid #fca5a5",
});

const badgeBase = {
  display: "inline-block",
  padding: "7px 10px",
  borderRadius: "999px",
  fontWeight: 700,
  fontSize: "12px",
};

export default function ConciliacionDCL() {
  const navigate = useNavigate();

  const [empresaId, setEmpresaId] = useState("");
  const [empresas, setEmpresas] = useState([]);
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());

  const [dcls, setDcls] = useState([]);
  const [dclsExtraRelacionados, setDclsExtraRelacionados] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [relacionesDcl, setRelacionesDcl] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [autoConciliando, setAutoConciliando] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [dclActiva, setDclActiva] = useState(null);
  const [cortesSeleccionados, setCortesSeleccionados] = useState([]);
  const [observacion, setObservacion] = useState("");
  const [busquedaCorte, setBusquedaCorte] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  useEffect(() => {
    cargarEmpresas();
    cargarEmpresaSeleccionada();
  }, []);

  useEffect(() => {
    if (empresaId) {
      cargarTodo();
    } else {
      setDcls([]);
      setDclsExtraRelacionados([]);
      setCortes([]);
      setRelacionesDcl([]);
    }
  }, [empresaId, desde, hasta]);

  const cargarEmpresas = async () => {
    const { data, error } = await supabase
      .from("empresas")
      .select("id, nombre")
      .order("nombre", { ascending: true });

    if (error) {
      console.error(error);
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
      console.error(e);
    }
  };

  const cargarTodo = async () => {
    setCargando(true);

    try {
      const { data: dataDcl, error: errorDcl } = await supabase
        .from("vw_dcl_resumen")
        .select("*")
        .eq("empresa_id", Number(empresaId))
        .gte("fecha_emision", desde)
        .lte("fecha_emision", hasta)
        .order("fecha_emision", { ascending: false });

      if (errorDcl) throw errorDcl;

      // IMPORTANTE:
      // Aquí NO filtramos por dcl_conciliacion_id null.
      // Necesitamos ver cortes ya usados parcialmente, porque pueden tener saldo disponible
      // para relacionarse con otro DCL.
      const { data: dataCorte, error: errorCorte } = await supabase
        .from("vw_dcl_pendientes_corte")
        .select("*")
        .eq("empresa_id", Number(empresaId))
        .gte("fecha_corte", desde)
        .lte("fecha_corte", hasta)
        .order("fecha_corte", { ascending: false });

      if (errorCorte) throw errorCorte;

      const cortesBase = deduplicarCortesPorDetalleId(dataCorte || []);
      const dclsBase = deduplicarPorId(dataDcl || []);

      const dclIds = dclsBase.map((d) => Number(d.id)).filter(Boolean);
      const corteIds = cortesBase
        .map((c) => Number(c.corte_detalle_id || c.id))
        .filter(Boolean);

      const mapaRelaciones = new Map();

      if (dclIds.length > 0) {
        const { data: relsDcl, error: errorRelacionesDcl } = await supabase
          .from("dcl_conciliacion")
          .select("id, empresa_id, dcl_id, corte_detalle_id, observacion, monto_aplicado")
          .eq("empresa_id", Number(empresaId))
          .in("dcl_id", dclIds);

        if (errorRelacionesDcl) throw errorRelacionesDcl;
        (relsDcl || []).forEach((r) => mapaRelaciones.set(Number(r.id), r));
      }

      if (corteIds.length > 0) {
        const { data: relsCorte, error: errorRelacionesCorte } = await supabase
          .from("dcl_conciliacion")
          .select("id, empresa_id, dcl_id, corte_detalle_id, observacion, monto_aplicado")
          .eq("empresa_id", Number(empresaId))
          .in("corte_detalle_id", corteIds);

        if (errorRelacionesCorte) throw errorRelacionesCorte;
        (relsCorte || []).forEach((r) => mapaRelaciones.set(Number(r.id), r));
      }

      const dataRelaciones = Array.from(mapaRelaciones.values());

      const dclIdsBase = new Set(dclIds.map(Number));
      const dclIdsExtra = [
        ...new Set(
          dataRelaciones
            .map((r) => Number(r.dcl_id))
            .filter((id) => id && !dclIdsBase.has(id))
        ),
      ];

      let dataDclExtra = [];

      if (dclIdsExtra.length > 0) {
        const { data: extras, error: errorExtras } = await supabase
          .from("vw_dcl_resumen")
          .select("id, valor_operaciones, liquido_pagar, fecha_emision, emisor_nombre")
          .eq("empresa_id", Number(empresaId))
          .in("id", dclIdsExtra);

        if (errorExtras) throw errorExtras;
        dataDclExtra = extras || [];
      }

      setDcls(dclsBase);
      setDclsExtraRelacionados(dataDclExtra);
      setCortes(cortesBase);
      setRelacionesDcl(dataRelaciones);
    } catch (error) {
      console.error(error);
      alert(`Error cargando conciliación DCL: ${error.message}`);
    } finally {
      setCargando(false);
    }
  };

  const relacionesPorDcl = useMemo(() => {
    return relacionesDcl.reduce((acc, rel) => {
      const key = Number(rel.dcl_id);
      if (!acc[key]) acc[key] = [];
      acc[key].push(rel);
      return acc;
    }, {});
  }, [relacionesDcl]);

  const dclValorPorId = useMemo(() => {
    const mapa = {};

    [...dcls, ...dclsExtraRelacionados].forEach((dcl) => {
      mapa[Number(dcl.id)] = numero(dcl.valor_operaciones);
    });

    return mapa;
  }, [dcls, dclsExtraRelacionados]);

  const obtenerUsoCorte = (corteDetalleId, excluirDclId = null) => {
    return relacionesDcl.reduce((acc, rel) => {
      const mismoCorte = Number(rel.corte_detalle_id) === Number(corteDetalleId);
      const mismoDclExcluido =
        excluirDclId && Number(rel.dcl_id) === Number(excluirDclId);

      if (!mismoCorte || mismoDclExcluido) return acc;

      // Si existe monto_aplicado, usamos ese monto real consumido del corte.
      // Si no existe porque es data vieja, usamos el bruto del DCL como respaldo.
      const montoAplicado =
        rel.monto_aplicado !== null && rel.monto_aplicado !== undefined
          ? numero(rel.monto_aplicado)
          : numero(dclValorPorId[Number(rel.dcl_id)] || 0);

      return acc + montoAplicado;
    }, 0);
  };

  const calcularDisponibleCorte = (corte, excluirDclId = null) => {
    const brutoCorte = numero(corte.monto_bruto);
    const usado = obtenerUsoCorte(corte.corte_detalle_id, excluirDclId);
    return Math.max(0, redondear(brutoCorte - usado));
  };

  const reestablecerDCL = async (dcl) => {
    const rels = relacionesPorDcl[Number(dcl.id)] || [];

    if (rels.length === 0) {
      alert("Este DCL no tiene conciliación guardada.");
      return;
    }

    const ok = window.confirm(
      `¿Reestablecer este DCL?\n\nSe eliminará la relación con ${rels.length} POS del corte y volverá a quedar disponible para conciliar.`
    );

    if (!ok) return;

    setGuardando(true);

    try {
      const { error } = await supabase
        .from("dcl_conciliacion")
        .delete()
        .eq("empresa_id", Number(empresaId))
        .eq("dcl_id", Number(dcl.id));

      if (error) throw error;

      alert("DCL reestablecido correctamente.");
      await cargarTodo();
    } catch (error) {
      console.error(error);
      alert(`Error reestableciendo DCL: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const buscarMatchAutomatico = (dcl, cortesDisponibles) => {
    const brutoDcl = redondear(dcl.valor_operaciones);
    const bancoDcl = normalizar(dcl.banco_sugerido);
    const fechaDcl = String(dcl.fecha_emision || "");

    const candidatos = cortesDisponibles
      .map((corte) => {
        const disponibleCorte = calcularDisponibleCorte(corte, dcl.id);
        const diferenciaBruto = Math.abs(diff(brutoDcl, disponibleCorte));
        const bancoCorte = normalizar(corte.banco_destino);
        const fechaCorte = String(corte.fecha_corte || "");

        let puntaje = 0;
        if (diferenciaBruto <= 0.01) puntaje += 100;
        if (fechaDcl && fechaCorte && fechaDcl === fechaCorte) puntaje += 20;
        if (
          bancoDcl &&
          bancoDcl !== "otro" &&
          bancoCorte &&
          (bancoCorte.includes(bancoDcl) || bancoDcl.includes(bancoCorte))
        ) {
          puntaje += 15;
        }

        return {
          corte: {
            ...corte,
            usado_bruto: obtenerUsoCorte(corte.corte_detalle_id, dcl.id),
            disponible_bruto: disponibleCorte,
          },
          diferenciaBruto,
          puntaje,
        };
      })
      .filter((x) => x.corte.disponible_bruto > 0.01)
      .filter((x) => x.diferenciaBruto <= 0.01)
      .sort((a, b) => b.puntaje - a.puntaje);

    if (candidatos.length !== 1) return null;
    return candidatos[0].corte;
  };

  const sugerencias = useMemo(() => {
    return dcls.map((dcl) => {
      const relaciones = relacionesPorDcl[Number(dcl.id)] || [];
      const yaConciliado = relaciones.length > 0 || dcl.conciliado === true;
      const match = yaConciliado ? null : buscarMatchAutomatico(dcl, cortes);

      return {
        dcl,
        corte: match,
        relaciones,
        yaConciliado,
        estado: yaConciliado ? "conciliado" : match ? "listo" : "revisar",
      };
    });
  }, [dcls, cortes, relacionesPorDcl]);

  const sugerenciasFiltradas = useMemo(() => {
    if (filtroEstado === "todos") return sugerencias;
    return sugerencias.filter((item) => item.estado === filtroEstado);
  }, [sugerencias, filtroEstado]);

  const resumen = useMemo(() => {
    return sugerencias.reduce(
      (acc, item) => {
        if (item.estado !== "conciliado") acc.dclPendientes += 1;
        if (item.estado === "listo") acc.matches += 1;
        if (item.estado === "revisar") acc.revisar += 1;
        return acc;
      },
      { dclPendientes: 0, matches: 0, revisar: 0 }
    );
  }, [sugerencias]);

  const abrirModal = (dcl, corteSugerido = null) => {
    setDclActiva(dcl);
    setCortesSeleccionados(corteSugerido ? [String(corteSugerido.corte_detalle_id)] : []);
    setObservacion(corteSugerido ? "Conciliado por coincidencia de monto bruto DCL vs Corte." : "");
    setBusquedaCorte("");
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    if (guardando) return;
    setModalAbierto(false);
    setDclActiva(null);
    setCortesSeleccionados([]);
    setObservacion("");
    setBusquedaCorte("");
  };

  const cortesDisponiblesParaModal = useMemo(() => {
    if (!dclActiva) return [];

    return cortes
      .map((corte) => {
        const usado = obtenerUsoCorte(corte.corte_detalle_id, dclActiva.id);
        const disponible = Math.max(0, redondear(numero(corte.monto_bruto) - usado));

        return {
          ...corte,
          usado_bruto: usado,
          disponible_bruto: disponible,
        };
      })
      .filter((corte) => corte.disponible_bruto > 0.01);
  }, [cortes, relacionesDcl, dclValorPorId, dclActiva]);

  const cortesActivos = useMemo(() => {
    const seleccionados = new Set(cortesSeleccionados.map(String));
    return cortesDisponiblesParaModal.filter((c) =>
      seleccionados.has(String(c.corte_detalle_id))
    );
  }, [cortesSeleccionados, cortesDisponiblesParaModal]);

  const totalesCortesActivos = useMemo(() => {
    return cortesActivos.reduce(
      (acc, corte) => {
        acc.bruto += numero(corte.disponible_bruto);
        acc.comision += numero(corte.comision_monto);
        acc.ivaComision += numero(corte.iva_monto);
        acc.anticipo += numero(corte.anticipo_monto);
        acc.neto += numero(corte.monto_neto);
        return acc;
      },
      { bruto: 0, comision: 0, ivaComision: 0, anticipo: 0, neto: 0 }
    );
  }, [cortesActivos]);

  const cortesFiltradosModal = useMemo(() => {
    if (!dclActiva) return [];

    const t = normalizar(busquedaCorte);
    const brutoDcl = redondear(dclActiva.valor_operaciones);

    return cortesDisponiblesParaModal
      .map((corte) => ({
        ...corte,
        diferencia_bruto: redondear(numero(corte.disponible_bruto) - brutoDcl),
      }))
      .filter((corte) => {
        if (!t) return true;
        return (
          normalizar(corte.fecha_corte).includes(t) ||
          normalizar(corte.banco_destino).includes(t) ||
          normalizar(corte.monto_bruto).includes(t) ||
          normalizar(corte.disponible_bruto).includes(t) ||
          normalizar(corte.monto_neto).includes(t)
        );
      })
      .sort((a, b) => {
        const aExacto = Math.abs(a.diferencia_bruto) <= 0.01 ? 0 : 1;
        const bExacto = Math.abs(b.diferencia_bruto) <= 0.01 ? 0 : 1;
        if (aExacto !== bExacto) return aExacto - bExacto;
        return Math.abs(a.diferencia_bruto) - Math.abs(b.diferencia_bruto);
      });
  }, [cortesDisponiblesParaModal, dclActiva, busquedaCorte]);

  const comparacion = useMemo(() => {
    if (!dclActiva || cortesActivos.length === 0) return null;

    const brutoDcl = redondear(dclActiva.valor_operaciones);
    const disponibleSeleccionado = redondear(totalesCortesActivos.bruto);
    const restanteDisponible = redondear(disponibleSeleccionado - brutoDcl);

    return {
      bruto: restanteDisponible,
      cubreDcl: restanteDisponible >= -0.01,
      disponibleSeleccionado,
      comision: diff(dclActiva.comision, totalesCortesActivos.comision),
      ivaComision: diff(dclActiva.iva_comision, totalesCortesActivos.ivaComision),
      anticipo: diff(dclActiva.iva_percibido, totalesCortesActivos.anticipo),
      neto: diff(dclActiva.liquido_pagar, totalesCortesActivos.neto),
    };
  }, [dclActiva, cortesActivos, totalesCortesActivos]);

  const brutoCoincide = useMemo(() => {
    if (!comparacion) return false;
    // Ahora no exigimos igualdad exacta. Exigimos que el corte tenga saldo suficiente
    // para cubrir el DCL. El excedente queda disponible para otro DCL.
    return comparacion.cubreDcl;
  }, [comparacion]);

  const guardarRelacion = async ({ dcl, cortesRelacionados, obs }) => {
    if (!cortesRelacionados || cortesRelacionados.length === 0) {
      throw new Error("No hay POS seleccionado / disponibles para relacionar con el DCL.");
    }

    const brutoDcl = redondear(dcl.valor_operaciones);
    const brutoSeleccionado = redondear(
      cortesRelacionados.reduce(
        (acc, corte) => acc + numero(corte.disponible_bruto),
        0
      )
    );

    if (brutoSeleccionado + 0.01 < brutoDcl) {
      throw new Error(
        `El DCL es de $${dinero(brutoDcl)} pero el disponible seleccionado solo suma $${dinero(brutoSeleccionado)}.`
      );
    }

    const idsSeleccionados = [
      ...new Set(cortesRelacionados.map((c) => Number(c.corte_detalle_id)).filter(Boolean)),
    ];

    const { data: existentes, error: errorExistentes } = await supabase
      .from("dcl_conciliacion")
      .select("corte_detalle_id")
      .eq("empresa_id", Number(empresaId))
      .eq("dcl_id", Number(dcl.id))
      .in("corte_detalle_id", idsSeleccionados);

    if (errorExistentes) throw errorExistentes;

    const yaUsados = new Set(
      (existentes || []).map((x) => Number(x.corte_detalle_id))
    );

    const cortesFinales = cortesRelacionados.filter(
      (x) => !yaUsados.has(Number(x.corte_detalle_id))
    );

    if (cortesFinales.length === 0) {
      throw new Error(
        "Todos los POS seleccionado / disponibles ya estaban relacionados con este mismo DCL."
      );
    }

    let restanteDcl = brutoDcl;

    const payload = cortesFinales
      .map((corte) => {
        const disponibleCorte = redondear(numero(corte.disponible_bruto));
        const montoAplicado = redondear(Math.min(disponibleCorte, restanteDcl));
        restanteDcl = redondear(restanteDcl - montoAplicado);

        return {
          empresa_id: Number(empresaId),
          dcl_id: Number(dcl.id),
          corte_detalle_id: Number(corte.corte_detalle_id),
          monto_aplicado: montoAplicado,
          observacion: obs || null,
          updated_at: new Date().toISOString(),
        };
      })
      .filter((item) => item.monto_aplicado > 0.01);

    const { error } = await supabase.from("dcl_conciliacion").insert(payload);

    if (error) throw error;
  };

  const guardarConciliacion = async () => {
    if (!dclActiva || cortesActivos.length === 0) {
      alert("Seleccioná un DCL y uno o más POS del corte.");
      return;
    }

    if (!brutoCoincide) {
      alert("El corte seleccionado no tiene saldo disponible suficiente para cubrir este DCL.");
      return;
    }

    setGuardando(true);

    try {
      await guardarRelacion({
        dcl: dclActiva,
        cortesRelacionados: cortesActivos,
        obs: observacion || `Conciliado desde modal DCL con ${cortesActivos.length} POS del corte.`,
      });

      alert("DCL conciliado correctamente. Este POS usará el líquido del DCL en Corte vs Banco.");
      cerrarModal();
      await cargarTodo();
    } catch (error) {
      console.error(error);
      alert(`Error conciliando DCL: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const conciliarAutomaticamente = async () => {
    if (!empresaId) {
      alert("Seleccioná una empresa.");
      return;
    }

    const pendientes = sugerencias
      .filter((item) => item.estado !== "conciliado")
      .map((item) => item.dcl);

    const relaciones = [];
    const ambiguos = [];

    pendientes.forEach((dcl) => {
      const brutoDcl = redondear(dcl.valor_operaciones);

      const posibles = cortes
        .map((corte) => {
          const usadoActual = obtenerUsoCorte(corte.corte_detalle_id, dcl.id);
          const usadoTemporal = relaciones
            .filter((r) => Number(r.corte.corte_detalle_id) === Number(corte.corte_detalle_id))
            .reduce((acc, r) => acc + numero(r.dcl.valor_operaciones), 0);

          const disponible = Math.max(
            0,
            redondear(numero(corte.monto_bruto) - usadoActual - usadoTemporal)
          );

          return {
            ...corte,
            disponible_bruto: disponible,
            usado_bruto: usadoActual + usadoTemporal,
          };
        })
        .filter((corte) => corte.disponible_bruto > 0.01)
        .filter(
          (corte) => Math.abs(diff(brutoDcl, corte.disponible_bruto)) <= 0.01
        );

      if (posibles.length === 1) {
        relaciones.push({ dcl, corte: posibles[0] });
      } else if (posibles.length > 1) {
        ambiguos.push({ dcl, posibles });
      }
    });

    if (relaciones.length === 0) {
      alert(
        ambiguos.length > 0
          ? "No concilié automáticamente porque hay montos repetidos. Revisalos desde el modal."
          : "No encontré coincidencias exactas por monto bruto disponible."
      );
      return;
    }

    const confirmar = window.confirm(
      `Se van a conciliar automáticamente ${relaciones.length} DCL por coincidencia exacta contra el saldo disponible del corte.\n\nLos casos ambiguos o sin match quedarán para revisión. ¿Continuar?`
    );

    if (!confirmar) return;

    setAutoConciliando(true);

    try {
      for (const item of relaciones) {
        await guardarRelacion({
          dcl: item.dcl,
          cortesRelacionados: [item.corte],
          obs: "Conciliado automáticamente por coincidencia exacta de monto bruto DCL vs disponible del corte.",
        });
      }

      alert(
        `Conciliación automática terminada.\nConciliados: ${relaciones.length}\nPara revisar: ${ambiguos.length}`
      );

      await cargarTodo();
    } catch (error) {
      console.error(error);
      alert(`Error en conciliación automática: ${error.message}`);
    } finally {
      setAutoConciliando(false);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1 className="title">🔗 Conciliación DCL</h1>
            <p className="subtitle">
              Concilia DCL contra POS usando el saldo disponible del corte. Cuando el disponible llega a cero, ya no vuelve a salir para otro DCL.
            </p>
          </div>

          <div className="actions">
            <button className="btn btn-secondary" onClick={() => navigate("/inicio")}>
              Ir a Inicio
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "18px" }}>
          <div className="grid grid-4">
            <div>
              <label className="label">Empresa</label>
              <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className="select">
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
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
            </div>

            <div>
              <label className="label">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: "10px", flexWrap: "wrap" }}>
              <button className="btn btn-secondary" onClick={cargarTodo} disabled={cargando || autoConciliando}>
                Actualizar
              </button>
              <button
                className="btn btn-primary"
                onClick={conciliarAutomaticamente}
                disabled={cargando || autoConciliando || dcls.length === 0 || cortes.length === 0}
              >
                {autoConciliando ? "Conciliando..." : "Conciliar automático"}
              </button>
            </div>
          </div>
        </div>

        {cargando ? (
          <div className="card">
            <p className="module-text">Cargando...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-4" style={{ marginBottom: "18px" }}>
              <div className="stat-card">
                <p className="stat-title">DCL pendientes</p>
                <p className="stat-value">{resumen.dclPendientes}</p>
              </div>
              <div className="stat-card">
                <p className="stat-title">Listos por bruto</p>
                <p className="stat-value">{resumen.matches}</p>
              </div>
              <div className="stat-card">
                <p className="stat-title">Para revisar</p>
                <p className="stat-value">{resumen.revisar}</p>
              </div>
              <div className="stat-card">
                <p className="stat-title">POS con saldo disponible</p>
                <p className="stat-value">{cortes.length}</p>
              </div>
            </div>

            <div className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <h2 className="module-title" style={{ marginBottom: "4px" }}>
                    DCL por conciliar
                  </h2>
                  <p className="module-text" style={{ margin: 0 }}>
                    Se sugiere el POS cuando el disponible cubre el bruto del DCL. Si sobra saldo, queda disponible para otro DCL.
                  </p>
                </div>

                <div style={{ minWidth: "240px" }}>
                  <label className="label">Filtrar estado</label>
                  <select
                    className="select"
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                  >
                    <option value="todos">Todos</option>
                    <option value="revisar">Solo revisar</option>
                    <option value="listo">Listos por bruto</option>
                    <option value="conciliado">Conciliados</option>
                  </select>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Emisor</th>
                      <th>Banco</th>
                      <th>Bruto DCL</th>
                      <th>Líquido DCL</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sugerenciasFiltradas.length > 0 ? (
                      sugerenciasFiltradas.map(({ dcl, corte, relaciones, estado }) => (
                        <tr key={dcl.id}>
                          <td>{dcl.fecha_emision}</td>
                          <td>{dcl.emisor_nombre || "-"}</td>
                          <td>{dcl.banco_sugerido || "-"}</td>
                          <td>${dinero(dcl.valor_operaciones)}</td>
                          <td>${dinero(dcl.liquido_pagar)}</td>
                          <td>
                            {estado === "conciliado" ? (
                              <span style={{ ...badgeBase, ...badgeColor(true) }}>
                                Conciliado con {relaciones.length} POS
                              </span>
                            ) : corte ? (
                              <span style={{ ...badgeBase, ...badgeColor(true) }}>
                                Match bruto: ${dinero(corte.monto_bruto)}
                              </span>
                            ) : (
                              <span style={{ ...badgeBase, ...badgeColor(false) }}>
                                Revisar manual
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {estado !== "conciliado" ? (
                                <button className="btn btn-primary" onClick={() => abrirModal(dcl, corte)}>
                                  {corte ? "Ver / Confirmar" : "Buscar POS"}
                                </button>
                              ) : null}

                              {estado === "conciliado" ? (
                                <button className="btn btn-secondary" onClick={() => reestablecerDCL(dcl)} disabled={guardando}>
                                  Reestablecer DCL
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" style={{ textAlign: "center", color: "#64748b" }}>
                          No hay DCL para mostrar con el filtro seleccionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {modalAbierto && dclActiva && (
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
                width: "min(1100px, 96vw)",
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
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: "18px",
                }}
              >
                <div>
                  <h2 className="module-title" style={{ marginBottom: "4px" }}>
                    Conciliar DCL con POS del corte
                  </h2>
                  <p className="module-text" style={{ margin: 0 }}>
                    Seleccioná uno o más POS del corte. El disponible seleccionado debe cubrir el bruto del DCL; si sobra, queda disponible para otro DCL.
                  </p>
                </div>

                <button className="btn btn-secondary" onClick={cerrarModal}>
                  Cerrar
                </button>
              </div>

              <div className="grid grid-4" style={{ marginBottom: "18px" }}>
                <div className="stat-card">
                  <p className="stat-title">Fecha DCL</p>
                  <p className="stat-value" style={{ fontSize: "18px" }}>
                    {dclActiva.fecha_emision}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-title">Banco sugerido</p>
                  <p className="stat-value" style={{ fontSize: "18px" }}>
                    {dclActiva.banco_sugerido || "-"}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-title">Bruto DCL</p>
                  <p className="stat-value">${dinero(dclActiva.valor_operaciones)}</p>
                </div>
                <div className="stat-card">
                  <p className="stat-title">Líquido DCL</p>
                  <p className="stat-value">${dinero(dclActiva.liquido_pagar)}</p>
                </div>
              </div>

              <div className="grid grid-2" style={{ marginBottom: "18px" }}>
                <div className="card">
                  <h3 className="module-title" style={{ marginBottom: "10px" }}>DCL</h3>
                  <div className="grid">
                    <span className="badge">Emisor: {dclActiva.emisor_nombre || "-"}</span>
                    <span className="badge">Bruto: ${dinero(dclActiva.valor_operaciones)}</span>
                    <span className="badge">Comisión: ${dinero(dclActiva.comision)}</span>
                    <span className="badge">IVA comisión: ${dinero(dclActiva.iva_comision)}</span>
                    <span className="badge">Anticipo: ${dinero(dclActiva.iva_percibido)}</span>
                    <span className="badge">Neto / líquido: ${dinero(dclActiva.liquido_pagar)}</span>
                  </div>
                </div>

                <div className="card">
                  <h3 className="module-title" style={{ marginBottom: "10px" }}>POS seleccionado / disponible</h3>
                  {cortesActivos.length > 0 ? (
                    <div className="grid">
                      <span className="badge">POS seleccionado / disponibles: {cortesActivos.length}</span>
                      <span className="badge">Disponible seleccionado: ${dinero(totalesCortesActivos.bruto)}</span>
                      <span className="badge">Comisión calculada total: ${dinero(totalesCortesActivos.comision)}</span>
                      <span className="badge">IVA comisión total: ${dinero(totalesCortesActivos.ivaComision)}</span>
                      <span className="badge">Anticipo total: ${dinero(totalesCortesActivos.anticipo)}</span>
                      <span className="badge">Neto calculado total: ${dinero(totalesCortesActivos.neto)}</span>
                      {cortesActivos.map((corte) => (
                        <span key={corte.corte_detalle_id} className="badge">
                          {corte.fecha_corte} · {corte.banco_destino || "-"} · Disponible ${dinero(corte.disponible_bruto)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="module-text">Aún no seleccionaste POS del corte.</p>
                  )}
                </div>
              </div>

              {comparacion && (
                <div className="card" style={{ marginBottom: "18px" }}>
                  <h3 className="module-title" style={{ marginBottom: "10px" }}>Diferencias</h3>
                  <div className="grid grid-4">
                    <span style={{ ...badgeBase, ...badgeColor(comparacion.cubreDcl) }}>
                      Disponible después: ${dinero(comparacion.bruto)}
                    </span>
                    <span style={{ ...badgeBase, ...badgeColor(Math.abs(comparacion.comision) <= 0.01) }}>
                      Comisión: ${dinero(comparacion.comision)}
                    </span>
                    <span style={{ ...badgeBase, ...badgeColor(Math.abs(comparacion.ivaComision) <= 0.01) }}>
                      IVA comisión: ${dinero(comparacion.ivaComision)}
                    </span>
                    <span style={{ ...badgeBase, ...badgeColor(Math.abs(comparacion.anticipo) <= 0.01) }}>
                      Anticipo: ${dinero(comparacion.anticipo)}
                    </span>
                    <span style={{ ...badgeBase, ...badgeColor(Math.abs(comparacion.neto) <= 0.01) }}>
                      Neto: ${dinero(comparacion.neto)}
                    </span>
                  </div>
                  <p className="module-text" style={{ marginTop: "12px" }}>
                    Para guardar exigimos que el corte tenga saldo disponible suficiente. Si sobra, queda disponible para otro DCL.
                  </p>
                </div>
              )}

              <div className="card" style={{ marginBottom: "18px" }}>
                <div style={{ marginBottom: "12px" }}>
                  <label className="label">Buscar POS del corte</label>
                  <input
                    className="input"
                    value={busquedaCorte}
                    onChange={(e) => setBusquedaCorte(e.target.value)}
                    placeholder="fecha, banco, monto..."
                  />
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Sel.</th>
                        <th>Fecha</th>
                        <th>Banco</th>
                        <th>Bruto corte</th>
                        <th>Usado por DCL</th>
                        <th>Disponible</th>
                        <th>Disponible después</th>
                        <th>Neto corte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cortesFiltradosModal.length > 0 ? (
                        cortesFiltradosModal.map((row) => {
                          const seleccionado = cortesSeleccionados.includes(String(row.corte_detalle_id));
                          const ok = row.diferencia_bruto >= -0.01;
                          return (
                            <tr
                              key={row.corte_detalle_id}
                              style={seleccionado ? { outline: "2px solid #2563eb", background: "#eff6ff" } : {}}
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  checked={seleccionado}
                                  onChange={() => {
                                    const id = String(row.corte_detalle_id);
                                    setCortesSeleccionados((prev) =>
                                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                    );
                                  }}
                                />
                              </td>
                              <td>{row.fecha_corte}</td>
                              <td>{row.banco_destino || "-"}</td>
                              <td>${dinero(row.monto_bruto)}</td>
                              <td>${dinero(row.usado_bruto)}</td>
                              <td>
                                <span style={{ ...badgeBase, ...badgeColor(row.disponible_bruto > 0.01) }}>
                                  ${dinero(row.disponible_bruto)}
                                </span>
                              </td>
                              <td>
                                <span style={{ ...badgeBase, ...badgeColor(ok) }}>
                                  ${dinero(row.diferencia_bruto)}
                                </span>
                              </td>
                              <td>${dinero(row.monto_neto)}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="8" style={{ textAlign: "center", color: "#64748b" }}>
                            No hay POS del corte pendientes con esos filtros.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-2">
                <div>
                  <label className="label">Observación</label>
                  <input
                    className="input"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    placeholder="Comentario de conciliación DCL"
                  />
                </div>
              </div>

              <div className="actions" style={{ marginTop: "14px" }}>
                <button className="btn btn-secondary" onClick={cerrarModal} disabled={guardando}>
                  Cancelar
                </button>
                <button className="btn btn-success" onClick={guardarConciliacion} disabled={guardando || cortesActivos.length === 0}>
                  {guardando ? "Guardando..." : "Guardar conciliación DCL"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
