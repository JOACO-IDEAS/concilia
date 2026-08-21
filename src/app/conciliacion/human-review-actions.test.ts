import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES_HOST_FRAGMENT } from "@/lib/prisma-safety/entornos";

// Fase 5.12 — human-review-actions.ts contra un delegate de Prisma FALSO que
// expone ÚNICAMENTE los métodos que el código realmente usa —
// DELIBERADAMENTE sin ningún método de escritura en `paymentTransaction`,
// `obligation`, `unit` ni `unitOwner` (solo `findMany`/`findUnique`/
// `findFirst` de lectura). Si esta capa alguna vez intentara escribir algo
// fuera de `reconciliationMatch.create`, explotaría en runtime — prueba
// estructural de que la única escritura funcional de esta fase es la
// decisión humana (Regla de Seguridad del pedido), y de que AUTO es
// imposible (ningún delegate de escritura alcanzable salvo ReconciliationMatch).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Fase 5.12 — pedido explícito posterior del usuario: "jamás etiquetar una
// decisión sobre fixtures como ORGANIC". La provenance ahora depende del
// ENTORNO conectado, no solo del texto — estos tests controlan
// explícitamente qué host "ve" `entornoActual()` (vía DATABASE_URL/
// DIRECT_URL/DATABASE_URL_UNPOOLED), en vez de depender del `.env` real de
// quien corre la suite.
const HOST_PRODUCCION = "postgresql://u:p@ep-broad-unit-aw04mt2w-pooler.c-12.us-east-1.aws.neon.tech/db";
const HOST_FIXTURES = `postgresql://u:p@${FIXTURES_HOST_FRAGMENT}-pooler.c-12.us-east-1.aws.neon.tech/db`;

async function conEntorno<T>(databaseUrl: string | undefined, fn: () => Promise<T>): Promise<T> {
  const originales = { DIRECT_URL: process.env.DIRECT_URL, DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED, DATABASE_URL: process.env.DATABASE_URL };
  delete process.env.DIRECT_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  if (databaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = databaseUrl;
  try {
    return await fn();
  } finally {
    if (originales.DIRECT_URL === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = originales.DIRECT_URL;
    if (originales.DATABASE_URL_UNPOOLED === undefined) delete process.env.DATABASE_URL_UNPOOLED;
    else process.env.DATABASE_URL_UNPOOLED = originales.DATABASE_URL_UNPOOLED;
    if (originales.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originales.DATABASE_URL;
  }
}

const { mockPrisma, filaPaymentEvidence, filaReconciliationMatch } = vi.hoisted(() => {
  const paymentTransactionReal = {
    id: "pay-1",
    amount: { toNumber: () => 150000 },
    currency: "ARS",
    transactionDate: new Date("2026-01-01T00:00:00.000Z"),
    payerIdentifier: "20-99910301-1",
    referenceNumber: "REF-123",
    concept: "Expensas Agosto",
  };
  const unitReal = { id: "unit-1", code: "3A", organization: { name: "Consorcio Beta" } };

  interface FilaPaymentEvidence {
    id: string;
    paymentTransactionId: string;
    engineVersion: string;
    state: string;
    candidateUnitId: string | null;
    families: { family: string; nature: string; present: boolean; unitId: string; unitCode: string; score: number; tier: number; detail: string }[];
    independentFamiliesConverging: string[];
    hasContradiction: boolean;
    contradictionDetail: string | null;
    explanation: string;
    structuredEvidence: unknown;
    evaluatedAt: Date;
    createdAt: Date;
  }

  const filaPaymentEvidence: FilaPaymentEvidence = {
    id: "eval-1",
    paymentTransactionId: "pay-1",
    engineVersion: "5.7.0",
    state: "PRE_CONCILIABLE",
    candidateUnitId: "unit-1",
    families: [{ family: "BANK_MOVEMENT", nature: "POSITIVE", present: true, unitId: "unit-1", unitCode: "3A", score: 99, tier: 1, detail: "" }],
    independentFamiliesConverging: ["BANK_MOVEMENT"],
    hasContradiction: false,
    contradictionDetail: null,
    explanation: "Movimiento identificado.",
    structuredEvidence: { bank: { signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "CUIT coincide" }], blockers: [], topCandidates: null }, whatsapp: null },
    evaluatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
  };

  interface DatosDecisionCreada {
    paymentTransactionId: string;
    unitId: string;
    obligationId: string | null;
    decision: string;
    score: number | null;
    signals: unknown;
    reason: string;
    decidedBy: string | null;
    rejectionReason: string | null;
  }

  const reconciliationMatchesCreados: { id: string; decision: string; createdAt: Date; data: DatosDecisionCreada }[] = [];
  let contador = 0;

  const mockPrisma = {
    paymentEvidenceAssessmentLog: {
      findMany: vi.fn(async () => [filaPaymentEvidence]),
      findFirst: vi.fn(async ({ where }: { where: { paymentTransactionId: string; candidateUnitId: string } }) =>
        where.paymentTransactionId === filaPaymentEvidence.paymentTransactionId && where.candidateUnitId === filaPaymentEvidence.candidateUnitId
          ? filaPaymentEvidence
          : null
      ),
    },
    reconciliationMatch: {
      findMany: vi.fn(async () => reconciliationMatchesCreados.map((f) => ({ paymentTransactionId: f.data.paymentTransactionId, unitId: f.data.unitId, decision: f.decision }))),
      count: vi.fn(async () => 1),
      create: vi.fn(async ({ data }: { data: DatosDecisionCreada }) => {
        contador++;
        const fila = { id: `match-${contador}`, decision: data.decision, createdAt: new Date(), data };
        reconciliationMatchesCreados.push(fila);
        return fila;
      }),
    },
    paymentTransaction: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "pay-1" ? { id: "pay-1", organizationId: "org-1" } : null)),
      findMany: vi.fn(async () => [paymentTransactionReal]),
    },
    unit: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "unit-1" ? { organizationId: "org-1", obligations: [] } : null)),
      findMany: vi.fn(async () => [unitReal]),
    },
  };

  // registrarDecisionHumana() recibe `tx` como si fuera un
  // Prisma.TransactionClient — acá simplemente le pasamos el mismo mock
  // (mismo patrón ya usado en statement-actions.test.ts).
  const mockPrismaConTransaccion = { ...mockPrisma, $transaction: vi.fn((cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma)) };

  return { mockPrisma: mockPrismaConTransaccion, filaPaymentEvidence, filaReconciliationMatch: reconciliationMatchesCreados };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: vi.fn(async () => ({ id: "admin-1", email: "admin@example.com", name: "Admin" })) }));
