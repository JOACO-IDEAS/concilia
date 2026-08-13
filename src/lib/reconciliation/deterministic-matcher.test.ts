import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReconciliationMatch, mockPaymentTransaction } = vi.hoisted(() => ({
  mockReconciliationMatch: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  mockPaymentTransaction: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

const { evaluarDeterministico } = await import("./deterministic-matcher");
type Tx = Parameters<typeof evaluarDeterministico>[0];
type Universe = Parameters<typeof evaluarDeterministico>[2];
type Payment = Parameters<typeof evaluarDeterministico>[1];

const tx = {
  reconciliationMatch: mockReconciliationMatch,
  paymentTransaction: mockPaymentTransaction,
} as unknown as Tx;

beforeEach(() => {
  vi.clearAllMocks();
  mockReconciliationMatch.findFirst.mockResolvedValue(null); // sin rechazo previo ni duplicado, por defecto
  mockReconciliationMatch.findMany.mockResolvedValue([]); // sin rechazos previos, por defecto
  mockPaymentTransaction.findMany.mockResolvedValue([]); // sin historial, por defecto
});

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pt-1",
    amount: 145000,
    payerIdentifier: "20289900113",
    concept: "TRANSF UF 3A",
    transactionDate: null,
    referenceNumber: null,
    ...overrides,
  };
}

function obligacionAbierta(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "ob-1", period: new Date("2026-08-01"), amount: 145000, paidAmount: 0, dueDate: null, externalRef: null, ...overrides };
}

describe("evaluarDeterministico — consultas acotadas por cardinalidad", () => {
  it("evalúa 50 unidades con dos lecturas batch y una sola consulta final de duplicado", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: Array.from({ length: 50 }, (_, index) => ({
        id: `unit-${index}`,
        code: `${index + 1}A`,
        owners: [{ id: `owner-${index}`, fullName: `Titular ${index}`, taxId: index === 0 ? "20289900113" : `270000000${index}`, phone: null, email: null, isPrimary: true }],
        openObligations: [obligacionAbierta({ id: `ob-${index}` })],
      })),
    };

    const result = await evaluarDeterministico(tx, payment({ concept: "TRANSF UF 1A" }), universe);

    expect(result.status).toBe("CANDIDATE");
    expect(result.winner?.unitId).toBe("unit-0");
    expect(mockPaymentTransaction.findMany).toHaveBeenCalledTimes(1);
    expect(mockReconciliationMatch.findMany).toHaveBeenCalledTimes(1);
    expect(mockReconciliationMatch.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPaymentTransaction.findFirst).not.toHaveBeenCalled();
  });
});

// Caso #9: múltiples titulares de la misma unidad.
describe("evaluarDeterministico — múltiples titulares (#9)", () => {
  it("elige al titular cuyo CUIT coincide, entre dos titulares de la misma unidad", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        {
          id: "unit-1",
          code: "3A",
          owners: [
            { id: "owner-1", fullName: "Gonzalo Lopez", taxId: "27123456789", phone: null, email: null, isPrimary: true },
            { id: "owner-2", fullName: "Maria Gonzalez", taxId: "20289900113", phone: null, email: null, isPrimary: false },
          ],
          openObligations: [obligacionAbierta()],
        },
      ],
    };

    const r = await evaluarDeterministico(tx, payment({ payerIdentifier: "20289900113" }), universe);

    expect(r.status).toBe("CANDIDATE");
    expect(r.winner?.unitOwnerId).toBe("owner-2");
  });
});

