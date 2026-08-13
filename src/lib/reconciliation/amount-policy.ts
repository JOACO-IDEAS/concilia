// Política de tolerancia de importes — APROBADA en
// FASE_3_1_PREPARACION_DE_DATOS.md §4. Nunca colapsa a un genérico "importe
// coincide": cada resultado lleva su categoría explícita. FIFO se usa
// EXCLUSIVAMENTE para desempatar entre obligaciones ya igualmente
// compatibles — nunca decide identidad, nunca cambia la categoría/fuerza
// del resultado (regla aprobada, reafirmada en el pedido de esta fase).

import type { AmountAssessment } from "./types";

/**
 * Tolerancia de redondeo aprobada — $1 ARS, valor absoluto fijo (nunca
 * porcentual: un % sobre un monto grande sería demasiado laxo). Vive como
 * constante de código, no en el schema — ajustable sin migración, mismo
 * criterio ya usado para los umbrales de smart-match.ts.
 */
export const TOLERANCIA_REDONDEO_ARS = 1;

export interface ObligacionCandidata {
  id: string;
  period: Date;
  amount: number;
  paidAmount: number;
}

function formatearPeriodo(period: Date): string {
  return period.toISOString().slice(0, 7);
}

function saldoPendiente(o: ObligacionCandidata): number {
  return o.amount - o.paidAmount;
}

/**
 * Clasifica el importe de un pago contra las obligaciones ABIERTAS
 * (ya filtradas por el llamador a PENDING/PARTIALLY_PAID) de UNA unidad.
 * No decide AGRUPADO — eso requiere comparar contra varias unidades a la
 * vez y se resuelve un nivel más arriba, en deterministic-matcher.ts.
 */
export function clasificarImporte(
  montoTransaccion: number,
  obligacionesAbiertas: ObligacionCandidata[]
): AmountAssessment {
  if (obligacionesAbiertas.length === 0) {
    return {
      category: "SIN_OBLIGACION",
      obligationId: null,
      evidence: "Sin obligación pendiente contra la cual comparar el importe.",
    };
  }

  // FIFO: período más antiguo primero — solo para elegir CUÁL obligación,
  // nunca para decidir SI hay match.
  const ordenadas = [...obligacionesAbiertas].sort((a, b) => a.period.getTime() - b.period.getTime());

  const exacta = ordenadas.find((o) => Math.abs(montoTransaccion - saldoPendiente(o)) < 0.005);
  if (exacta) {
    return {
      category: "EXACTO",
      obligationId: exacta.id,
      evidence: `Importe coincide exactamente con el saldo pendiente de la obligación de ${formatearPeriodo(exacta.period)}.`,
    };
  }

  const conRedondeo = ordenadas.find(
    (o) => Math.abs(montoTransaccion - saldoPendiente(o)) <= TOLERANCIA_REDONDEO_ARS
  );
  if (conRedondeo) {
    const diferencia = Math.abs(montoTransaccion - saldoPendiente(conRedondeo));
    return {
      category: "COMPATIBLE_REDONDEO",
      obligationId: conRedondeo.id,
      evidence: `Importe compatible con el saldo pendiente de ${formatearPeriodo(conRedondeo.period)} — diferencia de $${diferencia.toFixed(2)} por redondeo.`,
    };
  }

  const parcial = ordenadas.find((o) => montoTransaccion > 0 && montoTransaccion < saldoPendiente(o));
  if (parcial) {
    return {
      category: "PARCIAL",
      obligationId: parcial.id,
      evidence: `Pago parcial — abona $${montoTransaccion} de $${saldoPendiente(parcial).toFixed(2)} pendientes de ${formatearPeriodo(parcial.period)}.`,
    };
  }

  // Excedente que cubre exactamente esta obligación + una o más siguientes,
  // en orden FIFO.
  let acumulado = 0;
  const cubiertas: ObligacionCandidata[] = [];
  for (const o of ordenadas) {
    const saldo = saldoPendiente(o);
    if (saldo <= 0) continue;
    acumulado += saldo;
    cubiertas.push(o);
    if (Math.abs(montoTransaccion - acumulado) <= TOLERANCIA_REDONDEO_ARS) {
      return {
        category: "EXCEDENTE",
        obligationId: cubiertas[0].id,
        evidence: `El importe cubre ${cubiertas.length} obligación${cubiertas.length === 1 ? "" : "es"} de la misma unidad (${formatearPeriodo(cubiertas[0].period)} a ${formatearPeriodo(cubiertas[cubiertas.length - 1].period)}).`,
      };
    }
    if (acumulado > montoTransaccion) break;
  }

  return {
    category: "SUPERIOR_SIN_EXPLICAR",
    obligationId: ordenadas[0].id,
    evidence: `Importe $${montoTransaccion} superior a lo esperado, sin combinación de obligaciones abiertas de esta unidad que lo explique.`,
  };
}