vi.mock("@/lib/auth/organization-access", () => ({ requireOrganizationAccess: vi.fn(async () => ({ administrator: { id: "admin-1" }, organizationId: "org-1" })) }));
const { mockAppendProductEventSafely } = vi.hoisted(() => ({ mockAppendProductEventSafely: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/product-observability/runtime", () => ({ appendProductEventSafely: mockAppendProductEventSafely }));

const { listarCasosRevisablesAction, aprobarDecisionHumanaAction, rechazarDecisionHumanaAction } = await import("./human-review-actions");
const { inferirProvenanceDeDecision } = await import("@/lib/calibration/decision-provenance");

beforeEach(() => {
  filaReconciliationMatch.length = 0;
  vi.clearAllMocks();
  mockPrisma.paymentEvidenceAssessmentLog.findMany.mockImplementation(async () => [filaPaymentEvidence]);
  mockPrisma.paymentEvidenceAssessmentLog.findFirst.mockImplementation(async ({ where }: { where: { paymentTransactionId: string; candidateUnitId: string } }) =>
    where.paymentTransactionId === filaPaymentEvidence.paymentTransactionId && where.candidateUnitId === filaPaymentEvidence.candidateUnitId ? filaPaymentEvidence : null
  );
  mockPrisma.reconciliationMatch.findMany.mockImplementation(async () => filaReconciliationMatch.map((f) => ({ paymentTransactionId: f.data.paymentTransactionId, unitId: f.data.unitId, decision: f.decision })));
  mockPrisma.reconciliationMatch.create.mockImplementation(async ({ data }: { data: (typeof filaReconciliationMatch)[number]["data"] }) => {
    const fila = { id: `match-${filaReconciliationMatch.length + 1}`, decision: data.decision, createdAt: new Date(), data };
    filaReconciliationMatch.push(fila);
    return fila;
  });
  mockPrisma.paymentTransaction.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "pay-1" ? { id: "pay-1", organizationId: "org-1" } : null));
  mockPrisma.unit.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "unit-1" ? { organizationId: "org-1", obligations: [] } : null));
});

