"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import type {
  ActividadReciente,
  Consorcio,
  MovimientoCuenta,
  ReglaConciliacion,
  TransaccionBancaria,
  UnidadFuncional,
} from "./types";

interface AppState {
  consorcios: Consorcio[];
  unidades: UnidadFuncional[];
  transacciones: TransaccionBancaria[];
  reglas: ReglaConciliacion[];
  actividad: ActividadReciente[];
}

type Action =
  | { type: "APROBAR_TRANSACCION"; transaccionId: string }
  | {
      type: "VINCULAR_TRANSACCION";
      transaccionId: string;
      unidadId: string;
      confianza: number;
      motivo: string;
    }
  | { type: "DESCARTAR_TRANSACCION"; transaccionId: string }
  | { type: "CREAR_REGLA"; nombre: string; patron: string; unidadId: string }
  | { type: "REGISTRAR_PAGO_MANUAL"; unidadId: string; monto: number; medio: string; fecha: string }
  | {
      type: "AGREGAR_NOTA";
      unidadId: string;
      tipo: "nota_credito" | "nota_debito";
      monto: number;
      concepto: string;
    }
  | { type: "ENVIAR_RECORDATORIOS"; unidadIds: string[]; canal: "whatsapp" | "email" };

let seq = 0;
function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

function nowIso() {
  return new Date().toISOString();
}

function aplicarPago(
  unidad: UnidadFuncional,
  monto: number,
  fecha: string,
  concepto: string,
  referenciaTransaccionId?: string
): UnidadFuncional {
  const nuevoSaldo = Math.max(0, Math.round((unidad.saldoPendiente - monto) * 100) / 100);
  const pagoCompleto = nuevoSaldo === 0;
  const movimiento: MovimientoCuenta = {
    id: nextId("mov"),
    unidadId: unidad.id,
    fecha,
    tipo: "pago",
    concepto,
    monto: -monto,
    referenciaTransaccionId,
  };
  return {
    ...unidad,
    saldoPendiente: nuevoSaldo,
    estado: pagoCompleto ? "pagado" : unidad.estado,
    diasAtraso: pagoCompleto ? 0 : unidad.diasAtraso,
    interesAcumulado: pagoCompleto ? 0 : unidad.interesAcumulado,
    ultimoPago: fecha,
    movimientos: [...unidad.movimientos, movimiento],
  };
}

