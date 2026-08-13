import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Suite 1 — estructural: el fake `tx` expone DELIBERADAMENTE solo
// `paymentTransaction.findUnique` y `reconciliationMatch.create` — ningún
// otro delegate (`unit`, `unitOwner`, `obligation`) existe. Si
// registrarDecisionHumana alguna vez intentara tocarlos, explotaría en
// runtime — misma técnica ya usada en reconcile-payment.test.ts (Fase 5.6)
// para probar "esto no puede tocar lo que no debe", no solo "no lo tocó".
// ---------------------------------------------------------------------------

const { mockPaymentTransaction, mockReconciliationMatch } = vi.hoisted(() => ({
  mockPaymentTransaction: { findUnique: vi.fn() },
  mockReconciliationMatch: { create: vi.fn() },
}));

const { registrarDecisionHumana } = await import("./human-decision");

const tx = {
  paymentTransaction: mockPaymentTransaction,
  reconciliationMatch: mockReconciliationMatch,
} as unknown as Parameters<typeof registrarDecisionHumana>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mockPaymentTransaction.findUnique.mockResolvedValue({ id: "pay-1" });
  mockReconciliationMatch.create.mockResolvedValue({ id: "match-1", decision: "APPROVED", createdAt: new Date("2026-08-10T00:00:00Z") });
});

function inputBase(overrides: Partial<Parameters<typeof registrarDecisionHumana>[1]> = {}) {
  return {
    paymentTransactionId: "pay-1",
    unitId: "unit-2b",
    obligationId: "obl-1",
    decision: "APPROVED" as const,
    score: 85,
    signals: [],
    reason: "CUIT coincide + importe coincide.",
    decidedBy: null,
    ...overrides,
  };
}

describe("registrarDecisionHumana — solo escribe ReconciliationMatch, nunca otra tabla", () => {
  it("APPROVED — crea la fila con los campos correctos", async () => {
    const r = await registrarDecisionHumana(tx, inputBase());

    expect(mockReconciliationMatch.create).toHaveBeenCalledWith({
      data: {
        paymentTransactionId: "pay-1",
        unitId: "unit-2b",
        obligationId: "obl-1",
        decision: "APPROVED",
        score: 85,
        signals: [],
        reason: "CUIT coincide + importe coincide.",
        decidedBy: null,
        rejectionReason: null,
      },
      select: { id: true, decision: true, createdAt: true },
    });
    expect(r.decision).toBe("APPROVED");
  });

  it("REJECTED con rejectionReason — crea la fila, rejectionReason presente", async () => {
    mockReconciliationMatch.create.mockResolvedValue({ id: "match-2", decision: "REJECTED", createdAt: new Date() });

    await registrarDecisionHumana(tx, inputBase({ decision: "REJECTED", rejectionReason: "No corresponde a esta UF." }));

    expect(mockReconciliationMatch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ decision: "REJECTED", rejectionReason: "No corresponde a esta UF." }) })
    );
  });

  it("REJECTED sin rejectionReason — lanza, nunca escribe", async () => {
    await expect(registrarDecisionHumana(tx, inputBase({ decision: "REJECTED" }))).rejects.toThrow(/rejectionReason/);
    expect(mockReconciliationMatch.create).not.toHaveBeenCalled();
  });

  it("APPROVED con rejectionReason igual queda en null (nunca se filtra a una decisión que no es REJECTED)", async () => {
    await registrarDecisionHumana(tx, inputBase({ rejectionReason: "esto no debería quedar" }));
    expect(mockReconciliationMatch.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rejectionReason: null }) }));
  });

  it("PaymentTransaction inexistente — lanza antes de escribir", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue(null);
    await expect(registrarDecisionHumana(tx, inputBase())).rejects.toThrow(/No existe ningún PaymentTransaction/);
    expect(mockReconciliationMatch.create).not.toHaveBeenCalled();
  });

  it("score null (vínculo manual sin scoring) es válido — se persiste tal cual, nunca se inventa un número", async () => {
    await registrarDecisionHumana(tx, inputBase({ score: null }));
    expect(mockReconciliationMatch.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ score: null }) }));
  });

  it("nunca toca Unit/UnitOwner/Obligation/PaymentTransaction.update — el fake tx no expone esos métodos, cualquier intento explotaría", async () => {
    // Si registrarDecisionHumana alguna vez llamara tx.unit.update(...) o
    // tx.obligation.update(...), esto lanzaría "Cannot read properties of
    // undefined" ANTES de llegar acá — la ausencia de esos delegates en el
    // fake es la prueba.
    await expect(registrarDecisionHumana(tx, inputBase())).resolves.toBeDefined();
  });

  it("decidedBy null es válido (sin autenticación real todavía, gap heredado documentado — no se inventa un usuario falso)", async () => {
    await registrarDecisionHumana(tx, inputBase({ decidedBy: null }));
    expect(mockReconciliationMatch.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ decidedBy: null }) }));
  });
});