// Caso #14: rechazo previo, scoped por (paymentTransactionId, unitId).
describe("evaluarDeterministico — rechazo previo (#14)", () => {
  it("bloquea la unidad ya rechazada para ESTE pago puntual, con el motivo real (no 'sin evidencia')", async () => {
    mockReconciliationMatch.findMany.mockResolvedValue([{ unitId: "unit-1" }]);

    const universe: Universe = {
      organizationId: "org-1",
      units: [
        {
          id: "unit-1",
          code: "3A",
          owners: [{ id: "owner-1", fullName: "Gonzalo Lopez", taxId: "20289900113", phone: null, email: null, isPrimary: true }],
          openObligations: [obligacionAbierta()],
        },
      ],
    };

    const r = await evaluarDeterministico(tx, payment(), universe);

    expect(r.status).toBe("BLOCKED");
    expect(r.globalBlockers.some((b) => b.type === "PREVIOUSLY_REJECTED")).toBe(true);
    expect(r.globalBlockers.some((b) => b.type === "INSUFFICIENT_EVIDENCE")).toBe(false); // el motivo real, no un genérico
  });

  it("el rechazo scoped a OTRO paymentTransactionId no afecta este pago", async () => {
    // El mock siempre consulta con paymentTransactionId=payment.id — simular
    // que solo hay un rechazo para un pago DISTINTO (mockReconciliationMatch
    // no debería devolver nada para este).
    mockReconciliationMatch.findFirst.mockResolvedValue(null);

    const universe: Universe = {
      organizationId: "org-1",
      units: [
        {
          id: "unit-1",
          code: "3A",
          owners: [{ id: "owner-1", fullName: "Gonzalo Lopez", taxId: "20289900113", phone: null, email: null, isPrimary: true }],
          openObligations: [obligacionAbierta()],
        },
      ],
    };

    const r = await evaluarDeterministico(tx, payment(), universe);

    expect(r.status).toBe("CANDIDATE");
    // Confirma que los rechazos se consultan en batch, scoped por este pago y
    // sólo por sus unidades candidatas.
    expect(mockReconciliationMatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ paymentTransactionId: "pt-1", decision: "REJECTED" }) })
    );
  });
});

// Caso #13/#18: candidato bloqueado — CUIT contradictorio a pesar de score alto por otras señales.
describe("evaluarDeterministico — candidato bloqueado con score alto (#13, #18)", () => {
  it("un candidato con Tier 1 en importe/código pero CUIT contradictorio queda BLOCKED, nunca gana por score", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        {
          id: "unit-1", // la unidad que el pago menciona en el concepto y cuyo importe calza exacto
          code: "3A",
          owners: [{ id: "owner-1", fullName: "Alguien Sin Relacion", taxId: "27123456789", phone: null, email: null, isPrimary: true }],
          openObligations: [obligacionAbierta({ id: "ob-3a", amount: 145000 })],
        },
        {
          id: "unit-2", // el titular real dueño del CUIT del pago, en OTRA unidad
          code: "5C",
          owners: [{ id: "owner-2", fullName: "Titular Real", taxId: "20289900113", phone: null, email: null, isPrimary: true }],
          openObligations: [],
        },
      ],
    };

    const r = await evaluarDeterministico(tx, payment({ payerIdentifier: "20289900113", concept: "TRANSF UF 3A" }), universe);

    expect(r.status).toBe("BLOCKED");
    expect(r.winner).toBeNull();
    expect(r.globalBlockers.some((b) => b.type === "CUIT_CONTRADICTORY")).toBe(true);

    // Confirma explícitamente que el score alto NO alcanzó para ignorar el bloqueo.
    const candidatoUnidad1 = r.candidates.find((c) => c.unitId === "unit-1");
    expect(candidatoUnidad1?.score).toBeGreaterThan(0);
    expect(candidatoUnidad1?.blockers.some((b) => b.type === "CUIT_CONTRADICTORY")).toBe(true);
  });
});