describe("listarCasosRevisablesAction", () => {
  // Escenario #1: la review queue encuentra candidatos reales.
  it("encuentra el caso real revisable y lo enriquece con datos de pago/unidad", async () => {
    const casos = await listarCasosRevisablesAction();
    expect(casos).toHaveLength(1);
    expect(casos[0].paymentTransactionId).toBe("pay-1");
    expect(casos[0].candidateUnitId).toBe("unit-1");
    expect(casos[0].unitCode).toBe("3A");
    expect(casos[0].amount).toBe(150000);
  });

  // Escenario #2: un caso sin candidato no aparece.
  it("un caso sin candidateUnitId no aparece en la cola", async () => {
    mockPrisma.paymentEvidenceAssessmentLog.findMany.mockImplementationOnce(async () => [{ ...filaPaymentEvidence, candidateUnitId: null, state: "NEEDS_DATA" }]);
    const casos = await listarCasosRevisablesAction();
    expect(casos).toEqual([]);
  });

  // Escenario #3: se muestra correctamente score/evidence.
  it("expone score, tier y señales estructuradas reales", async () => {
    const [caso] = await listarCasosRevisablesAction();
    expect(caso.score).toBe(99);
    expect(caso.tier).toBe(1);
    expect(caso.structuredEvidence?.bank?.signals[0].signal).toBe("CUIT_EXACT");
  });

  it("un caso ya decidido no vuelve a aparecer", async () => {
    mockPrisma.reconciliationMatch.findMany.mockImplementationOnce(async () => [{ paymentTransactionId: "pay-1", unitId: "unit-1", decision: "APPROVED" }]);
    const casos = await listarCasosRevisablesAction();
    expect(casos).toEqual([]);
  });
});

describe("aprobarDecisionHumanaAction", () => {
  // Escenario #4: APPROVE llama registrarDecisionHumana correctamente.
  it("registra una fila APPROVED con score/signals reales de la evaluación", async () => {
    const r = await aprobarDecisionHumanaAction("pay-1", "unit-1");
    expect(r.ok).toBe(true);
    expect(mockPrisma.reconciliationMatch.create).toHaveBeenCalledTimes(1);
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(data.decision).toBe("APPROVED");
    expect(data.paymentTransactionId).toBe("pay-1");
    expect(data.unitId).toBe("unit-1");
    expect(data.score).toBe(99);
  });

  it("emite actividad sólo después de persistir APPROVED, con identidad server-side y metadata mínima", async () => {
    await aprobarDecisionHumanaAction("pay-1", "unit-1");

    expect(mockPrisma.reconciliationMatch.create).toHaveBeenCalledTimes(1);
    expect(mockAppendProductEventSafely).toHaveBeenCalledWith({ administratorId: "admin-1", organizationId: "org-1", type: "CASE_APPROVED", metadata: { paymentTransactionId: "pay-1" } });
  });

  // Escenario #6: APPROVE produce provenance ORGANIC — SOLO cuando el
  // entorno conectado se confirma "production" (pedido explícito posterior
  // del usuario: nunca ORGANIC sobre fixtures, sin importar el texto).
  it("con entorno=production confirmado, el reason escrito produce provenance ORGANIC", async () => {
    await conEntorno(HOST_PRODUCCION, async () => {
      await aprobarDecisionHumanaAction("pay-1", "unit-1");
    });
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(inferirProvenanceDeDecision(data.reason, data.rejectionReason)).toBe("ORGANIC");
  });

  it("con entorno=fixtures, la MISMA aprobación NUNCA es ORGANIC — se marca automáticamente SYNTHETIC_DEMO", async () => {
    await conEntorno(HOST_FIXTURES, async () => {
      await aprobarDecisionHumanaAction("pay-1", "unit-1");
    });
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(inferirProvenanceDeDecision(data.reason, data.rejectionReason)).toBe("SYNTHETIC_DEMO");
    expect(data.reason).toContain("[SYNTHETIC_DEMO]");
  });

  it("con entorno ambiguo/desconocido (sin URL reconocible), tampoco es nunca ORGANIC — default seguro", async () => {
    await conEntorno(undefined, async () => {
      await aprobarDecisionHumanaAction("pay-1", "unit-1");
    });
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(inferirProvenanceDeDecision(data.reason, data.rejectionReason)).toBe("SYNTHETIC_DEMO");
  });

  // Escenario #9-12: no modifica PaymentTransaction/Obligation/Unit/UnitOwner.
  it("nunca llama ningún método de escritura fuera de reconciliationMatch.create", async () => {
    await aprobarDecisionHumanaAction("pay-1", "unit-1");
    expect(mockPrisma.paymentTransaction).not.toHaveProperty("update");
    expect(mockPrisma.paymentTransaction).not.toHaveProperty("create");
    expect(mockPrisma).not.toHaveProperty("obligation");
    expect(mockPrisma.unit).not.toHaveProperty("update");
    expect(mockPrisma).not.toHaveProperty("unitOwner"); // Escenario #12 — ni siquiera el delegate existe en el mock
  });

  // Escenario #18: nunca se confunde una decisión real con una sintética —
  // en producción confirmada, el texto no debe contener NINGÚN marcador que
  // decision-provenance.ts (Fase 5.11) reconozca como SYNTHETIC_DEMO.
  it("en producción confirmada, el texto escrito no contiene ningún marcador sintético", async () => {
    await conEntorno(HOST_PRODUCCION, async () => {
      await aprobarDecisionHumanaAction("pay-1", "unit-1");
    });
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(data.reason).not.toContain("SINTÉTICA");
    expect(data.reason).not.toContain("[SYNTHETIC_DEMO]");
  });

  it("si no hay ninguna evaluación real para ese pago+unidad, falla explícitamente sin escribir nada", async () => {
    const r = await aprobarDecisionHumanaAction("pay-inexistente", "unit-1");
    expect(r.ok).toBe(false);
    expect(mockPrisma.reconciliationMatch.create).not.toHaveBeenCalled();
  });
});

