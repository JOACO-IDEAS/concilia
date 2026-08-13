import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShadowMatchResult } from "@/lib/reconciliation/types";

// Fase 5.9/5.9.1 — ejecutarEvaluacionSombraCompleta, probado con
// runMatchingInShadow MOCKEADO (nunca corre el motor real acá) y con los
// DOS stores inyectados como InMemory — nunca contra Neon.

const { mockRunMatchingInShadow } = vi.hoisted(() => ({ mockRunMatchingInShadow: vi.fn() }));
vi.mock("@/lib/reconciliation/match-engine", () => ({ runMatchingInShadow: mockRunMatchingInShadow }));

const { ejecutarEvaluacionSombraCompleta } = await import("./evidence-score-runner");
const { InMemoryShadowResultStore } = await import("@/lib/reconciliation/shadow-store");
const { InMemoryPaymentEvidenceAssessmentStore } = await import("./evidence-score-store");

function shadowResult(overrides: Partial<ShadowMatchResult> = {}): ShadowMatchResult {
  return {
    paymentTransactionId: "pt-1",
    candidateUnitId: "unit-1",
    candidateUnitOwnerId: "owner-1",
    candidateObligationId: "obl-1",
    score: 85,
    tier: 1,
    status: "CANDIDATE",
    signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "CUIT coincide." }],
    blockers: [],
    explanation: "✓ CUIT coincide.",
    engineVersion: "3.9.0",
    evaluatedAt: "2026-08-11T12:00:00.000Z",
    topCandidateScore: 85,
    topCandidateTier: 1,
    topCandidates: [{ unitCode: "UF 2B", score: 85, tier: 1, matchedSignals: ["CUIT_EXACT"] }],
    ...overrides,
  };
}

let shadowStore: InstanceType<typeof InMemoryShadowResultStore>;
let evidenceStore: InstanceType<typeof InMemoryPaymentEvidenceAssessmentStore>;

beforeEach(() => {
  vi.clearAllMocks();
  shadowStore = new InMemoryShadowResultStore();
  evidenceStore = new InMemoryPaymentEvidenceAssessmentStore();
});

describe("Camino feliz — ambas persistencias ocurren, una sola corrida del motor", () => {
  it("corre runMatchingInShadow UNA sola vez y persiste en ambos stores", async () => {
    mockRunMatchingInShadow.mockResolvedValue(shadowResult());

    await ejecutarEvaluacionSombraCompleta("pt-1", { shadowStore, evidenceStore });

    expect(mockRunMatchingInShadow).toHaveBeenCalledTimes(1);
    expect(mockRunMatchingInShadow).toHaveBeenCalledWith("pt-1", undefined);

    const shadow = await shadowStore.obtener("pt-1", "3.9.0");
    expect(shadow?.candidateUnitId).toBe("unit-1");

    const evidencia = await evidenceStore.obtenerUltima("pt-1", "5.7.0");
    expect(evidencia).not.toBeNull();
    expect(evidencia?.paymentTransactionId).toBe("pt-1");
    expect(evidencia?.state).toBe("PRE_CONCILIABLE"); // 1 sola familia (BANK_MOVEMENT), sin WhatsApp
  });

  it("structuredEvidence.bank refleja exactamente signals/blockers/topCandidates del ShadowMatchResult", async () => {
    const resultado = shadowResult({ blockers: [{ type: "INSUFFICIENT_EVIDENCE", evidence: "x" }] });
    mockRunMatchingInShadow.mockResolvedValue(resultado);
    await ejecutarEvaluacionSombraCompleta("pt-1", { shadowStore, evidenceStore });

    const evidencia = await evidenceStore.obtenerUltima("pt-1", "5.7.0");
    expect(evidencia?.structuredEvidence?.bank?.signals).toEqual(resultado.signals);
    expect(evidencia?.structuredEvidence?.bank?.blockers).toEqual(resultado.blockers);
    expect(evidencia?.structuredEvidence?.bank?.topCandidates).toEqual(resultado.topCandidates);
  });

  // #L — WhatsApp inbound sigue sin existir.
  it("#L structuredEvidence.whatsapp siempre null — no existe correlator ni WhatsApp inbound real", async () => {
    mockRunMatchingInShadow.mockResolvedValue(shadowResult());
    await ejecutarEvaluacionSombraCompleta("pt-1", { shadowStore, evidenceStore });
    const evidencia = await evidenceStore.obtenerUltima("pt-1", "5.7.0");
    expect(evidencia?.structuredEvidence?.whatsapp).toBeNull();
    const whatsappFamilia = evidencia?.families.find((f) => f.family === "WHATSAPP_MESSAGE");
    expect(whatsappFamilia?.nature).toBe("MISSING");
  });
});