function recalcularConsorcios(consorcios: Consorcio[], unidades: UnidadFuncional[]): Consorcio[] {
  return consorcios.map((consorcio) => {
    const propias = unidades.filter((u) => u.consorcioId === consorcio.id);
    const efectiva = propias.reduce(
      (sum, u) => sum + (u.expensaMensual - (u.estado === "pagado" ? 0 : u.saldoPendiente)),
      0
    );
    const pct =
      consorcio.recaudacionEsperada > 0
        ? Math.round((efectiva / consorcio.recaudacionEsperada) * 100)
        : 0;
    return {
      ...consorcio,
      recaudacionEfectiva: Math.max(0, efectiva),
      estado: pct >= 90 ? "al-dia" : pct >= 75 ? "con-demoras" : "critico",
    };
  });
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "APROBAR_TRANSACCION": {
      const tx = state.transacciones.find((t) => t.id === action.transaccionId);
      if (!tx || tx.aprobado || !tx.unidadSugeridaId) return state;
      const unidad = state.unidades.find((u) => u.id === tx.unidadSugeridaId);
      if (!unidad) return state;

      const unidadActualizada = aplicarPago(
        unidad,
        tx.monto,
        tx.fecha,
        `Pago conciliado — ${tx.banco}`,
        tx.id
      );

      const unidades = state.unidades.map((u) => (u.id === unidad.id ? unidadActualizada : u));
      const transacciones = state.transacciones.map((t) =>
        t.id === tx.id ? { ...t, aprobado: true } : t
      );
      const actividad: ActividadReciente = {
        id: nextId("act"),
        tipo: "pago",
        descripcion: `${unidad.titular} (${unidad.unidad}) conciliado — $${tx.monto.toLocaleString("es-AR")}`,
        fecha: nowIso(),
        consorcioId: unidad.consorcioId,
      };

      return {
        ...state,
        unidades,
        transacciones,
        consorcios: recalcularConsorcios(state.consorcios, unidades),
        actividad: [actividad, ...state.actividad],
      };
    }

    case "VINCULAR_TRANSACCION": {
      const unidad = state.unidades.find((u) => u.id === action.unidadId);
      if (!unidad) return state;
      const transacciones = state.transacciones.map((t) =>
        t.id === action.transaccionId
          ? {
              ...t,
              unidadSugeridaId: action.unidadId,
              consorcioId: unidad.consorcioId,
              confianza: action.confianza,
              estadoMatch: "revision" as const,
              motivoAlerta: `Vinculado manualmente: ${action.motivo}. Pendiente de aprobación.`,
            }
          : t
      );
      return { ...state, transacciones };
    }

    case "DESCARTAR_TRANSACCION": {
      const transacciones = state.transacciones.map((t) =>
        t.id === action.transaccionId ? { ...t, descartada: true } : t
      );
      return { ...state, transacciones };
    }

    case "CREAR_REGLA": {
      const unidad = state.unidades.find((u) => u.id === action.unidadId);
      if (!unidad) return state;
      const patronLower = action.patron.toLowerCase();
      const reglaId = nextId("regla");
      const idsAfectados: string[] = [];

      const transacciones = state.transacciones.map((t) => {
        if (t.aprobado || t.descartada) return t;
        if (!t.descripcionCruda.toLowerCase().includes(patronLower)) return t;
        idsAfectados.push(t.id);
        return {
          ...t,
          unidadSugeridaId: action.unidadId,
          consorcioId: unidad.consorcioId,
          confianza: 97,
          estadoMatch: "auto" as const,
          motivoAlerta: undefined,
          sugerenciasAlternativas: undefined,
          reglaAplicadaId: reglaId,
        };
      });

      const regla: ReglaConciliacion = {
        id: reglaId,
        nombre: action.nombre,
        patron: action.patron,
        unidadId: action.unidadId,
        creadaEl: nowIso(),
        vecesAplicada: idsAfectados.length,
      };

      const actividad: ActividadReciente = {
        id: nextId("act"),
        tipo: "regla",
        descripcion: `Regla "${action.nombre}" creada — aplicada automáticamente a ${idsAfectados.length} transacción(es)`,
        fecha: nowIso(),
      };

      return {
        ...state,
        transacciones,
        reglas: [regla, ...state.reglas],
        actividad: [actividad, ...state.actividad],
      };
    }

    case "REGISTRAR_PAGO_MANUAL": {
      const unidad = state.unidades.find((u) => u.id === action.unidadId);
      if (!unidad) return state;
      const unidadActualizada = aplicarPago(
        unidad,
        action.monto,
        action.fecha,
        `Pago manual registrado — ${action.medio}`
      );
      const unidades = state.unidades.map((u) => (u.id === unidad.id ? unidadActualizada : u));
      const actividad: ActividadReciente = {
        id: nextId("act"),
        tipo: "pago",
        descripcion: `Pago manual registrado para ${unidad.titular} (${unidad.unidad}) — $${action.monto.toLocaleString("es-AR")}`,
        fecha: nowIso(),
        consorcioId: unidad.consorcioId,
      };
      return {
        ...state,
        unidades,
        consorcios: recalcularConsorcios(state.consorcios, unidades),
        actividad: [actividad, ...state.actividad],
      };
    }

    case "AGREGAR_NOTA": {
      const unidad = state.unidades.find((u) => u.id === action.unidadId);
      if (!unidad) return state;
      const esCredito = action.tipo === "nota_credito";
      const delta = esCredito ? -action.monto : action.monto;
      const nuevoSaldo = Math.max(0, unidad.saldoPendiente + delta);
      const movimiento: MovimientoCuenta = {
        id: nextId("mov"),
        unidadId: unidad.id,
        fecha: nowIso().slice(0, 10),
        tipo: action.tipo,
        concepto: action.concepto,
        monto: delta,
      };
      const unidadActualizada: UnidadFuncional = {
        ...unidad,
        saldoPendiente: nuevoSaldo,
        estado: nuevoSaldo === 0 ? "pagado" : unidad.estado === "pagado" ? "pendiente" : unidad.estado,
        movimientos: [...unidad.movimientos, movimiento],
      };
      const unidades = state.unidades.map((u) => (u.id === unidad.id ? unidadActualizada : u));
      const actividad: ActividadReciente = {
        id: nextId("act"),
        tipo: "conciliacion",
        descripcion: `${esCredito ? "Nota de crédito" : "Nota de débito"} registrada para ${unidad.titular} (${unidad.unidad}) — $${action.monto.toLocaleString("es-AR")}`,
        fecha: nowIso(),
        consorcioId: unidad.consorcioId,
      };
      return {
        ...state,
        unidades,
        consorcios: recalcularConsorcios(state.consorcios, unidades),
        actividad: [actividad, ...state.actividad],
      };
    }

    case "ENVIAR_RECORDATORIOS": {
      const idsSeleccionados = new Set(action.unidadIds);
      const fecha = nowIso();
      const unidades = state.unidades.map((u) =>
        idsSeleccionados.has(u.id) ? { ...u, ultimoRecordatorio: { fecha, canal: action.canal } } : u
      );
      const nombres = state.unidades
        .filter((u) => idsSeleccionados.has(u.id))
        .map((u) => `${u.titular} (${u.unidad})`);
      const canalLabel = action.canal === "whatsapp" ? "WhatsApp" : "email";
      const descripcion =
        action.unidadIds.length === 1
          ? `Recordatorio por ${canalLabel} enviado a ${nombres[0]}`
          : `Recordatorios por ${canalLabel} enviados a ${action.unidadIds.length} unidades`;
      const actividad: ActividadReciente = {
        id: nextId("act"),
        tipo: "recordatorio",
        descripcion,
        fecha,
      };
      return { ...state, unidades, actividad: [actividad, ...state.actividad] };
    }

    default:
      return state;
  }
}