describe("rechazarDecisionHumanaAction — observabilidad", () => {
  it("emite CASE_REJECTED únicamente después de persistir REJECTED", async () => {
    await rechazarDecisionHumanaAction("pay-1", "unit-1", "No corresponde.");

    expect(mockPrisma.reconciliationMatch.create).toHaveBeenCalledTimes(1);
    expect(mockAppendProductEventSafely).toHaveBeenCalledWith({ administratorId: "admin-1", organizationId: "org-1", type: "CASE_REJECTED", metadata: { paymentTransactionId: "pay-1" } });
  });
});

describe("rechazarDecisionHumanaAction", () => {
  // Escenario #5/#8: REJECT llama registrarDecisionHumana correctamente y
  // preserva el motivo — en producción confirmada, el motivo queda tal cual
  // lo escribió el administrador, sin ningún marcador.
  it("en producción confirmada, registra una fila REJECTED con el motivo escrito tal cual", async () => {
    const r = await conEntorno(HOST_PRODUCCION, () => rechazarDecisionHumanaAction("pay-1", "unit-1", "No corresponde a esta unidad"));
    expect(r.ok).toBe(true);
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(data.decision).toBe("REJECTED");
    expect(data.rejectionReason).toBe("No corresponde a esta unidad");
  });

  // Escenario #7: REJECT produce provenance ORGANIC — solo en producción confirmada.
  it("con entorno=production confirmado, el rechazo produce provenance ORGANIC", async () => {
    await conEntorno(HOST_PRODUCCION, () => rechazarDecisionHumanaAction("pay-1", "unit-1", "No corresponde a esta unidad"));
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(inferirProvenanceDeDecision(data.reason, data.rejectionReason)).toBe("ORGANIC");
  });

  it("con entorno=fixtures, el motivo real queda preservado PERO la provenance nunca es ORGANIC", async () => {
    await conEntorno(HOST_FIXTURES, () => rechazarDecisionHumanaAction("pay-1", "unit-1", "No corresponde a esta unidad"));
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(data.rejectionReason).toContain("No corresponde a esta unidad"); // auditabilidad: el motivo real nunca se pierde
    expect(inferirProvenanceDeDecision(data.reason, data.rejectionReason)).toBe("SYNTHETIC_DEMO");
  });

  // Escenario #8: el motivo de rechazo queda preservado (ya cubierto arriba, más explícito acá).
  it("un motivo vacío o solo espacios se rechaza sin escribir nada", async () => {
    const r = await rechazarDecisionHumanaAction("pay-1", "unit-1", "   ");
    expect(r.ok).toBe(false);
    expect(mockPrisma.reconciliationMatch.create).not.toHaveBeenCalled();
  });

  // Escenario #13: no existe camino AUTO.
  it("decision nunca es configurable externamente — siempre APPROVED o REJECTED, nunca AUTO", async () => {
    await aprobarDecisionHumanaAction("pay-1", "unit-1");
    await rechazarDecisionHumanaAction("pay-1", "unit-1", "motivo real");
    const decisiones = mockPrisma.reconciliationMatch.create.mock.calls.map(([{ data }]) => data.decision);
    expect(decisiones.every((d) => d === "APPROVED" || d === "REJECTED")).toBe(true);
  });
});