// Caso #20: pago sin identidad suficiente.
describe("evaluarDeterministico — sin identidad suficiente (#20)", () => {
  it("BLOCKED con INSUFFICIENT_EVIDENCE cuando ninguna señal aporta nada", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        {
          id: "unit-1",
          code: "3A",
          owners: [{ id: "owner-1", fullName: "Gonzalo Lopez", taxId: "20289900113", phone: null, email: null, isPrimary: true }],
          openObligations: [],
        },
      ],
    };

    // "DEPÓSITO CAJERO AUTOMÁTICO" — sin CUIT, sin código de unidad, sin
    // referencia, sin obligación, mismo ejemplo ya usado en los documentos
    // de arquitectura para el caso sin identificación.
    const r = await evaluarDeterministico(
      tx,
      payment({ payerIdentifier: null, concept: "DEPOSITO CAJERO AUTOMATICO", referenceNumber: null }),
      universe
    );

    expect(r.status).toBe("BLOCKED");
    expect(r.winner).toBeNull();
    expect(r.globalBlockers.some((b) => b.type === "INSUFFICIENT_EVIDENCE")).toBe(true);
  });

  it("BLOCKED con NO_UNITS_IN_ORGANIZATION cuando la organización no tiene unidades", async () => {
    const universe: Universe = { organizationId: "org-1", units: [] };
    const r = await evaluarDeterministico(tx, payment(), universe);
    expect(r.status).toBe("BLOCKED");
    expect(r.globalBlockers[0].type).toBe("NO_UNITS_IN_ORGANIZATION");
  });
});

describe("evaluarDeterministico — código de unidad ambiguo entre dos unidades", () => {
  it("BLOCKED con UNIT_CODE_AMBIGUOUS cuando el código extraído matchea más de una unidad", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        { id: "unit-1", code: "3A", owners: [], openObligations: [] },
        { id: "unit-2", code: "3A", owners: [], openObligations: [] }, // datos sucios reales — dos unidades con el mismo código
      ],
    };
    const r = await evaluarDeterministico(tx, payment({ payerIdentifier: null, concept: "TRANSF UF 3A" }), universe);
    expect(r.status).toBe("BLOCKED");
    expect(r.globalBlockers.some((b) => b.type === "UNIT_CODE_AMBIGUOUS")).toBe(true);
  });
});

