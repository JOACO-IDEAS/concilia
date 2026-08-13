import { describe, expect, it } from "vitest";
import { agruparPorConsorcio, clasificarBandeja, classifyObservation, priorityScore } from "./inbox-classification";
import type { ObservacionEnBandeja } from "./work-queue";

function obs(overrides: Partial<ObservacionEnBandeja> = {}): ObservacionEnBandeja {
  return {
    id: `obs-${Math.random()}`,
    agentType: "COMPLIANCE",
    type: "DOCUMENT_EXPIRED",
    severity: "CRITICAL",
    status: "OPEN",
    providerId: "prov-1",
    providerDocumentId: "doc-1",
    organizationId: "org-a",
    paymentTransactionId: null,
    explanation: "x",
    evidence: {},
    suggestedAction: null,
    source: "test",
    confidence: null,
    dedupeKey: `key-${Math.random()}`,
    detectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    providerName: null,
    organizationNames: ["Org A"],
    organizationIds: ["org-a"],
    ...overrides,
  };
}

describe("classifyObservation — las 5 categorías", () => {
  it("status RESOLVED siempre clasifica como RESOLVED, sin importar type/severity", () => {
    expect(classifyObservation(obs({ status: "RESOLVED", type: "DOCUMENT_EXPIRED", severity: "CRITICAL" }))).toBe("RESOLVED");
  });

  it("COMPLIANCE DOCUMENT_EXPIRED → NEEDS_ACTION (documento vencido)", () => {
    expect(classifyObservation(obs({ agentType: "COMPLIANCE", type: "DOCUMENT_EXPIRED" }))).toBe("NEEDS_ACTION");
  });

  it("COMPLIANCE DOCUMENT_EXPIRING_SOON → NEEDS_ACTION", () => {
    expect(classifyObservation(obs({ agentType: "COMPLIANCE", type: "DOCUMENT_EXPIRING_SOON" }))).toBe("NEEDS_ACTION");
  });

  it("COMPLIANCE PROVIDER_WITHOUT_DOCUMENTS → NEEDS_DATA (falta de evidencia ≠ incumplimiento, decisión explícita Fase 5.1)", () => {
    expect(classifyObservation(obs({ agentType: "COMPLIANCE", type: "PROVIDER_WITHOUT_DOCUMENTS" }))).toBe("NEEDS_DATA");
  });

  it("MATCHING BLOCKED por CUIT_CONTRADICTORY → NEEDS_DECISION", () => {
    const o = obs({
      agentType: "MATCHING",
      type: "PAYMENT_MATCH_BLOCKED",
      evidence: { blockers: [{ type: "CUIT_CONTRADICTORY", evidence: "..." }] },
    });
    expect(classifyObservation(o)).toBe("NEEDS_DECISION");
  });

  it("MATCHING AMBIGUOUS → NEEDS_DECISION", () => {
    const o = obs({
      agentType: "MATCHING",
      type: "PAYMENT_MATCH_AMBIGUOUS",
      evidence: { blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "..." }] },
    });
    expect(classifyObservation(o)).toBe("NEEDS_DECISION");
  });

  it("MATCHING BLOCKED por AMOUNT_INCOMPATIBLE → NEEDS_DECISION", () => {
    const o = obs({ agentType: "MATCHING", type: "PAYMENT_MATCH_BLOCKED", evidence: { blockers: [{ type: "AMOUNT_INCOMPATIBLE", evidence: "..." }] } });
    expect(classifyObservation(o)).toBe("NEEDS_DECISION");
  });

  it("MATCHING BLOCKED por UNIT_CODE_AMBIGUOUS → NEEDS_DECISION", () => {
    const o = obs({ agentType: "MATCHING", type: "PAYMENT_MATCH_BLOCKED", evidence: { blockers: [{ type: "UNIT_CODE_AMBIGUOUS", evidence: "..." }] } });
    expect(classifyObservation(o)).toBe("NEEDS_DECISION");
  });

  it("MATCHING BLOCKED por pago sin organización (INSUFFICIENT_EVIDENCE) → NEEDS_DATA, nunca NEEDS_ACTION", () => {
    const o = obs({
      agentType: "MATCHING",
      type: "PAYMENT_MATCH_BLOCKED",
      organizationId: null,
      evidence: { blockers: [{ type: "INSUFFICIENT_EVIDENCE", evidence: "El pago todavía no tiene una organización resuelta." }] },
    });
    expect(classifyObservation(o)).toBe("NEEDS_DATA");
  });

  it("MATCHING BLOCKED por consorcio sin unidades (NO_UNITS_IN_ORGANIZATION) → NEEDS_DATA", () => {
    const o = obs({
      agentType: "MATCHING",
      type: "PAYMENT_MATCH_BLOCKED",
      evidence: { blockers: [{ type: "NO_UNITS_IN_ORGANIZATION", evidence: "La organización no tiene unidades cargadas todavía." }] },
    });
    expect(classifyObservation(o)).toBe("NEEDS_DATA");
  });

  it("agentType todavía no mapeado (agente futuro) con severity=INFO → INFORMATIONAL (fallback conservador)", () => {
    const o = obs({ agentType: "COLLECTIONS" as never, type: "OTRO_TIPO_FUTURO" as never, severity: "INFO", evidence: {} });
    expect(classifyObservation(o)).toBe("INFORMATIONAL");
  });

  it("agentType todavía no mapeado (agente futuro) con severity≠INFO → NEEDS_DECISION (nunca se esconde algo sin clasificar)", () => {
    const o = obs({ agentType: "COLLECTIONS" as never, type: "OTRO_TIPO_FUTURO" as never, severity: "WARNING", evidence: {} });
    expect(classifyObservation(o)).toBe("NEEDS_DECISION");
  });
});