// Escenarios #14/#15/#17: la decisión escrita por esta capa, leída de vuelta
// como el pipeline de calibración real (Fase 5.10/5.11) la leería, produce
// un CalibrationCase con groundTruth HUMAN_CONFIRMED/HUMAN_REJECTED y
// humanDecisionProvenance ORGANIC — el loop MOTOR→HUMANO→ORGANIC→CALIBRACIÓN
// queda cerrado, verificado con los módulos REALES de dataset.ts (no un
// mock de esa parte).
describe("integración con el pipeline de calibración (Fase 5.10/5.11)", () => {
  it("una APPROVED escrita acá EN PRODUCCIÓN produce un CalibrationCase HUMAN_CONFIRMED + ORGANIC", async () => {
    const { construirDatasetDeCalibracion } = await import("@/lib/calibration/dataset");
    await conEntorno(HOST_PRODUCCION, () => aprobarDecisionHumanaAction("pay-1", "unit-1"));
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];

    const [caso] = construirDatasetDeCalibracion(
      [
        {
          id: filaPaymentEvidence.id,
          paymentTransactionId: filaPaymentEvidence.paymentTransactionId,
          engineVersion: filaPaymentEvidence.engineVersion,
          state: filaPaymentEvidence.state as never,
          candidateUnitId: filaPaymentEvidence.candidateUnitId,
          families: filaPaymentEvidence.families as never,
          independentFamiliesConverging: filaPaymentEvidence.independentFamiliesConverging as never,
          hasContradiction: filaPaymentEvidence.hasContradiction,
          contradictionDetail: filaPaymentEvidence.contradictionDetail,
          explanation: filaPaymentEvidence.explanation,
          structuredEvidence: filaPaymentEvidence.structuredEvidence as never,
          evaluatedAt: filaPaymentEvidence.evaluatedAt.toISOString(),
        },
      ],
      [{ id: "match-1", paymentTransactionId: data.paymentTransactionId, unitId: data.unitId, decision: data.decision, createdAt: new Date().toISOString(), reason: data.reason, rejectionReason: data.rejectionReason }]
    );

    expect(caso.groundTruth).toBe("HUMAN_CONFIRMED");
    expect(caso.humanDecisionProvenance).toBe("ORGANIC");
    expect(caso.origin).toBe("REAL");
  });

  // Escenario #16 (parcial — la parte de PREVIOUSLY_REJECTED en sí misma vive
  // en deterministic-matcher.ts, sin tocar; acá se confirma que el REJECTED
  // que esta capa escribe tiene EXACTAMENTE la forma que esa query real lee:
  // `{paymentTransactionId, unitId, decision:"REJECTED"}`).
  it("una REJECTED escrita acá tiene la forma exacta que deterministic-matcher.ts:134 consulta para PREVIOUSLY_REJECTED", async () => {
    // Nota: esta forma (paymentTransactionId+unitId+decision) es la misma
    // sin importar el entorno — PREVIOUSLY_REJECTED debe funcionar incluso
    // sobre un rechazo de prueba en fixtures, por eso no se fuerza HOST_PRODUCCION acá.
    await rechazarDecisionHumanaAction("pay-1", "unit-1", "No corresponde a esta unidad");
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect({ paymentTransactionId: data.paymentTransactionId, unitId: data.unitId, decision: data.decision }).toEqual({
      paymentTransactionId: "pay-1",
      unitId: "unit-1",
      decision: "REJECTED",
    });
  });

  it("una REJECTED escrita acá EN PRODUCCIÓN produce un CalibrationCase HUMAN_REJECTED + ORGANIC", async () => {
    const { construirDatasetDeCalibracion } = await import("@/lib/calibration/dataset");
    await conEntorno(HOST_PRODUCCION, () => rechazarDecisionHumanaAction("pay-1", "unit-1", "No corresponde a esta unidad"));
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];

    const [caso] = construirDatasetDeCalibracion(
      [
        {
          id: filaPaymentEvidence.id,
          paymentTransactionId: filaPaymentEvidence.paymentTransactionId,
          engineVersion: filaPaymentEvidence.engineVersion,
          state: filaPaymentEvidence.state as never,
          candidateUnitId: filaPaymentEvidence.candidateUnitId,
          families: filaPaymentEvidence.families as never,
          independentFamiliesConverging: filaPaymentEvidence.independentFamiliesConverging as never,
          hasContradiction: filaPaymentEvidence.hasContradiction,
          contradictionDetail: filaPaymentEvidence.contradictionDetail,
          explanation: filaPaymentEvidence.explanation,
          structuredEvidence: filaPaymentEvidence.structuredEvidence as never,
          evaluatedAt: filaPaymentEvidence.evaluatedAt.toISOString(),
        },
      ],
      [{ id: "match-1", paymentTransactionId: data.paymentTransactionId, unitId: data.unitId, decision: data.decision, createdAt: new Date().toISOString(), reason: data.reason, rejectionReason: data.rejectionReason }]
    );

    expect(caso.groundTruth).toBe("HUMAN_REJECTED");
    expect(caso.humanDecisionProvenance).toBe("ORGANIC");
  });
});
