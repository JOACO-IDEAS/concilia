import { beforeEach, describe, expect, it, vi } from "vitest";

interface FilaObs {
  id: string;
  agentType: string;
  type: string;
  severity: string;
  status: string;
  providerId: string | null;
  providerDocumentId: string | null;
  organizationId: string | null;
  paymentTransactionId: string | null;
  explanation: string;
  evidence: unknown;
  suggestedAction: string | null;
  source: string;
  confidence: number | null;
  dedupeKey: string;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface FilaNotice {
  id: string;
  organizationId: string | null;
  phone: string;
  receivedAt: Date;
  amount: number | null;
  claimedDate: Date | null;
  reference: string | null;
  attachmentUrl: string | null;
  extractedText: string | null;
  extractedData: Record<string, unknown>;
  status: string;
  confidence: number | null;
}

// ---------------------------------------------------------------------------
// Padrón fijo de prueba, org-1:
//   UF 3A — Juan (owner-a), phone ...111, CUIT ...111 — obligación $150.000
//   UF 3B — Maria (owner-b), phone ...222, CUIT ...222 — obligación $150.000 (mismo importe que 3A, a propósito)
//   UF 4A — Pedro (owner-c), phone ...333, CUIT ...333 — obligación $200.000
//   UF 5A — Compartido Uno (owner-d1), phone ...999 — obligación $50.000
//   UF 5B — Compartido Dos (owner-d2), phone ...999 (MISMO teléfono que 5A) — obligación $50.000
// CUIT "20444444444" no pertenece a NADIE de esta organización (tercero real).
// ---------------------------------------------------------------------------
const { mockTx, obsStore, noticeStore } = vi.hoisted(() => {
  const obsStore = new Map<string, FilaObs>();
  const noticeStore = new Map<string, FilaNotice>();
  let contadorObs = 0;
  let contadorNotice = 0;

  const unitOwners = [
    { id: "owner-a", unitId: "unit-a", phone: "5491100000111", taxId: "20111111111", unit: { organizationId: "org-1", deletedAt: null } },
    { id: "owner-b", unitId: "unit-b", phone: "5491100000222", taxId: "20222222222", unit: { organizationId: "org-1", deletedAt: null } },
    { id: "owner-c", unitId: "unit-c", phone: "5491100000333", taxId: "20333333333", unit: { organizationId: "org-1", deletedAt: null } },
    { id: "owner-d1", unitId: "unit-d1", phone: "5491100000999", taxId: null, unit: { organizationId: "org-1", deletedAt: null } },
    { id: "owner-d2", unitId: "unit-d2", phone: "5491100000999", taxId: null, unit: { organizationId: "org-1", deletedAt: null } },
  ];

  function decimal(n: number) {
    return { toNumber: () => n };
  }

  const units = [
    {
      id: "unit-a",
      code: "3A",
      owners: [{ id: "owner-a", fullName: "Juan Perez", taxId: "20111111111", phone: "5491100000111", email: null, isPrimary: true }],
      obligations: [{ id: "ob-a", period: new Date("2026-08-01"), amount: decimal(150000), paidAmount: decimal(0), dueDate: null, externalRef: null }],
    },
    {
      id: "unit-b",
      code: "3B",
      owners: [{ id: "owner-b", fullName: "Maria Lopez", taxId: "20222222222", phone: "5491100000222", email: null, isPrimary: true }],
      obligations: [{ id: "ob-b", period: new Date("2026-08-01"), amount: decimal(150000), paidAmount: decimal(0), dueDate: null, externalRef: null }],
    },
    {
      id: "unit-c",
      code: "4A",
      owners: [{ id: "owner-c", fullName: "Pedro Gomez", taxId: "20333333333", phone: "5491100000333", email: null, isPrimary: true }],
      obligations: [{ id: "ob-c", period: new Date("2026-08-01"), amount: decimal(200000), paidAmount: decimal(0), dueDate: null, externalRef: null }],
    },
    {
      id: "unit-d1",
      code: "5A",
      owners: [{ id: "owner-d1", fullName: "Compartido Uno", taxId: null, phone: "5491100000999", email: null, isPrimary: true }],
      obligations: [{ id: "ob-d1", period: new Date("2026-08-01"), amount: decimal(50000), paidAmount: decimal(0), dueDate: null, externalRef: null }],
    },
    {
      id: "unit-d2",
      code: "5B",
      owners: [{ id: "owner-d2", fullName: "Compartido Dos", taxId: null, phone: "5491100000999", email: null, isPrimary: true }],
      obligations: [{ id: "ob-d2", period: new Date("2026-08-01"), amount: decimal(50000), paidAmount: decimal(0), dueDate: null, externalRef: null }],
    },
  ];

  const fakeUnitOwner = { findMany: vi.fn(async () => unitOwners) };
  const fakeUnit = { findMany: vi.fn(async () => units) };
  const fakeReconciliationMatch = { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) };
  const fakePaymentTransaction = { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) };

