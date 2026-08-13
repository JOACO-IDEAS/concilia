// Fase 5.9.1 — búsqueda de un PaymentTransaction real en dev-fixtures cuya
// Organization tenga Unit+UnitOwner+Obligation cargados, para ver si el
// motor podría producir algo mejor que NEEDS_DATA. 100% SOLO LECTURA:
// llama a runMatchingInShadow (puro, nunca escribe) y evaluarPaymentEvidenceScore
// (puro, sin DB) directamente — NUNCA llama a ningún store.guardar(), así
// que no persiste absolutamente nada, ni siquiera en ShadowMatchLog.
import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[buscar-caso-positivo] Conectando a dev-fixtures (${info.host}) — SOLO LECTURA, cero persistencia.`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { runMatchingInShadow } = await import("../../src/lib/reconciliation/match-engine.ts");
const { evaluarPaymentEvidenceScore } = await import("../../src/lib/payment-evidence/evidence-score.ts");

// Organizaciones reales que SÍ tienen unidades cargadas.
const orgsConUnidades = await prisma.organization.findMany({
  where: { units: { some: {} } },
  select: { id: true, name: true, _count: { select: { units: true } } },
});
console.log(`\nOrganizaciones con al menos 1 Unit real: ${orgsConUnidades.length}`);
console.table(orgsConUnidades.map((o) => ({ id: o.id, name: o.name, units: o._count.units })));

// PaymentTransaction reales cuyo organizationId ya resuelto cae en una de esas organizaciones.
const idsOrgsConUnidades = orgsConUnidades.map((o) => o.id);
const pagosCandidatos = await prisma.paymentTransaction.findMany({
  where: { organizationId: { in: idsOrgsConUnidades } },
  select: { id: true, organizationId: true, amount: true, payerIdentifier: true, status: true },
  take: 20,
});
console.log(`\nPaymentTransaction reales cuya organización YA tiene unidades cargadas: ${pagosCandidatos.length}`);

if (pagosCandidatos.length === 0) {
  console.log("\n=> NO EXISTE ningún PaymentTransaction real cuya organización tenga unidades cargadas. No hay caso positivo real disponible sin escribir datos nuevos.");
} else {
  console.log("\nEvaluando cada uno (solo lectura, sin persistir nada)...\n");
  for (const pago of pagosCandidatos) {
    const bank = await runMatchingInShadow(pago.id);
    const assessment = evaluarPaymentEvidenceScore({ bank, whatsapp: null });
    console.log(
      `- ${pago.id} | org=${pago.organizationId} | amount=${pago.amount} | payerIdentifier=${pago.payerIdentifier ?? "null"} | bank.status=${bank.status} (score=${bank.score}) | evidence-score.state=${assessment.state}`
    );
  }
}

await prisma.$disconnect();
console.log("\n[buscar-caso-positivo] Fin — cero escrituras, ni siquiera en ShadowMatchLog (no se llamó a ningún store).");
