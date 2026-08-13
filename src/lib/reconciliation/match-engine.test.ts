import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPaymentTransaction, mockUnit, mockUnitOwner, mockReconciliationMatch, mockTransaction } = vi.hoisted(
  () => {
    const mockPaymentTransaction = { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() };
    const mockUnit = { findMany: vi.fn(), update: vi.fn(), create: vi.fn() };
    const mockUnitOwner = { findMany: vi.fn(), update: vi.fn(), create: vi.fn() };
    const mockReconciliationMatch = { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() };
    type Tx = {
      paymentTransaction: typeof mockPaymentTransaction;
      unit: typeof mockUnit;
      unitOwner: typeof mockUnitOwner;
      reconciliationMatch: typeof mockReconciliationMatch;
    };
    const tx: Tx = {
      paymentTransaction: mockPaymentTransaction,
      unit: mockUnit,
      unitOwner: mockUnitOwner,
      reconciliationMatch: mockReconciliationMatch,
    };
    const mockTransaction = vi.fn((cb: (tx: Tx) => unknown) => cb(tx));
    return { mockPaymentTransaction, mockUnit, mockUnitOwner, mockReconciliationMatch, mockTransaction };
  }
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    paymentTransaction: mockPaymentTransaction,
    unit: mockUnit,
    unitOwner: mockUnitOwner,
    reconciliationMatch: mockReconciliationMatch,
  },
}));

const { runMatchingInShadow } = await import("./match-engine");

beforeEach(() => {
  vi.clearAllMocks();
  mockReconciliationMatch.findFirst.mockResolvedValue(null);
  mockPaymentTransaction.findFirst.mockResolvedValue(null);
});

function decimal(n: number) {
  return { toNumber: () => n };
}

function unitFixture() {
  return {
    id: "unit-1",
    code: "3A",
    owners: [
      {
        id: "owner-1",
        fullName: "Gonzalo Lopez",
        taxId: "20289900113",
        phone: null,
        email: null,
        isPrimary: true,
      },
    ],
    obligations: [
      {
        id: "ob-1",
        period: new Date("2026-08-01"),
        amount: decimal(145000),
        paidAmount: decimal(0),
        dueDate: new Date("2026-08-10"),
        externalRef: null,
      },
    ],
  };
}

describe("runMatchingInShadow — resultado explicable de punta a punta", () => {
  it("produce un candidato explicable con evidencia real (CUIT + Unit.code + importe)", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(145000),
      payerIdentifier: "20289900113",
      concept: "TRANSF UF 3A",
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([unitFixture()]);

    const r = await runMatchingInShadow("pt-1");

    expect(r.status).toBe("CANDIDATE");
    expect(r.candidateUnitId).toBe("unit-1");
    expect(r.candidateUnitOwnerId).toBe("owner-1");
    expect(r.candidateObligationId).toBe("ob-1");
    expect(r.score).toBeGreaterThan(0);
    expect(r.explanation).toContain("✓");
    expect(r.explanation).not.toContain("score ="); // nunca solo el número pelado
    expect(r.evaluatedAt).toBeTruthy();
  });

  it("el status nunca es 'AUTO' — el tipo ni siquiera lo permite, y en runtime tampoco aparece", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(145000),
      payerIdentifier: "20289900113",
      concept: "TRANSF UF 3A",
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([unitFixture()]);

    const r = await runMatchingInShadow("pt-1");

    expect(r.status).not.toBe("AUTO");
    expect(["CANDIDATE", "AMBIGUOUS", "BLOCKED"]).toContain(r.status);
  });
});

describe("runMatchingInShadow — organización sin resolver", () => {
  it("BLOCKED cuando el PaymentTransaction todavía no tiene organizationId (Capa 1 sin resolver)", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: null,
      amount: decimal(1000),
      payerIdentifier: null,
      concept: null,
      transactionDate: null,
      referenceNumber: null,
    });

    const r = await runMatchingInShadow("pt-1");

    expect(r.status).toBe("BLOCKED");
    expect(r.candidateUnitId).toBeNull();
    expect(mockUnit.findMany).not.toHaveBeenCalled(); // ni siquiera intenta generar candidatos
  });
});