// Fase 3.9 — regla estructural: un rival solo "empata" en ambigüedad si
// alcanza el MISMO tier más fuerte que el ganador (ver comentario en
// deterministic-matcher.ts, sección de ambigüedad). Ninguno de estos 5
// casos existía antes de Fase 3.9 — no había NINGÚN test que ejercitara
// AMBIGUOUS en este archivo (confirmado por auditoría antes de tocar
// código: solo "UNIT_CODE_AMBIGUOUS" aparecía, un blocker distinto que
// comparte la palabra mas no la lógica).
describe("evaluarDeterministico — EXACTO tiene ventaja estructural sobre PARCIAL (Fase 3.9)", () => {
  it("a) importe EXACTO en una unidad vs. PARCIAL en otra → gana la EXACTO, no es AMBIGUOUS", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        { id: "unit-1", code: "1A", owners: [], openObligations: [obligacionAbierta({ id: "ob-1", amount: 80000 })] }, // EXACTO
        { id: "unit-2", code: "2A", owners: [], openObligations: [obligacionAbierta({ id: "ob-2", amount: 100000 })] }, // PARCIAL (80000 < 100000)
      ],
    };
    const r = await evaluarDeterministico(
      tx,
      payment({ amount: 80000, payerIdentifier: null, concept: "Transferencia recibida" }),
      universe
    );

    expect(r.status).toBe("CANDIDATE");
    expect(r.winner?.unitId).toBe("unit-1");
  });

  it("b) dos unidades con importe EXACTO equivalente → AMBIGUOUS (dos candidatos genuinamente equivalentes)", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        { id: "unit-1", code: "1A", owners: [], openObligations: [obligacionAbierta({ id: "ob-1", amount: 80000 })] },
        { id: "unit-2", code: "2A", owners: [], openObligations: [obligacionAbierta({ id: "ob-2", amount: 80000 })] },
      ],
    };
    const r = await evaluarDeterministico(
      tx,
      payment({ amount: 80000, payerIdentifier: null, concept: "Transferencia recibida" }),
      universe
    );

    expect(r.status).toBe("AMBIGUOUS");
    expect(r.globalBlockers.some((b) => b.type === "MULTIPLE_EQUIVALENT_CANDIDATES")).toBe(true);
  });

  it("c) dos unidades con importe PARCIAL equivalente entre sí → sigue siendo AMBIGUOUS cuando corresponde", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        { id: "unit-1", code: "1A", owners: [], openObligations: [obligacionAbierta({ id: "ob-1", amount: 100000 })] },
        { id: "unit-2", code: "2A", owners: [], openObligations: [obligacionAbierta({ id: "ob-2", amount: 110000 })] },
      ],
    };
    const r = await evaluarDeterministico(
      tx,
      payment({ amount: 80000, payerIdentifier: null, concept: "Transferencia recibida" }),
      universe
    );

    expect(r.status).toBe("AMBIGUOUS");
    expect(r.globalBlockers.some((b) => b.type === "MULTIPLE_EQUIVALENT_CANDIDATES")).toBe(true);
  });

  it("d) un candidato bloqueado nunca puede ganar, ni siquiera cuando su tier es más fuerte que cualquier rival", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        {
          id: "unit-1", // el mejor candidato real (CUIT+código), pero CONTRADICTORIO
          code: "3A",
          owners: [{ id: "owner-1", fullName: "Alguien Sin Relacion", taxId: "27123456789", phone: null, email: null, isPrimary: true }],
          openObligations: [obligacionAbierta({ id: "ob-3a", amount: 145000 })],
        },
        {
          id: "unit-2", // titular real del CUIT, sin ninguna otra señal
          code: "5C",
          owners: [{ id: "owner-2", fullName: "Titular Real", taxId: "20289900113", phone: null, email: null, isPrimary: true }],
          openObligations: [],
        },
      ],
    };

    const r = await evaluarDeterministico(tx, payment({ payerIdentifier: "20289900113", concept: "TRANSF UF 3A" }), universe);

    expect(r.status).toBe("BLOCKED");
    expect(r.winner).toBeNull(); // nunca "gana" el bloqueado, ni cae a un ganador distinto
  });

  it("e) los bloqueos duros (globales) siguen con prioridad absoluta sobre la comparación de tiers", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        { id: "unit-1", code: "3A", owners: [], openObligations: [] },
        { id: "unit-2", code: "3A", owners: [], openObligations: [] }, // mismo código, dato sucio real
      ],
    };
    const r = await evaluarDeterministico(tx, payment({ payerIdentifier: null, concept: "TRANSF UF 3A" }), universe);

    // Sin la regla de Fase 3.9 esto ya era BLOCKED por UNIT_CODE_AMBIGUOUS —
    // este test confirma que la nueva comparación de tiers no interfiere:
    // el bloqueo global se decide ANTES de llegar a esa comparación.
    expect(r.status).toBe("BLOCKED");
    expect(r.globalBlockers.some((b) => b.type === "UNIT_CODE_AMBIGUOUS")).toBe(true);
  });
});

describe("evaluarDeterministico — nunca modifica datos contables", () => {
  it("no llama a ningún método de escritura del cliente Prisma mockeado", async () => {
    const universe: Universe = {
      organizationId: "org-1",
      units: [
        {
          id: "unit-1",
          code: "3A",
          owners: [{ id: "owner-1", fullName: "Gonzalo Lopez", taxId: "20289900113", phone: null, email: null, isPrimary: true }],
          openObligations: [obligacionAbierta()],
        },
      ],
    };
    await evaluarDeterministico(tx, payment(), universe);

    expect(mockReconciliationMatch.update).not.toHaveBeenCalled();
    expect(mockReconciliationMatch.create).not.toHaveBeenCalled();
    expect(mockPaymentTransaction.update).not.toHaveBeenCalled();
    expect(mockPaymentTransaction.create).not.toHaveBeenCalled();
  });
});
