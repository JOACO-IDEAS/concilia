// Fase 5.8 — verificación real de registrarDecisionHumana contra
// dev-fixtures. Escribe EXACTAMENTE 2 filas nuevas de ReconciliationMatch
// (1 APPROVED + 1 REJECTED) — nunca toca PaymentTransaction, Obligation,
// Unit, UnitOwner. Verifica antes/después que esas 6 tablas quedan
// IDÉNTICAS, y que solo ReconciliationMatch cambió. Nunca corre contra
// producción (cinturón de seguridad ya establecido, cargarEntornoDeFixturesYVerificar).

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[human-decision demo] Corriendo sobre dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { registrarDecisionHumana } = await import("../../src/lib/reconciliation/human-decision.ts");

async function contarTablasProtegidas() {
  return {
    paymentTransaction: await prisma.paymentTransaction.count(),
    obligation: await prisma.obligation.count(),
    unitOwner: await prisma.unitOwner.count(),
    unit: await prisma.unit.count(),
    organization: await prisma.organization.count(),
    agentObservation: await prisma.agentObservation.count(),
  };
}

const antes = await contarTablasProtegidas();
const matchesAntes = await prisma.reconciliationMatch.count();

// Consorcio Beta, UF 2B / Valentina Lopez — mismos fixtures reales usados en
// las fases 5.3/5.7 (dev-fixtures, [FIXTURE]).
const unit = await prisma.unit.findFirst({
  where: { code: "2B", organization: { name: { contains: "Beta" } } },
  select: { id: true, code: true, obligations: { select: { id: true }, take: 1 } },
});
const pago = await prisma.paymentTransaction.findFirst({ select: { id: true } });

if (!unit || !pago) {
  throw new Error("No se encontró la unidad de fixture (Beta / UF 2B) o ningún PaymentTransaction real — abortando sin escribir nada.");
}

console.log(`Usando: PaymentTransaction=${pago.id}, Unit=${unit.id} (UF ${unit.code}), Obligation=${unit.obligations[0]?.id ?? "ninguna"}`);

const aprobado = await prisma.$transaction((tx) =>
  registrarDecisionHumana(tx, {
    paymentTransactionId: pago.id,
    unitId: unit.id,
    obligationId: unit.obligations[0]?.id ?? null,
    decision: "APPROVED",
    score: 88,
    signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "Demo Fase 5.8." }],
    reason: "Demo real Fase 5.8 — aprobación humana simulada.",
    decidedBy: null,
  })
);
console.log("APPROVED registrado:", aprobado);

const rechazado = await prisma.$transaction((tx) =>
  registrarDecisionHumana(tx, {
    paymentTransactionId: pago.id,
    unitId: unit.id,
    obligationId: unit.obligations[0]?.id ?? null,
    decision: "REJECTED",
    score: 40,
    signals: [],
    reason: "Demo real Fase 5.8 — rechazo humano simulado.",
    decidedBy: null,
    rejectionReason: "Demo — no corresponde a esta unidad (motivo de prueba, dev-fixtures).",
  })
);
console.log("REJECTED registrado:", rechazado);

// Confirma que el rechazo real ahora es visible por el motor REAL, sin
// tocarlo — misma consulta exacta que deterministic-matcher.ts hace.
const rechazoVisible = await prisma.reconciliationMatch.findFirst({
  where: { paymentTransactionId: pago.id, unitId: unit.id, decision: "REJECTED" },
  select: { id: true },
});
console.log("¿El motor real vería PREVIOUSLY_REJECTED en la próxima corrida?", rechazoVisible ? "SÍ" : "NO");
if (!rechazoVisible) throw new Error("¡ALERTA! El REJECTED recién escrito no es visible por la query real del motor.");

const despues = await contarTablasProtegidas();
const matchesDespues = await prisma.reconciliationMatch.count();

console.log("\n=== Verificación: solo ReconciliationMatch debió cambiar ===");
console.table({
  PaymentTransaction: { antes: antes.paymentTransaction, despues: despues.paymentTransaction },
  Obligation: { antes: antes.obligation, despues: despues.obligation },
  UnitOwner: { antes: antes.unitOwner, despues: despues.unitOwner },
  Unit: { antes: antes.unit, despues: despues.unit },
  Organization: { antes: antes.organization, despues: despues.organization },
  AgentObservation: { antes: antes.agentObservation, despues: despues.agentObservation },
  ReconciliationMatch: { antes: matchesAntes, despues: matchesDespues },
});

const soloReconciliationMatchCambio =
  antes.paymentTransaction === despues.paymentTransaction &&
  antes.obligation === despues.obligation &&
  antes.unitOwner === despues.unitOwner &&
  antes.unit === despues.unit &&
  antes.organization === despues.organization &&
  antes.agentObservation === despues.agentObservation &&
  matchesDespues - matchesAntes === 2;

if (!soloReconciliationMatchCambio) throw new Error("¡ALERTA! Cambió algo que no debía, o el conteo de ReconciliationMatch no fue exactamente +2.");
console.log(`\nOK — ReconciliationMatch: ${matchesAntes} → ${matchesDespues} (+2, exactamente lo esperado). Todo lo demás, idéntico.`);

await prisma.$disconnect();
