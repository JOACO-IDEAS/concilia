import { describe, expect, it } from "vitest";
import type { CandidateEntry } from "@/lib/reconciliation/deterministic-matcher";
import { resolveUnknownPayer, type HistoricalUnitMemory, type UnknownPayerResolutionInput } from "./unknown-payer-resolution";

function candidate(unitId: string, score: number, tier: 1 | 2 | 3 | 4 = 2): CandidateEntry {
  return { unitId, unitCode: unitId.toUpperCase(), unitOwnerId: null, ownerFullName: null, obligationId: `ob-${unitId}`, score, tier, blockers: [], wouldQualifyForAuto: false, signals: [{ signal: "AMOUNT_MATCH", tier, matched: true, strength: tier <= 2 ? "STRONG" : "WEAK", evidence: `Evidencia financiera real para ${unitId}.` }] };
}

function memory(unitId: string, overrides: Partial<HistoricalUnitMemory> = {}): HistoricalUnitMemory {
  return { organizationId: "org-1", unitId, signalId: "signal-1", payerId: null, status: "OBSERVED", supportCount: 5, contradictionCount: 0, ...overrides };
}

function input(overrides: Partial<UnknownPayerResolutionInput> = {}): UnknownPayerResolutionInput {
  return { organizationId: "org-1", signalId: "signal-1", payerId: null, hasDurableCorrelation: true, candidates: [candidate("4b", 90)], memory: [], ...overrides };
}

describe("historical recognition integration", () => {
  it("strong financial + strong history refuerza la misma unidad", () => {
    const result = resolveUnknownPayer(input({ memory: [memory("4b")] }));
    expect(result).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: false, primaryCandidate: { financialScore: 90, historical: { contribution: 20 } }, diagnostics: { historyRemovedConfirmation: true } });
  });

  it("sin history preserva el comportamiento anterior", () => {
    const result = resolveUnknownPayer(input());
    expect(result).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: true, primaryCandidate: { unitId: "4b", financialScore: 90, identityMemoryScore: 0 } });
  });

  it("history no resuelve sin piso financiero, aun con un único candidato", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("4b", 20, 3)], memory: [memory("4b")] }));
    expect(result).toMatchObject({ status: "INSUFFICIENT_EVIDENCE", primaryCandidate: null, requiresConfirmation: true });
  });

  it("financial A + history B conserva el conflicto explícito", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("4b", 90), candidate("7a", 80)], memory: [memory("7a")] }));
    expect(result).toMatchObject({ status: "AMBIGUOUS", primaryCandidate: null, requiresConfirmation: true, diagnostics: { historicalConflict: true } });
    expect(result.explanation[0]).toContain("financiera favorece 4B");
  });

  it("history multi-unit siempre requiere confirmación", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("4b", 90), candidate("7a", 60)], memory: [memory("4b"), memory("7a", { supportCount: 1 })] }));
    expect(result).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: true });
  });

  it("history no elimina una ambigüedad financiera original", () => {
    const result = resolveUnknownPayer(input({ candidates: [candidate("4b", 90), candidate("7a", 90)], memory: [memory("4b")] }));
    expect(result).toMatchObject({ status: "AMBIGUOUS", primaryCandidate: null, requiresConfirmation: true });
  });

  it("REVOKED se ignora y se explica sin bajar confirmación", () => {
    const result = resolveUnknownPayer(input({ memory: [memory("4b", { status: "REVOKED", supportCount: 99 })] }));
    expect(result.primaryCandidate?.historical).toMatchObject({ contribution: 0, revokedIgnored: true });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.explanation.join(" ")).toContain("revocada fue ignorada");
  });

  it("DISPUTED degrada la contribución y preserva confirmación", () => {
    const result = resolveUnknownPayer(input({ memory: [memory("4b", { status: "DISPUTED" })] }));
    expect(result.primaryCandidate?.historical).toMatchObject({ contribution: 5, disputed: true });
    expect(result.requiresConfirmation).toBe(true);
  });

  it("contradicciones reducen soporte histórico", () => {
    const clean = resolveUnknownPayer(input({ memory: [memory("4b", { supportCount: 8 })] }));
    const contradicted = resolveUnknownPayer(input({ memory: [memory("4b", { supportCount: 8, contradictionCount: 7 })] }));
    expect(clean.primaryCandidate?.historical.contribution).toBe(20);
    expect(contradicted.primaryCandidate?.historical.contribution).toBe(-10);
    expect(contradicted.requiresConfirmation).toBe(true);
  });

  it("signal + payer con misma provenance no cuenta doble", () => {
    const shared = [{ provenanceKey: "decision-1", effect: "SUPPORT" as const }];
    const result = resolveUnknownPayer(input({ payerId: "payer-1", memory: [memory("4b", { supportCount: 1, evidence: shared }), memory("4b", { signalId: null, payerId: "payer-1", supportCount: 1, evidence: shared })] }));
    expect(result.primaryCandidate?.historical).toMatchObject({ supportCount: 1, contribution: 4, deduplicatedByProvenance: true });
  });

  it("payer + signal con provenance independiente suma de forma explícita", () => {
    const result = resolveUnknownPayer(input({ payerId: "payer-1", memory: [memory("4b", { supportCount: 1, evidence: [{ provenanceKey: "signal-decision", effect: "SUPPORT" }] }), memory("4b", { signalId: null, payerId: "payer-1", supportCount: 1, evidence: [{ provenanceKey: "payer-import", effect: "SUPPORT" }] })] }));
    expect(result.primaryCandidate?.historical).toMatchObject({ supportCount: 2, contribution: 8, sources: ["SIGNAL", "PAYER"] });
  });

  it("ignora memory cross-tenant", () => {
    const result = resolveUnknownPayer(input({ memory: [memory("4b", { organizationId: "org-2", supportCount: 99 })] }));
    expect(result.primaryCandidate?.historical).toMatchObject({ supportCount: 0, contribution: 0 });
  });

  it("unknown payer funciona sólo con signal memory", () => {
    const result = resolveUnknownPayer(input({ payerId: null, memory: [memory("4b")] }));
    expect(result).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: false, provenance: { historicalMemory: "SIGNAL_UNIT_ASSOCIATION" } });
  });

  it("known payer multi-unit no colapsa 1:1", () => {
    const result = resolveUnknownPayer(input({ signalId: null, payerId: "payer-1", candidates: [candidate("4b", 90), candidate("7a", 60)], memory: [memory("4b", { signalId: null, payerId: "payer-1" }), memory("7a", { signalId: null, payerId: "payer-1", supportCount: 1 })] }));
    expect(result.requiresConfirmation).toBe(true);
  });

  it("es determinístico", () => {
    const value = input({ candidates: [candidate("7a", 80), candidate("4b", 90)], memory: [memory("4b")] });
    expect(resolveUnknownPayer(value)).toEqual(resolveUnknownPayer(value));
  });

  it("cada explicación corresponde a evidencia real", () => {
    const result = resolveUnknownPayer(input({ memory: [memory("4b", { supportCount: 6, contradictionCount: 1 })] }));
    expect(result.explanation).toEqual(expect.arrayContaining(["Evidencia financiera real para 4b.", "El movimiento tiene una correlación durable confirmada.", "6 soportes históricos activos, desde signal.", "1 contradicción histórica reduce el soporte."]));
    expect(result.explanation.join(" ")).not.toMatch(/mágic|siempre|única identidad/i);
  });
});