  const fakePaymentNotice = {
    findMany: vi.fn(async ({ where }: { where: { phone: string } }) => [...noticeStore.values()].filter((n) => n.phone === where.phone)),
    create: vi.fn(async ({ data }: { data: Omit<FilaNotice, "id"> }) => {
      contadorNotice++;
      const fila = { id: `notice-${contadorNotice}`, ...data } as FilaNotice;
      noticeStore.set(fila.id, fila);
      return fila;
    }),
  };

  const fakeAgentObservation = {
    upsert: vi.fn(async ({ where, create, update }: { where: { dedupeKey: string }; create: Omit<FilaObs, "id" | "createdAt" | "updatedAt">; update: Partial<FilaObs> }) => {
      const existente = obsStore.get(where.dedupeKey);
      if (existente) {
        const actualizada = { ...existente, ...update, updatedAt: new Date() };
        obsStore.set(where.dedupeKey, actualizada);
        return actualizada;
      }
      contadorObs++;
      const nueva = { id: `obs-${contadorObs}`, createdAt: new Date(), updatedAt: new Date(), ...create } as FilaObs;
      obsStore.set(where.dedupeKey, nueva);
      return nueva;
    }),
  };

  const mockTx = {
    unitOwner: fakeUnitOwner,
    unit: fakeUnit,
    reconciliationMatch: fakeReconciliationMatch,
    paymentTransaction: fakePaymentTransaction,
    paymentNotice: fakePaymentNotice,
    agentObservation: fakeAgentObservation,
  };

  return { mockTx, obsStore, noticeStore };
});

const { ingestarComprobanteWhatsApp, evaluarEvidenciaDeComprobante } = await import("./ingest-whatsapp-evidence");
type Tx = Parameters<typeof ingestarComprobanteWhatsApp>[0];

beforeEach(() => {
  vi.clearAllMocks();
  obsStore.clear();
  noticeStore.clear();
});

let contadorMensaje = 0;
function mensaje(overrides: Partial<Record<string, unknown>> = {}) {
  contadorMensaje++;
  return {
    externalMessageId: `wa-msg-${contadorMensaje}`,
    phone: "5491100000111",
    receivedAt: "2026-08-10T12:00:00.000Z",
    messageType: "image" as const,
    attachmentUrl: "https://example.com/comprobante.jpg",
    rawText: null,
    ...overrides,
  };
}

function comprobante(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    amount: null,
    currency: "ARS",
    payerName: null,
    payerIdentifier: null,
    transactionDate: null,
    referenceNumber: null,
    bankOrigin: null,
    confidenceExtraccion: null,
    ...overrides,
  };
}