interface AppStoreValue {
  state: AppState;
  aprobarTransaccion: (transaccionId: string) => void;
  vincularTransaccion: (
    transaccionId: string,
    unidadId: string,
    confianza: number,
    motivo: string
  ) => void;
  descartarTransaccion: (transaccionId: string) => void;
  crearRegla: (nombre: string, patron: string, unidadId: string) => void;
  registrarPagoManual: (unidadId: string, monto: number, medio: string, fecha: string) => void;
  agregarNota: (
    unidadId: string,
    tipo: "nota_credito" | "nota_debito",
    monto: number,
    concepto: string
  ) => void;
  enviarRecordatorios: (unidadIds: string[], canal: "whatsapp" | "email") => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

/**
 * El store de interfaz nunca puede inicializarse con fixtures como si fueran
 * datos de la organización autenticada. Hasta que cada superficie consuma su
 * contrato tenant-scoped real, parte de un estado operativo honestamente vacío.
 */
export function createEmptyAppState(): AppState {
  return {
    consorcios: [],
    unidades: [],
    transacciones: [],
    reglas: [],
    actividad: [],
  };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createEmptyAppState);

  const value = useMemo<AppStoreValue>(
    () => ({
      state,
      aprobarTransaccion: (transaccionId) => dispatch({ type: "APROBAR_TRANSACCION", transaccionId }),
      vincularTransaccion: (transaccionId, unidadId, confianza, motivo) =>
        dispatch({ type: "VINCULAR_TRANSACCION", transaccionId, unidadId, confianza, motivo }),
      descartarTransaccion: (transaccionId) =>
        dispatch({ type: "DESCARTAR_TRANSACCION", transaccionId }),
      crearRegla: (nombre, patron, unidadId) =>
        dispatch({ type: "CREAR_REGLA", nombre, patron, unidadId }),
      registrarPagoManual: (unidadId, monto, medio, fecha) =>
        dispatch({ type: "REGISTRAR_PAGO_MANUAL", unidadId, monto, medio, fecha }),
      agregarNota: (unidadId, tipo, monto, concepto) =>
        dispatch({ type: "AGREGAR_NOTA", unidadId, tipo, monto, concepto }),
      enviarRecordatorios: (unidadIds, canal) =>
        dispatch({ type: "ENVIAR_RECORDATORIOS", unidadIds, canal }),
    }),
    [state]
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore debe usarse dentro de <AppStoreProvider>");
  return ctx;
}