describe("runMatchingInShadow — nunca modifica datos contables", () => {
  it("no llama a ningún método de escritura, sin importar el resultado", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(145000),
      payerIdentifier: "20289900113",
      concept: "TRANSF UF 3A",
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([unitFixture()]);

    await runMatchingInShadow("pt-1");

    expect(mockPaymentTransaction.update).not.toHaveBeenCalled();
    expect(mockPaymentTransaction.create).not.toHaveBeenCalled();
    expect(mockUnit.update).not.toHaveBeenCalled();
    expect(mockUnit.create).not.toHaveBeenCalled();
    expect(mockUnitOwner.update).not.toHaveBeenCalled();
    expect(mockUnitOwner.create).not.toHaveBeenCalled();
    expect(mockReconciliationMatch.update).not.toHaveBeenCalled();
    expect(mockReconciliationMatch.create).not.toHaveBeenCalled();
  });

  it("no persiste el resultado en ninguna tabla — el resultado solo se devuelve (ver FASE_3_3_IMPLEMENTATION_PLAN.md §2)", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(145000),
      payerIdentifier: "20289900113",
      concept: "TRANSF UF 3A",
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([unitFixture()]);

    const r = await runMatchingInShadow("pt-1");

    expect(typeof r).toBe("object");
    expect(mockReconciliationMatch.create).not.toHaveBeenCalled();
  });
});

// Fase 3.9 — topCandidateScore/topCandidateTier: diagnóstico puro, nunca
// cambia la decisión. Ver deterministic-matcher.test.ts para la cobertura
// exhaustiva de la regla de ambigüedad; acá se confirma que el dato llega
// correctamente hasta el ShadowMatchResult final, de punta a punta.
describe("runMatchingInShadow — topCandidateScore/topCandidateTier (Fase 3.9)", () => {
  it("BLOCKED con evidencia fuerte (CUIT+código) pero importe sin explicar: score/tier reales, aunque score/tier de arriba sigan en 0/null", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(900000), // muy superior a la obligación (145000), sin obligación futura que lo explique
      payerIdentifier: "20289900113",
      concept: "TRANSF UF 3A",
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([unitFixture()]);

    const r = await runMatchingInShadow("pt-1");

    expect(r.status).toBe("BLOCKED");
    expect(r.blockers.some((b) => b.type === "AMOUNT_INCOMPATIBLE")).toBe(true);
    // score/tier "oficiales" siguen siendo 0/null — CUIT contradictorio con AUTO no aplica acá,
    // este caso es "mejor candidato bloqueado", que ya devuelve winner:null.
    expect(r.score).toBe(0);
    expect(r.tier).toBeNull();
    // pero el diagnóstico SÍ conserva la evidencia real (CUIT + código matchean, tier 1).
    expect(r.topCandidateScore).toBeGreaterThan(0);
    expect(r.topCandidateTier).toBe(1);
  });

  it("BLOCKED sin organización resuelta: topCandidateScore/Tier son null (nunca 0 — no hubo ningún candidato)", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: null,
      amount: decimal(1000),
      payerIdentifier: null,
      concept: null,
      transactionDate: null,
      referenceNumber: null,
    });

    const r = await runMatchingInShadow("pt-1");

    expect(r.status).toBe("BLOCKED");
    expect(r.topCandidateScore).toBeNull();
    expect(r.topCandidateTier).toBeNull();
  });

  it("BLOCKED con NO_UNITS_IN_ORGANIZATION: topCandidateScore/Tier son null (universo de candidatos vacío)", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(1000),
      payerIdentifier: null,
      concept: null,
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([]); // organización sin ninguna unidad cargada

    const r = await runMatchingInShadow("pt-1");

    expect(r.status).toBe("BLOCKED");
    expect(r.blockers.some((b) => b.type === "NO_UNITS_IN_ORGANIZATION")).toBe(true);
    expect(r.topCandidateScore).toBeNull();
    expect(r.topCandidateTier).toBeNull();
  });

  it("CANDIDATE: topCandidateScore/Tier coinciden con el score/tier del ganador", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(145000),
      payerIdentifier: "20289900113",
      concept: "TRANSF UF 3A",
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([unitFixture()]);

    const r = await runMatchingInShadow("pt-1");

    expect(r.status).toBe("CANDIDATE");
    expect(r.topCandidateScore).toBe(r.score);
    expect(r.topCandidateTier).toBe(r.tier);
  });
});