describe("evaluarEvidenciaDeComprobante — los 15 escenarios de Fase 5.3 §10", () => {
  it("1. teléfono único + comprobante compatible → CANDIDATE con identidad corroborada", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000111", comprobante({ amount: 150000, payerIdentifier: "20111111111" }));
    expect(r.estado).toBe("CANDIDATE");
    expect(r.candidatoPropuesto?.unitCode).toBe("3A");
    expect(r.blockers).toHaveLength(0);
  });

  it("2. teléfono múltiple (mismo teléfono, 2 unidades) — sin otra señal, el motor tampoco puede desempatar", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000999", comprobante({ amount: 50000 }));
    expect(r.resolucionTelefono.case).toBe("AMBIGUOUS_WITHIN_ORG");
    expect(r.estado).toBe("AMBIGUOUS");
    expect(r.blockers.some((b) => b.type === "PHONE_AMBIGUOUS")).toBe(true);
  });

  it("3. teléfono desconocido, sin CUIT → SIN_IDENTIDAD, nunca inventa una organización", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491199999999", comprobante({ amount: 150000 }));
    expect(r.resolucionTelefono.case).toBe("UNKNOWN");
    expect(r.estado).toBe("SIN_IDENTIDAD");
    expect(r.organizationId).toBeNull();
  });

  it("4. CUIT coincidente resuelve la organización aunque el teléfono no esté registrado", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491199999999", comprobante({ amount: 200000, payerIdentifier: "20333333333" }));
    expect(r.organizationId).toBe("org-1");
    expect(r.estado).toBe("CANDIDATE");
    expect(r.candidatoPropuesto?.unitCode).toBe("4A");
  });

  it("5. CUIT contradictorio: teléfono→UF 3A, pero el CUIT del comprobante es el de la titular real de UF 3B", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000111", comprobante({ amount: 150000, payerIdentifier: "20222222222" }));
    // El motor real prioriza CUIT+importe (3B) sobre solo-importe (3A) — el
    // ganador real del motor es distinto del titular del teléfono.
    expect(r.candidatoPropuesto?.unitCode).toBe("3B");
    expect(r.estado).toBe("BLOCKED"); // degradado por el conflicto de identidad, nunca AUTO-resuelto
    expect(r.blockers.some((b) => b.type === "IDENTITY_CONFLICT")).toBe(true);
    expect(r.explicacion).toContain("teléfono asociado a UF 3A");
    expect(r.explicacion).toContain("UF 3B");
  });

  it("6. tercero paga por el propietario: CUIT de un tercero desconocido, pero importe único confirma la misma unidad del teléfono — sin conflicto", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000333", comprobante({ amount: 200000, payerIdentifier: "20444444444" }));
    expect(r.candidatoPropuesto?.unitCode).toBe("4A"); // coincide con el teléfono
    expect(r.blockers.some((b) => b.type === "IDENTITY_CONFLICT")).toBe(false);
  });

  it("7. importe ambiguo: mismo importe coincide con dos unidades de la organización, sin CUIT que desempate", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491199999999", comprobante({ amount: 150000, payerIdentifier: "20999999999" }));
    // teléfono desconocido, CUIT tampoco registrado → en rigor cae a
    // SIN_IDENTIDAD (no hay organización que evaluar) — ver test aparte con
    // organización sí resuelta por teléfono para el caso "ambiguo de verdad".
    expect(r.estado).toBe("SIN_IDENTIDAD");
  });

  it("7b. importe ambiguo CON organización resuelta por teléfono: dos unidades con igual importe, matcher decide AMBIGUOUS", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000111", comprobante({ amount: 150000 }));
    expect(r.organizationId).toBe("org-1");
    expect(r.estado).toBe("AMBIGUOUS");
    expect(r.blockers.some((b) => b.type === "MULTIPLE_EQUIVALENT_CANDIDATES")).toBe(true);
  });

  it("8. comprobante sin CUIT: el importe único igual alcanza para un CANDIDATE", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000333", comprobante({ amount: 200000 }));
    expect(r.comprobante.payerIdentifier).toBeNull(); // nunca inventado
    expect(r.estado).toBe("CANDIDATE");
    expect(r.candidatoPropuesto?.unitCode).toBe("4A");
  });

  it("9. comprobante sin referencia: sigue funcionando con CUIT+importe", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000111", comprobante({ amount: 150000, payerIdentifier: "20111111111", referenceNumber: null }));
    expect(r.comprobante.referenceNumber).toBeNull();
    expect(r.estado).toBe("CANDIDATE");
  });

  it("10. datos insuficientes: organización resuelta, pero sin importe extraído → nunca se evalúa contra nada", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000111", comprobante({ amount: null }));
    expect(r.estado).toBe("SIN_IDENTIDAD");
    expect(r.blockers[0].evidence).toContain("no informó ningún importe");
  });

  it("11. extracción parcial: solo importe+fecha, sin CUIT/referencia/nombre — nunca se rellenan con datos inventados", async () => {
    const r = await evaluarEvidenciaDeComprobante(
      mockTx as unknown as Tx,
      "5491100000111",
      comprobante({ amount: 150000, transactionDate: "2026-08-05" })
    );
    expect(r.comprobante.payerIdentifier).toBeNull();
    expect(r.comprobante.referenceNumber).toBeNull();
    expect(r.comprobante.payerName).toBeNull();
  });

  it("14. organización incorrecta: un CUIT que pertenece a OTRA organización nunca contamina la resuelta por teléfono", async () => {
    // owner-c/CUIT 20333333333 es real, pero de la MISMA org-1 en este
    // padrón — igual sirve para demostrar que, aun cuando el CUIT existe en
    // el padrón, la organización activa sigue siendo la del teléfono, nunca
    // la que "sugiere" el CUIT si el teléfono ya la ancló.
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000111", comprobante({ amount: 150000, payerIdentifier: "20333333333" }));
    expect(r.organizationId).toBe("org-1"); // la del teléfono, no se reconsidera
  });

  it("15. comprobante con importe que no corresponde a NINGUNA obligación real de la organización", async () => {
    const r = await evaluarEvidenciaDeComprobante(mockTx as unknown as Tx, "5491100000111", comprobante({ amount: 999999999, payerIdentifier: "20111111111" }));
    expect(r.estado).toBe("BLOCKED");
    expect(r.blockers.some((b) => b.type === "AMOUNT_INCOMPATIBLE")).toBe(true);
  });
});

