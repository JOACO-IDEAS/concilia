// Fase 3.7 — Parte 7: informe de validación. Solo lectura — no escribe
// nada. Compara, por escenario, el resultado esperado (fixtures-data.mts)
// contra el resultado real persistido en ShadowMatchLog, y arma las
// métricas globales + los "casos interesantes" pedidos (Parte 7 B/C).

import { cargarEntornoDeFixturesYVerificar } from "./lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[report] Leyendo dev-fixtures (${info.host}).`);

const { PREFIJO_EXTERNAL_ID, ESCENARIOS } = await import("./fixtures-data.mts");
const { prisma } = await import("../../src/lib/prisma.ts");
const { calcularMetricas } = await import("../../src/lib/reconciliation/observability.ts");

const pagos = await prisma.paymentTransaction.findMany({
  where: { externalId: { startsWith: PREFIJO_EXTERNAL_ID } },
  select: { id: true, externalId: true },
});
const idPorEscenario = new Map(pagos.map((p) => [p.externalId.replace(PREFIJO_EXTERNAL_ID, ""), p.id]));

const registros = await prisma.shadowMatchLog.findMany({
  where: { paymentTransactionId: { in: pagos.map((p) => p.id) } },
});
const registroPorPago = new Map(registros.map((r) => [r.paymentTransactionId, r]));

console.log("\n================ A. Por escenario: esperado vs. obtenido ================\n");

let coincidencias = 0;
for (const escenario of ESCENARIOS) {
  const paymentId = idPorEscenario.get(escenario.id);
  const registro = paymentId ? registroPorPago.get(paymentId) : undefined;

  console.log(`--- ${escenario.id} ---`);
  console.log(`Descripción: ${escenario.descripcion}`);
  if (!registro) {
    console.log("SIN RESULTADO SHADOW — no se encontró ShadowMatchLog para este pago.\n");
    continue;
  }

  const bloqueosObtenidos = (registro.blockers as { type: string; evidence: string }[]).map((b) => b.type);
  const statusOk = registro.status === escenario.resultadoEsperado;
  const bloqueosOk =
    escenario.bloqueosEsperados.length === 0
      ? bloqueosObtenidos.length === 0 || bloqueosObtenidos.every((b) => !escenario.bloqueosEsperados.includes(b)) === false
      : escenario.bloqueosEsperados.every((b) => bloqueosObtenidos.includes(b));
  const ok = statusOk && (escenario.bloqueosEsperados.length === 0 ? true : bloqueosOk);
  if (ok) coincidencias++;

  console.log(`Esperado: ${escenario.resultadoEsperado}${escenario.bloqueosEsperados.length ? ` [${escenario.bloqueosEsperados.join(", ")}]` : ""}`);
  console.log(`Obtenido: ${registro.status}${bloqueosObtenidos.length ? ` [${bloqueosObtenidos.join(", ")}]` : ""}  ${ok ? "✓ COINCIDE" : "✗ DIFERENTE"}`);
  console.log(`Score: ${registro.score}  Tier: ${registro.tier ?? "—"}  engineVersion: ${registro.engineVersion}`);
  console.log(`Señales matched: ${(registro.signals as { signal: string; matched: boolean }[]).filter((s) => s.matched).map((s) => s.signal).join(", ") || "(ninguna)"}`);
  console.log(`Explicación:\n${registro.explanation}`);
  console.log(`Nota de diseño: ${escenario.notaEsperada}\n`);
}

console.log(`Resumen A: ${coincidencias}/${ESCENARIOS.length} escenarios coinciden exactamente con lo esperado.\n`);

console.log("================ B. Métricas globales ================\n");
const metricas = calcularMetricas(registros.map((r) => ({
  paymentTransactionId: r.paymentTransactionId,
  candidateUnitId: r.candidateUnitId,
  candidateUnitOwnerId: r.candidateUnitOwnerId,
  candidateObligationId: r.candidateObligationId,
  score: r.score,
  tier: r.tier as 1 | 2 | 3 | 4 | null,
  status: r.status as "CANDIDATE" | "AMBIGUOUS" | "BLOCKED",
  signals: r.signals as never,
  blockers: r.blockers as never,
  explanation: r.explanation,
  engineVersion: r.engineVersion,
  evaluatedAt: r.evaluatedAt.toISOString(),
})));
console.log(JSON.stringify(metricas, null, 2));

console.log("\n================ C. Casos interesantes ================\n");
for (const r of registros) {
  const bloqueos = (r.blockers as { type: string; evidence: string }[]).map((b) => b.type);
  if (r.status === "CANDIDATE" && r.score >= 60) {
    console.log(`[Candidato claro] pago=${r.paymentTransactionId} score=${r.score} — gana sin ambigüedad.`);
  }
  if (r.status === "AMBIGUOUS") {
    console.log(`[Ambigüedad] pago=${r.paymentTransactionId} score=${r.score} — ${bloqueos.join(", ")}.`);
  }
  if (r.status === "BLOCKED" && bloqueos.length > 0 && r.score >= 60) {
    console.log(`[Score alto pero BLOCKED] pago=${r.paymentTransactionId} score=${r.score} — ${bloqueos.join(", ")}. Ver escenario #9.`);
  }
  if (r.status === "BLOCKED" && bloqueos.includes("INSUFFICIENT_EVIDENCE")) {
    console.log(`[Evidencia insuficiente] pago=${r.paymentTransactionId} score=${r.score}.`);
  }
  if (r.status === "BLOCKED" && (bloqueos.includes("UNIT_CODE_AMBIGUOUS") || bloqueos.includes("CUIT_CONTRADICTORY"))) {
    console.log(`[Bloqueo duro] pago=${r.paymentTransactionId} — ${bloqueos.join(", ")}.`);
  }
}

await prisma.$disconnect();
