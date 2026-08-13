import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 5.8 — prueba de integración: un REJECTED escrito por
// `registrarDecisionHumana` (nuevo) tiene que hacer disparar el blocker
// `PREVIOUSLY_REJECTED` en la SIGUIENTE corrida de `evaluarDeterministico`
// (Fase 3.3, SIN TOCAR). El lado de lectura de ese blocker ya existía desde
// antes de esta fase — lo único nuevo es que ahora hay una fila real que
// leer. Esta prueba corre contra el código REAL del motor (no un mock del
// motor), con un fake de Prisma que reproduce exactamente las queries que
// candidate-generator.ts/deterministic-matcher.ts hacen — mismo patrón ya
// usado en ingest-whatsapp-evidence.test.ts (Fase 5.3).

const { mockUnit, mockReconciliationMatch, mockPaymentTransaction } = vi.hoisted(() => ({
  mockUnit: { findMany: vi.fn() },
  mockReconciliationMatch: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  mockPaymentTransaction: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
}));

const { generarCandidatos } = await import("./candidate-generator");
const { evaluarDeterministico } = await import("./deterministic-matcher");
const { registrarDecisionHumana } = await import("./human-decision");

const tx = {
  unit: mockUnit,
  reconciliationMatch: mockReconciliationMatch,
  paymentTransaction: mockPaymentTransaction,
} as unknown as Parameters<typeof generarCandidatos>[0];

function decimal(n: number) {
  return { toNumber: () => n };
}

function unitFixture() {
  return {
    id: "unit-2b",
    code: "UF 2B",
    owners: [{ id: "owner-1", fullName: "Valentina Lopez", taxId: "20999102031", phone: "5491100000015", email: null, isPrimary: true }],
    obligations: [{ id: "obl-1", period: new Date("2026-08-01"), amount: decimal(100000), paidAmount: decimal(0), dueDate: new Date("2026-08-10"), externalRef: null }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUnit.findMany.mockResolvedValue([unitFixture()]);
  mockPaymentTransaction.findMany.mockResolvedValue([]); // sin historial
  mockPaymentTransaction.findUnique.mockResolvedValue({ id: "pay-1" });
  // Por defecto, sin rechazo previo ni duplicado — cada test lo pisa si lo necesita.
  mockReconciliationMatch.findFirst.mockResolvedValue(null);
  mockReconciliationMatch.findMany.mockResolvedValue([]);
  mockReconciliationMatch.create.mockImplementation(({ data }: { data: unknown }) =>
    Promise.resolve({ id: "match-nuevo", decision: (data as { decision: string }).decision, createdAt: new Date() })
  );
});

const payment = {
  id: "pay-1",
  amount: 100000,
  payerIdentifier: "20-99910203-1",
  concept: null,
  transactionDate: null,
  referenceNumber: null,
};

describe("Loop de rechazo humano cierra de punta a punta, sin tocar deterministic-matcher.ts", () => {
  it("SIN decisión humana previa: UF 2B es CANDIDATE (línea de base, confirma que el fixture es válido)", async () => {
    const universe = await generarCandidatos(tx, "org-1");
    const resultado = await evaluarDeterministico(tx, payment, universe, {});

    expect(resultado.status).toBe("CANDIDATE");
    expect(resultado.winner?.unitId).toBe("unit-2b");
    expect(resultado.winner?.blockers).toHaveLength(0);
  });

  it("CON un REJECTED ya registrado para (pay-1, unit-2b): la unidad rechazada queda BLOCKED por PREVIOUSLY_REJECTED en la siguiente corrida", async () => {
    // 1) Un humano rechaza el candidato — vía el módulo NUEVO de esta fase.
    await registrarDecisionHumana(tx, {
      paymentTransactionId: "pay-1",
      unitId: "unit-2b",
      obligationId: "obl-1",
      decision: "REJECTED",
      score: 85,
      signals: [],
      reason: "Candidato propuesto por el motor.",
      decidedBy: null,
      rejectionReason: "El administrador confirmó que este pago es de otro propietario.",
    });
    expect(mockReconciliationMatch.create).toHaveBeenCalledTimes(1);

    // 2) Ahora el fake de `reconciliationMatch.findFirst` debe reflejar que
    //    ESA fila existe — se reconfigura para simular la base ya con el
    //    rechazo adentro (el mock no comparte estado real con `.create`,
    //    así que se simula explícitamente, tal como hacen los demás tests
    //    de este proyecto con fakes de Prisma).
    mockReconciliationMatch.findMany.mockResolvedValue([{ unitId: "unit-2b" }]);

    // 3) Se re-evalúa el MISMO pago con el motor REAL, sin tocar ni un
    //    archivo del motor — el blocker debe aparecer solo.
    const universe = await generarCandidatos(tx, "org-1");
    const resultado = await evaluarDeterministico(tx, payment, universe, {});

    expect(resultado.status).toBe("BLOCKED");
    const candidatoUF2B = resultado.candidates.find((c) => c.unitId === "unit-2b");
    expect(candidatoUF2B?.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "PREVIOUSLY_REJECTED" })])
    );
  });

  it("el rechazo queda SCOPED por (paymentTransactionId, unitId) — no contamina otro pago para la misma unidad (regla ya existente, reconfirmada)", async () => {
    mockReconciliationMatch.findMany.mockImplementation(({ where }: { where: { paymentTransactionId?: string } }) =>
      Promise.resolve(where.paymentTransactionId === "pay-1" ? [{ unitId: "unit-2b" }] : [])
    );

    const otroPago = { ...payment, id: "pay-2" };
    const universe = await generarCandidatos(tx, "org-1");
    const resultado = await evaluarDeterministico(tx, otroPago, universe, {});

    expect(resultado.status).toBe("CANDIDATE"); // no contaminado
    expect(resultado.winner?.blockers).toHaveLength(0);
  });
});