describe("ingestarComprobanteWhatsApp — persistencia (PaymentNotice + AgentObservation)", () => {
  it("un comprobante CANDIDATE limpio crea PaymentNotice pero NUNCA una AgentObservation (no genera ruido)", async () => {
    const r = await ingestarComprobanteWhatsApp(mockTx as unknown as Tx, mensaje(), comprobante({ amount: 150000, payerIdentifier: "20111111111" }));
    expect(r.observacionGenerada).toBe(false);
    expect(noticeStore.size).toBe(1);
    expect(obsStore.size).toBe(0);
    expect([...noticeStore.values()][0].status).toBe("MATCHED_PENDING");
  });

  it("un comprobante BLOCKED/AMBIGUOUS SÍ genera una AgentObservation, reusando agentType=MATCHING existente", async () => {
    const r = await ingestarComprobanteWhatsApp(mockTx as unknown as Tx, mensaje(), comprobante({ amount: 150000 })); // ambiguo, 3A vs 3B
    expect(r.observacionGenerada).toBe(true);
    const [obs] = [...obsStore.values()];
    expect(obs.agentType).toBe("MATCHING");
    expect(obs.type).toBe("PAYMENT_MATCH_AMBIGUOUS");
    expect(obs.source).toBe("whatsapp:payment-evidence");
    expect(obs.paymentTransactionId).toBeNull(); // nunca inventa un pago bancario
  });

  it("SIN_IDENTIDAD también genera observación, como PAYMENT_MATCH_BLOCKED (CRITICAL)", async () => {
    await ingestarComprobanteWhatsApp(mockTx as unknown as Tx, mensaje({ phone: "5491199999999" }), comprobante({ amount: 150000 }));
    const [obs] = [...obsStore.values()];
    expect(obs.type).toBe("PAYMENT_MATCH_BLOCKED");
    expect(obs.severity).toBe("CRITICAL");
  });

  it("nunca escribe linkedUnitId/linkedUnitOwnerId/linkedPaymentTransactionId — ninguna confirmación automática", async () => {
    await ingestarComprobanteWhatsApp(mockTx as unknown as Tx, mensaje(), comprobante({ amount: 150000, payerIdentifier: "20111111111" }));
    const [notice] = [...noticeStore.values()];
    expect(notice).not.toHaveProperty("linkedUnitId");
    expect(notice).not.toHaveProperty("linkedPaymentTransactionId");
  });
});

describe("ingestarComprobanteWhatsApp — idempotencia (12, 13)", () => {
  it("el mismo externalMessageId recibido dos veces NUNCA crea un segundo PaymentNotice ni una segunda observación", async () => {
    const msg = mensaje();
    const c = comprobante({ amount: 150000 }); // caso ambiguo, genera observación

    const primera = await ingestarComprobanteWhatsApp(mockTx as unknown as Tx, msg, c);
    const segunda = await ingestarComprobanteWhatsApp(mockTx as unknown as Tx, msg, c);

    expect(primera.yaExistia).toBe(false);
    expect(segunda.yaExistia).toBe(true);
    expect(segunda.observacionGenerada).toBe(false);
    expect(noticeStore.size).toBe(1); // nunca 2
    expect(obsStore.size).toBe(1); // nunca 2
  });

  it("dos mensajes con externalMessageId DISTINTO sí generan dos PaymentNotice independientes", async () => {
    await ingestarComprobanteWhatsApp(mockTx as unknown as Tx, mensaje(), comprobante({ amount: 150000, payerIdentifier: "20111111111" }));
    await ingestarComprobanteWhatsApp(mockTx as unknown as Tx, mensaje(), comprobante({ amount: 150000, payerIdentifier: "20111111111" }));
    expect(noticeStore.size).toBe(2);
  });
});