// Fase 5.1 — topCandidates: identidad real (UF + score + tier + señales),
// hasta 3, sin inventar nada. No toca deterministic-matcher.ts/
// confidence-engine.ts/signals.ts — solo lee `candidates`, ya calculado.
describe("runMatchingInShadow — topCandidates (Fase 5.1)", () => {
  it("CANDIDATE: incluye la UF real del ganador, con las señales que realmente matchearon", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(145000),
      payerIdentifier: "20289900113",
      concept: "TRANSF UF 3A",
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([unitFixture()]);

    const r = await runMatchingInShadow("pt-1");

    expect(r.topCandidates).not.toBeNull();
    expect(r.topCandidates![0].unitCode).toBe("3A");
    expect(r.topCandidates![0].score).toBe(r.score);
    expect(r.topCandidates![0].matchedSignals).toContain("CUIT_EXACT");
    // nunca se inventa/expone el nombre del titular — no lo pide el diseño aprobado
    expect(r.topCandidates![0]).not.toHaveProperty("ownerFullName");
  });

  it("BLOCKED por importe (candidato con evidencia real bloqueado): topCandidates conserva su identidad, aunque winner sea null", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(900000),
      payerIdentifier: "20289900113",
      concept: "TRANSF UF 3A",
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([unitFixture()]);

    const r = await runMatchingInShadow("pt-1");

    expect(r.status).toBe("BLOCKED");
    expect(r.topCandidates).not.toBeNull();
    expect(r.topCandidates![0].unitCode).toBe("3A");
    expect(r.topCandidates![0].score).toBe(r.topCandidateScore);
  });

  it("nunca más de 3 candidatos, aunque el universo tenga más unidades", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(999999), // no coincide con nada, para que las 5 unidades generen candidatos parejos
      payerIdentifier: null,
      concept: null,
      transactionDate: null,
      referenceNumber: null,
    });
    const unidades = ["1A", "1B", "2A", "2B", "3A"].map((code, i) => ({
      id: `unit-${i}`,
      code,
      owners: [{ id: `owner-${i}`, fullName: `Titular ${i}`, taxId: null, phone: null, email: null, isPrimary: true }],
      obligations: [],
    }));
    mockUnit.findMany.mockResolvedValue(unidades);

    const r = await runMatchingInShadow("pt-1");

    expect(r.topCandidates?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it("sin organización resuelta: topCandidates es null (no hubo ningún universo de candidatos)", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: null,
      amount: decimal(1000),
      payerIdentifier: null,
      concept: null,
      transactionDate: null,
      referenceNumber: null,
    });

    const r = await runMatchingInShadow("pt-1");

    expect(r.topCandidates).toBeNull();
  });

  it("NO_UNITS_IN_ORGANIZATION: topCandidates es null (universo vacío)", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(1000),
      payerIdentifier: null,
      concept: null,
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([]);

    const r = await runMatchingInShadow("pt-1");

    expect(r.topCandidates).toBeNull();
  });
});

describe("runMatchingInShadow — pago sin identidad suficiente, de punta a punta", () => {
  it("BLOCKED con explicación honesta cuando no hay ninguna señal", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({
      id: "pt-1",
      organizationId: "org-1",
      amount: decimal(900000),
      payerIdentifier: null,
      concept: "DEPOSITO CAJERO AUTOMATICO",
      transactionDate: null,
      referenceNumber: null,
    });
    mockUnit.findMany.mockResolvedValue([unitFixture()]);

    const r = await runMatchingInShadow("pt-1");

    expect(r.status).toBe("BLOCKED");
    expect(r.candidateUnitId).toBeNull();
    expect(r.blockers.some((b) => b.type === "INSUFFICIENT_EVIDENCE")).toBe(true);
  });
});