describe("Reevaluación del mismo pago — historial, no reemplazo", () => {
  it("correr el orquestador dos veces sobre el mismo pago crea DOS eventos históricos en evidenceStore", async () => {
    mockRunMatchingInShadow.mockResolvedValue(shadowResult({ score: 40, status: "CANDIDATE" }));
    await ejecutarEvaluacionSombraCompleta("pt-1", { shadowStore, evidenceStore });

    mockRunMatchingInShadow.mockResolvedValue(shadowResult({ score: 95, status: "CANDIDATE" }));
    await ejecutarEvaluacionSombraCompleta("pt-1", { shadowStore, evidenceStore });

    const historial = await evidenceStore.listarHistorialPorPago("pt-1");
    expect(historial).toHaveLength(2);
    expect(historial[0].families.find((f) => f.family === "BANK_MOVEMENT")?.score).toBe(40);
    expect(historial[1].families.find((f) => f.family === "BANK_MOVEMENT")?.score).toBe(95);
  });
});

describe("PaymentTransaction inexistente", () => {
  it("si runMatchingInShadow lanza (payment no existe), el runner lo atrapa, no lanza, y NO persiste nada en ningún store", async () => {
    mockRunMatchingInShadow.mockRejectedValue(new Error("No existe ningún PaymentTransaction con id pt-fantasma."));

    await expect(ejecutarEvaluacionSombraCompleta("pt-fantasma", { shadowStore, evidenceStore })).resolves.toBeUndefined();

    expect(await shadowStore.listarPorPago("pt-fantasma")).toHaveLength(0);
    expect(await evidenceStore.listarHistorialPorPago("pt-fantasma")).toHaveLength(0);
  });
});

describe("Fallo de persistencia (evaluación no se puede guardar)", () => {
  it("si falla SOLO el store de evidence-score, el runner no lanza y el ShadowMatchLog igual quedó guardado", async () => {
    mockRunMatchingInShadow.mockResolvedValue(shadowResult());
    const evidenceStoreQueFalla = { guardar: vi.fn().mockRejectedValue(new Error("constraint violado")), obtenerUltima: vi.fn(), listarHistorialPorPago: vi.fn(), listar: vi.fn() };

    await expect(
      ejecutarEvaluacionSombraCompleta("pt-1", { shadowStore, evidenceStore: evidenceStoreQueFalla })
    ).resolves.toBeUndefined();

    const shadow = await shadowStore.obtener("pt-1", "3.9.0");
    expect(shadow).not.toBeNull();
  });

  it("si falla SOLO el store de ShadowMatchLog, el runner igual intenta persistir evidence-score", async () => {
    mockRunMatchingInShadow.mockResolvedValue(shadowResult());
    const shadowStoreQueFalla = { guardar: vi.fn().mockRejectedValue(new Error("fallo de red")), obtener: vi.fn(), listarPorPago: vi.fn(), listar: vi.fn() };

    await expect(
      ejecutarEvaluacionSombraCompleta("pt-1", { shadowStore: shadowStoreQueFalla, evidenceStore })
    ).resolves.toBeUndefined();

    const evidencia = await evidenceStore.obtenerUltima("pt-1", "5.7.0");
    expect(evidencia).not.toBeNull();
  });

  it("nunca lanza, sin importar qué falle", async () => {
    mockRunMatchingInShadow.mockRejectedValue(new Error("cualquier error del motor"));
    await expect(ejecutarEvaluacionSombraCompleta("pt-x", { shadowStore, evidenceStore })).resolves.not.toThrow();
  });
});

// #K reforzado a nivel orquestador — el runner solo importa match-engine
// (mockeado acá) y los dos stores (inyectables) — no existe ningún import
// de ReconciliationMatch/Obligation/Unit/UnitOwner en todo el módulo.
describe("#K AUTO imposible a nivel orquestador", () => {
  it("un resultado CANDIDATE de alta confianza no crea ninguna ReconciliationMatch ni modifica nada más allá de los dos stores inyectados", async () => {
    mockRunMatchingInShadow.mockResolvedValue(shadowResult({ score: 99, tier: 1 }));
    await ejecutarEvaluacionSombraCompleta("pt-1", { shadowStore, evidenceStore });
    expect(await shadowStore.listarPorPago("pt-1")).toHaveLength(1);
    expect(await evidenceStore.listarHistorialPorPago("pt-1")).toHaveLength(1);
  });
});
