import { describe, expect, it } from "vitest";
import type { CandidateEntry } from "@/lib/reconciliation/deterministic-matcher";
import { resolveUnknownPayer, type HistoricalUnitMemory, type UnknownPayerResolutionInput } from "./unknown-payer-resolution";

function candidate(unitId: string, score: number, overrides: Partial<CandidateEntry> = {}): CandidateEntry {
  return {
    unitId, unitCode: unitId.toUpperCase(), unitOwnerId: null, ownerFullName: null,
    obligationId: `ob-${unitId}`, score, tier: 2, blockers: [], wouldQualifyForAuto: false,
    signals: [{ signal: "AMOUNT_MATCH", tier: 2, matched: true, strength: "STRONG", evidence: `Importe exacto para ${unitId}.` }],
    ...overrides,
  };
}

function memory(unitId: string, overrides: Partial<HistoricalUnitMemory> = {}): HistoricalUnitMemory {
  return { organizationId: "org-1", unitId, payerId: null, signalId: "signal-1", status: "OBSERVED", supportCount: 5, contradictionCount: 0, ...overrides };
}

function input(overrides: Partial<UnknownPayerResolutionInput> = {}): UnknownPayerResolutionInput {
  return { organizationId: "org-1", payerId: null, signalId: "signal-1", hasDurableCorrelation: true, candidates: [candidate("2a", 90)], memory: [], ...overrides };
}

describe("resolveUnknownPayer", () => {
  it("es determinístico y propone monto exacto de pagador nuevo con confirmación", () => {
    const value = input();
    expect(resolveUnknownPayer(value)).toEqual(resolveUnknownPayer(value));
    const result = resolveUnknownPayer(value);
    expect(result).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: true, primaryCandidate: { unitId: "2a", financialScore: 90, identityMemoryScore: 0 } });
    expect(result.explanation).toContain("Importe exacto para 2a.");
  });

  it("preserva ambigüedad entre obligaciones de igual monto", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("2a", 90), candidate("7c", 90)] }));
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.primaryCandidate).toBeNull();
  });

  it("favorece historial fuerte compatible sin alterar el score financiero", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("2a", 60), candidate("4b", 80)], memory: [memory("4b")] }));
    expect(result.primaryCandidate).toMatchObject({ unitId: "4b", financialScore: 80, identityMemoryScore: 20, decisionScore: 100 });
    expect(result.requiresConfirmation).toBe(false);
  });

  it("no convierte una signal multi-unit en identidad absoluta", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("4b", 80), candidate("7a", 80)], memory: [memory("4b"), memory("7a", { supportCount: 4 })] }));
    expect(result.status).toBe("AMBIGUOUS");
  });

  it("exige confirmación aun con líder claro si la signal tiene soporte en varias unidades", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("4b", 90), candidate("7a", 60)], memory: [memory("4b"), memory("7a", { supportCount: 1 })] }));
    expect(result).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: true, primaryCandidate: { unitId: "4b" } });
  });

  it("ignora asociaciones revocadas", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("2a", 90), candidate("4b", 70)], memory: [memory("4b", { status: "REVOKED", supportCount: 99 })] }));
    expect(result.primaryCandidate?.unitId).toBe("2a");
    expect(result.candidates.find((item) => item.unitId === "4b")?.identityMemoryScore).toBe(0);
  });

  it("degrada soporte disputado y exige confirmación", () => {
    const result = resolveUnknownPayer(input({ memory: [memory("2a", { status: "DISPUTED" })] }));
    expect(result.primaryCandidate?.identityMemoryScore).toBe(5);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.explanation.join(" ")).toContain("disputada");
  });

  it("una contradicción reduce certeza y exige confirmación", () => {
    const result = resolveUnknownPayer(input({ memory: [memory("2a", { supportCount: 5, contradictionCount: 1 })] }));
    expect(result.primaryCandidate?.identityMemoryScore).toBe(14);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.explanation.join(" ")).toContain("contradicción");
  });

  it("sin obligación compatible resulta evidencia insuficiente", () => {
    expect(resolveUnknownPayer(input({ candidates: [candidate("2a", 90, { obligationId: null })] })).status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("sin correlación durable no finge certeza", () => {
    expect(resolveUnknownPayer(input({ hasDurableCorrelation: false })).status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("funciona con payer conocido multi-unit usando finanzas e historial", () => {
    const result = resolveUnknownPayer(input({ payerId: "payer-1", signalId: null, candidates: [candidate("2a", 60), candidate("3b", 85)], memory: [memory("3b", { payerId: "payer-1", signalId: null })] }));
    expect(result.primaryCandidate?.unitId).toBe("3b");
    expect(result.provenance.historicalMemory).toBe("PAYER_UNIT_ASSOCIATION");
  });

  it("aísla memoria cross-tenant", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("2a", 90), candidate("4b", 70)], memory: [memory("4b", { organizationId: "org-other", supportCount: 99 })] }));
    expect(result.primaryCandidate?.unitId).toBe("2a");
    expect(result.candidates.find((item) => item.unitId === "4b")?.identityMemoryScore).toBe(0);
  });

  it("explica sólo señales reales y memoria aplicable", () => {
    const result = resolveUnknownPayer(input({ memory: [memory("2a"), memory("9z", { supportCount: 99 })] }));
    expect(result.explanation).toEqual([
      "Importe exacto para 2a.",
      "El movimiento tiene una correlación durable confirmada.",
      "5 soportes históricos activos, desde signal.",
    ]);
  });

  it("reporta ausencia de candidatos y admite payer+signal para deduplicar memoria", () => {
    expect(resolveUnknownPayer(input({ candidates: [] })).status).toBe("NO_CANDIDATES");
    expect(resolveUnknownPayer(input({ payerId: "payer-1" })).provenance.historicalMemory).toBe("PAYER_AND_SIGNAL_ASSOCIATIONS");
  });
});
