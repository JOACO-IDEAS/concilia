import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

// Reproducción de integración para el incidente de Epic 2. Usa sólo un
// grafo sintético identificado y elimina exclusivamente sus IDs conocidos.
// Nunca consulta ni modifica filas ORGANIC.
const RUNS = Number(process.env.EPIC2_P2028_RUNS ?? "3");
const CANDIDATE_COUNT = Number(process.env.EPIC2_P2028_CANDIDATES ?? "3");
const PRISMA_TRANSACTION_TIMEOUT_MS = 5_000;

if (!Number.isInteger(RUNS) || RUNS < 1 || !Number.isInteger(CANDIDATE_COUNT) || CANDIDATE_COUNT < 1) {
  throw new Error("EPIC2_P2028_RUNS and EPIC2_P2028_CANDIDATES must be positive integers.");
}

let fixturePrisma: typeof import("../../src/lib/prisma").prisma;
let ejecutarEvaluacionSombraCompleta: typeof import("../../src/lib/payment-evidence/evidence-score-runner").ejecutarEvaluacionSombraCompleta;
let organizationId: string | undefined;
let paymentTransactionId: string | undefined;
let externalId: string | undefined;

beforeAll(async () => {
  cargarEntornoDeFixturesYVerificar();
  fixturePrisma = (await import("../../src/lib/prisma")).prisma;
  ({ ejecutarEvaluacionSombraCompleta } = await import("../../src/lib/payment-evidence/evidence-score-runner"));

  const suffix = randomBytes(12).toString("hex");
  externalId = `synthetic-epic2-p2028-${suffix}`;
  organizationId = `synthetic-epic2-p2028-org-${suffix}`;
  const units = Array.from({ length: CANDIDATE_COUNT }, (_, index) => ({
    id: `synthetic-epic2-p2028-unit-${suffix}-${index}`,
    code: `${index === 0 ? "P" : `X${index}`}${suffix.slice(0, 6)}`,
  }));

  await fixturePrisma.organization.create({
    data: {
      id: organizationId,
      name: `SYNTHETIC_EPIC2_P2028_${suffix}`,
      legalName: `SYNTHETIC_EPIC2_P2028_${suffix}`,
      taxId: `SYNTHETIC-${suffix}`,
      address: "Synthetic fixture only",
    },
  });
  await fixturePrisma.unit.createMany({ data: units.map((unit) => ({ ...unit, organizationId })) });
  await fixturePrisma.unitOwner.createMany({
    data: units.map((unit, index) => ({
      id: `synthetic-epic2-p2028-owner-${suffix}-${index}`,
      unitId: unit.id,
      fullName: `Synthetic Epic 2 Owner ${index}`,
      taxId: `OWNER-${suffix}-${index}`,
    })),
  });
  await fixturePrisma.obligation.createMany({
    data: units.map((unit, index) => ({
      id: `synthetic-epic2-p2028-obligation-${suffix}-${index}`,
      unitId: unit.id,
      period: new Date("2026-08-01T00:00:00.000Z"),
      amount: "1250.00",
      dueDate: new Date("2026-08-10T00:00:00.000Z"),
      externalRef: `REF-${suffix}-${index}`,
    })),
  });

  const payment = await fixturePrisma.paymentTransaction.create({
    data: {
      externalId,
      provider: "synthetic-epic2-p2028",
      organizationId,
      amount: "1250.00",
      payerIdentifier: `OWNER-${suffix}-0`,
      concept: `Payment P${suffix.slice(0, 6)}`,
      transactionDate: new Date("2026-08-11T00:00:00.000Z"),
      referenceNumber: `REF-${suffix}-0`,
      rawPayload: { fixture: "SYNTHETIC_EPIC2_P2028" },
    },
  });
  paymentTransactionId = payment.id;
}, 30_000);

afterAll(async () => {
  // PaymentTransaction cascades only its own ShadowMatchLog and assessment
  // rows. The Organization cascade then removes only its synthetic Unit tree.
  if (paymentTransactionId) {
    await fixturePrisma.paymentTransaction.delete({ where: { id: paymentTransactionId } }).catch(() => undefined);
  }
  if (organizationId) {
    await fixturePrisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  }
  if (externalId) {
    await expect(fixturePrisma.paymentTransaction.count({ where: { externalId } })).resolves.toBe(0);
  }
  await fixturePrisma.$disconnect();
}, 30_000);

describe("Epic 2 P2028 — evaluation over isolated fixtures", () => {
  it(`persists ${RUNS} assessments for ${CANDIDATE_COUNT} candidates without expiring the matching transaction`, async () => {
    const durations: number[] = [];

    for (let attempt = 0; attempt < RUNS; attempt++) {
      const startedAt = performance.now();
      await ejecutarEvaluacionSombraCompleta(paymentTransactionId!);
      durations.push(performance.now() - startedAt);
    }

    const [assessments, shadow, decisions] = await Promise.all([
      fixturePrisma.paymentEvidenceAssessmentLog.findMany({
        where: { paymentTransactionId },
        orderBy: { createdAt: "asc" },
        select: { id: true, structuredEvidence: true },
      }),
      fixturePrisma.shadowMatchLog.findMany({ where: { paymentTransactionId }, select: { id: true } }),
      fixturePrisma.reconciliationMatch.count({ where: { paymentTransactionId } }),
    ]);

    expect(assessments).toHaveLength(RUNS);
    expect(assessments.every((assessment) => assessment.structuredEvidence !== null)).toBe(true);
    expect(shadow).toHaveLength(1);
    expect(decisions).toBe(0);
    expect(durations.every((duration) => duration < PRISMA_TRANSACTION_TIMEOUT_MS)).toBe(true);
    if (process.env.EPIC2_P2028_REPORT === "1") {
      process.stdout.write(`[epic2-p2028] candidates=${CANDIDATE_COUNT} durations_ms=${durations.map((duration) => Math.round(duration)).join(",")}\n`);
    }
  }, 20_000);
});