describe("priorityScore — degrada elegantemente cuando faltan datos, nunca inventa", () => {
  it("dos observaciones sin ningún dato extra (sin monto/vencimiento) igual se pueden ordenar por severity + antigüedad", () => {
    const critica = obs({ severity: "CRITICAL", detectedAt: new Date().toISOString() });
    const advertencia = obs({ severity: "WARNING", detectedAt: new Date().toISOString() });
    expect(priorityScore(critica, "NEEDS_ACTION")).toBeGreaterThan(priorityScore(advertencia, "NEEDS_ACTION"));
  });

  it("un documento que vence en 2 días ordena antes que uno que vence en 60 días, ambos NEEDS_ACTION", () => {
    const urgente = obs({ evidence: { diasParaVencer: 2 } });
    const lejano = obs({ evidence: { diasParaVencer: 60 } });
    expect(priorityScore(urgente, "NEEDS_ACTION")).toBeGreaterThan(priorityScore(lejano, "NEEDS_ACTION"));
  });

  it("sin evidencia de vencimiento (no se inventa), la antigüedad real sigue desempatando", () => {
    const ahora = new Date("2026-08-10T00:00:00.000Z");
    const vieja = obs({ evidence: {}, detectedAt: new Date("2026-07-01T00:00:00.000Z").toISOString() });
    const nueva = obs({ evidence: {}, detectedAt: new Date("2026-08-09T00:00:00.000Z").toISOString() });
    expect(priorityScore(vieja, "NEEDS_ACTION", { ahora })).toBeGreaterThan(priorityScore(nueva, "NEEDS_ACTION", { ahora }));
  });

  it("un monto real más alto (evidencia de matching) prioriza más, nunca se inventa para Compliance", () => {
    const montoAlto = obs({ agentType: "MATCHING", evidence: { amount: 5_000_000 } });
    const montoBajo = obs({ agentType: "MATCHING", evidence: { amount: 10_000 } });
    const sinMonto = obs({ agentType: "COMPLIANCE", evidence: {} }); // Compliance nunca tiene `amount` — no se inventa
    expect(priorityScore(montoAlto, "NEEDS_DECISION")).toBeGreaterThan(priorityScore(montoBajo, "NEEDS_DECISION"));
    expect(priorityScore(sinMonto, "NEEDS_ACTION")).toBeGreaterThanOrEqual(0);
  });

  it("las bandas de categoría nunca se cruzan: el NEEDS_DATA de mayor prioridad sigue por debajo del NEEDS_DECISION de menor prioridad", () => {
    const dataUrgente = obs({ severity: "CRITICAL", evidence: { amount: 999_999_999, diasParaVencer: 0 } });
    const decisionBaja = obs({ severity: "INFO", evidence: {} });
    expect(priorityScore(dataUrgente, "NEEDS_DATA")).toBeLessThan(priorityScore(decisionBaja, "NEEDS_DECISION"));
  });
});

