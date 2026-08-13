// Fase 5.3 — demo end-to-end del Payment Evidence Loop contra dev-fixtures
// REAL (Consorcio Beta: UF 2B = Valentina Lopez, UF 1A = Ana Diaz, ambas con
// obligación de $100.000 — mismo importe, a propósito, para el escenario de
// ambigüedad). Ningún comprobante de WhatsApp real — todos simulados (ver
// FASE_5_3_DISENO.md Parte 1, punto 10: no se conecta a ningún WhatsApp ni
// OCR real esta fase). Escribe únicamente PaymentNotice + AgentObservation,
// nunca PaymentTransaction/Obligation/ReconciliationMatch/UnitOwner/Unit.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[demo-whatsapp-evidence] Corriendo sobre dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { ingestarComprobanteWhatsApp } = await import("../../src/lib/payment-evidence/ingest-whatsapp-evidence.ts");

const TELEFONO_VALENTINA_UF2B = "5491100000015"; // real, dev-fixtures, [FIXTURE] Consorcio Beta
const TELEFONO_DESCONOCIDO = "5491100099999"; // no registrado en ningún UnitOwner
const CUIT_ANA_UF1A = "20-99910101-1"; // real, titular de UF 1A (Beta)
const CUIT_VALENTINA_UF2B = "20-99910203-1"; // real, titular de UF 2B (Beta)

async function contarTablasNoTocables() {
  return {
    paymentTransaction: await prisma.paymentTransaction.count(),
    obligation: await prisma.obligation.count(),
    unitOwner: await prisma.unitOwner.count(),
    unit: await prisma.unit.count(),
    reconciliationMatch: await prisma.reconciliationMatch.count(),
    organization: await prisma.organization.count(),
  };
}

const antes = await contarTablasNoTocables();
const noticesAntes = await prisma.paymentNotice.count();
const obsAntes = await prisma.agentObservation.count();

function comprobante(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    amount: null,
    currency: "ARS",
    payerName: null,
    payerIdentifier: null,
    transactionDate: null,
    referenceNumber: null,
    bankOrigin: null,
    confidenceExtraccion: null,
    ...overrides,
  };
}

let n = 0;
function mensaje(phone: string, overrides: Partial<Record<string, unknown>> = {}) {
  n++;
  return {
    externalMessageId: `demo-fase53:${n}`,
    phone,
    receivedAt: new Date().toISOString(),
    messageType: "image" as const,
    attachmentUrl: `https://example.com/comprobante-${n}.jpg`,
    rawText: null,
    ...overrides,
  };
}

async function correr(titulo: string, phone: string, c: ReturnType<typeof comprobante>) {
  console.log(`\n=== ${titulo} ===`);
  const r = await prisma.$transaction((tx) => ingestarComprobanteWhatsApp(tx, mensaje(phone), c));
  console.log("resolucionTelefono:", r.resultado.resolucionTelefono.case, "-", r.resultado.resolucionTelefono.evidence);
  console.log("organizationId:", r.resultado.organizationId);
  console.log("estado:", r.resultado.estado);
  console.log("candidatoPropuesto:", r.resultado.candidatoPropuesto ? `UF ${r.resultado.candidatoPropuesto.unitCode} (score ${r.resultado.candidatoPropuesto.score})` : null);
  console.log("blockers:", r.resultado.blockers.map((b) => `${b.type}: ${b.evidence}`));
  console.log("explicacion:", r.resultado.explicacion);
  console.log("observacionGenerada:", r.observacionGenerada, "| PaymentNotice:", r.paymentNoticeId);
  return r;
}

// 1-6: teléfono registrado, comprobante compatible → CANDIDATE.
await correr(
  "1-6. Valentina envía comprobante desde su teléfono registrado (UF 2B)",
  TELEFONO_VALENTINA_UF2B,
  comprobante({ amount: 100000, payerIdentifier: CUIT_VALENTINA_UF2B, payerName: "Valentina Lopez", referenceNumber: "OP-DEMO-001" })
);

// 7. teléfono desconocido, sin CUIT.
await correr("7. Comprobante desde teléfono desconocido, sin CUIT", TELEFONO_DESCONOCIDO, comprobante({ amount: 100000 }));

// 8. CUIT coincidente (teléfono desconocido, pero el CUIT resuelve la organización).
await correr(
  "8. Teléfono desconocido, pero CUIT coincide con Ana Diaz (UF 1A)",
  TELEFONO_DESCONOCIDO,
  comprobante({ amount: 100000, payerIdentifier: CUIT_ANA_UF1A })
);

// 9. CUIT contradictorio: teléfono de Valentina (UF 2B), CUIT de Ana (UF 1A).
await correr(
  "9. Teléfono de Valentina (UF 2B), pero CUIT del comprobante es el de Ana (UF 1A)",
  TELEFONO_VALENTINA_UF2B,
  comprobante({ amount: 100000, payerIdentifier: CUIT_ANA_UF1A })
);

// 10. Dos obligaciones con el mismo importe, sin CUIT que desempate.
await correr(
  "10. Teléfono de Valentina (UF 2B), sin CUIT, importe coincide con UF 1A Y UF 2B",
  TELEFONO_VALENTINA_UF2B,
  comprobante({ amount: 100000 })
);

const despues = await contarTablasNoTocables();
const noticesDespues = await prisma.paymentNotice.count();
const obsDespues = await prisma.agentObservation.count();

console.log("\n=== Verificación: SOLO PaymentNotice/AgentObservation debieron cambiar ===");
console.table({
  PaymentTransaction: { antes: antes.paymentTransaction, despues: despues.paymentTransaction },
  Obligation: { antes: antes.obligation, despues: despues.obligation },
  UnitOwner: { antes: antes.unitOwner, despues: despues.unitOwner },
  Unit: { antes: antes.unit, despues: despues.unit },
  ReconciliationMatch: { antes: antes.reconciliationMatch, despues: despues.reconciliationMatch },
  Organization: { antes: antes.organization, despues: despues.organization },
  PaymentNotice: { antes: noticesAntes, despues: noticesDespues },
  AgentObservation: { antes: obsAntes, despues: obsDespues },
});

const soloEvidenciaCambio =
  antes.paymentTransaction === despues.paymentTransaction &&
  antes.obligation === despues.obligation &&
  antes.unitOwner === despues.unitOwner &&
  antes.unit === despues.unit &&
  antes.reconciliationMatch === despues.reconciliationMatch &&
  antes.organization === despues.organization;

if (!soloEvidenciaCambio) throw new Error("¡ALERTA! Alguna tabla que debía permanecer intacta cambió.");
console.log(`\nOK — PaymentNotice: ${noticesAntes} → ${noticesDespues} | AgentObservation: ${obsAntes} → ${obsDespues}`);

await prisma.$disconnect();