describe("clasificarBandeja — agrupa y ordena", () => {
  it("separa correctamente en las 5 categorías y ordena por prioridad dentro de cada una", () => {
    const lista: ObservacionEnBandeja[] = [
      obs({ id: "a1", agentType: "COMPLIANCE", type: "DOCUMENT_EXPIRED", severity: "CRITICAL" }),
      obs({ id: "a2", agentType: "COMPLIANCE", type: "DOCUMENT_EXPIRING_SOON", severity: "WARNING" }),
      obs({ id: "d1", agentType: "MATCHING", type: "PAYMENT_MATCH_AMBIGUOUS", evidence: { blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES" }] } }),
      obs({ id: "n1", agentType: "MATCHING", type: "PAYMENT_MATCH_BLOCKED", evidence: { blockers: [{ type: "INSUFFICIENT_EVIDENCE" }] } }),
      obs({ id: "r1", status: "RESOLVED" }),
    ];

    const clasificadas = clasificarBandeja(lista);

    expect(clasificadas.NEEDS_ACTION.map((o) => o.id)).toEqual(["a1", "a2"]); // CRITICAL antes que WARNING
    expect(clasificadas.NEEDS_DECISION.map((o) => o.id)).toEqual(["d1"]);
    expect(clasificadas.NEEDS_DATA.map((o) => o.id)).toEqual(["n1"]);
    expect(clasificadas.RESOLVED.map((o) => o.id)).toEqual(["r1"]);
    expect(clasificadas.INFORMATIONAL).toHaveLength(0);
  });

  it("con cero observaciones, devuelve las 5 categorías vacías, sin lanzar", () => {
    const clasificadas = clasificarBandeja([]);
    expect(clasificadas).toEqual({ NEEDS_ACTION: [], NEEDS_DECISION: [], NEEDS_DATA: [], INFORMATIONAL: [], RESOLVED: [] });
  });
});

describe("agruparPorConsorcio — vista derivada, nunca inventa organización", () => {
  it("cuenta cada categoría por organización real, una observación multi-organización cuenta en cada una", () => {
    const lista: ObservacionEnBandeja[] = [
      obs({ id: "a1", organizationIds: ["org-a"], organizationNames: ["Alfa"], type: "DOCUMENT_EXPIRED" }),
      obs({
        id: "shared",
        organizationIds: ["org-a", "org-b"],
        organizationNames: ["Alfa", "Beta"],
        agentType: "COMPLIANCE",
        type: "DOCUMENT_EXPIRING_SOON",
        severity: "WARNING",
      }),
    ];
    const clasificadas = clasificarBandeja(lista);
    const porConsorcio = agruparPorConsorcio(clasificadas);

    const alfa = porConsorcio.find((c) => c.organizationId === "org-a");
    const beta = porConsorcio.find((c) => c.organizationId === "org-b");
    expect(alfa?.requierenAccion).toBe(2); // DOCUMENT_EXPIRED + DOCUMENT_EXPIRING_SOON, ambos NEEDS_ACTION
    expect(beta?.requierenAccion).toBe(1); // solo la compartida
  });

  it("una observación sin ninguna organización resuelta no aparece en ningún consorcio (nunca se inventa una)", () => {
    const lista: ObservacionEnBandeja[] = [obs({ organizationIds: [], organizationNames: [] })];
    const porConsorcio = agruparPorConsorcio(clasificarBandeja(lista));
    expect(porConsorcio).toHaveLength(0);
  });
});
