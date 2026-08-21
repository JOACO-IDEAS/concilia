import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES_HOST_FRAGMENT } from "@/lib/prisma-safety/entornos";

// Fase 5.13 — tests dedicados a las 2 acciones nuevas de casos ambiguos
// (`listarCasosAmbiguosAction`, `elegirCandidatoAction`,
// `rechazarTodosLosCandidatosAction`), en un archivo separado del de Fase
// 5.12 para no acoplar el fixture de candidato único con el de ambigüedad —
// mismo patrón de mock de Prisma FALSO con métodos mínimos, sin ningún
// método de escritura en `paymentTransaction`/`obligation`/`unit`/
// `unitOwner` (estructural: AUTO/escritura contable imposible desde acá).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

const { mockPrisma, filaAmbigua, filaReconciliationMatch } = vi.hoisted(() => {
  const pagoAmbiguoReal = {
    id: "pay-ambiguo",
    organizationId: "org-1",
    amount: { toNumber: () => 100000 },
    currency: "ARS",
    transactionDate: new Date("2026-01-01T00:00:00.000Z"),
    payerIdentifier: null as string | null,
    referenceNumber: null as string | null,
    concept: "UF 2B/3A pago expensas agosto",
    organization: { name: "[FIXTURE] Consorcio Test" },
  };

  const filaAmbigua = {
    id: "eval-ambiguo",
    paymentTransactionId: "pay-ambiguo",
    engineVersion: "5.7.0",
    state: "NEEDS_DECISION",
    candidateUnitId: null as string | null,
    families: [{ family: "BANK_MOVEMENT", nature: "NEGATIVE", present: true, unitId: null, unitCode: null, score: null, tier: null, detail: "" }],
    independentFamiliesConverging: [] as string[],
    hasContradiction: false,
    contradictionDetail: null as string | null,
    explanation: "Hay más de una unidad compatible. Falta evidencia que permita diferenciarlas.",
    structuredEvidence: {
      bank: {
        signals: [],
        blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "2 candidatos con evidencia comparable." }],
        topCandidates: [
          { unitCode: "2B", score: 40, tier: 3, matchedSignals: ["AMOUNT_MATCH"] },
          { unitCode: "3A", score: 38, tier: 3, matchedSignals: ["AMOUNT_MATCH"] },
        ],
      },
      whatsapp: null,
    },
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

  const unidadesReales = [
    { id: "unit-2B", code: "2B", organizationId: "org-1" },
    { id: "unit-3A", code: "3A", organizationId: "org-1" },
  ];

  const mockPrisma = {
    paymentEvidenceAssessmentLog: {
      findMany: vi.fn(async () => [filaAmbigua]),
      findFirst: vi.fn(async ({ where }: { where: { paymentTransactionId: string; candidateUnitId: null } }) =>
        where.paymentTransactionId === filaAmbigua.paymentTransactionId && where.candidateUnitId === null ? filaAmbigua : null
      ),
    },
    reconciliationMatch: {
      findMany: vi.fn(async () => reconciliationMatchesCreados.map((f) => ({ paymentTransactionId: f.data.paymentTransactionId, unitId: f.data.unitId, decision: f.decision }))),
      count: vi.fn(async () => 1),
      create: vi.fn(async ({ data }: { data: DatosDecisionCreada }) => {
        const fila = { id: `match-${reconciliationMatchesCreados.length + 1}`, decision: data.decision, createdAt: new Date(), data };
        reconciliationMatchesCreados.push(fila);
        return fila;
      }),
    },
    paymentTransaction: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "pay-ambiguo" ? { organizationId: "org-1" } : null)),
      findMany: vi.fn(async () => [pagoAmbiguoReal]),
    },
    unit: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (unidadesReales.some((u) => u.id === where.id) ? { organizationId: "org-1", obligations: [] } : null)),
      findMany: vi.fn(async ({ where }: { where: { organizationId: string; code: { in: string[] } } }) =>
        unidadesReales.filter((u) => u.organizationId === where.organizationId && where.code.in.includes(u.code))
      ),
    },
  };

  const mockPrismaConTransaccion = { ...mockPrisma, $transaction: vi.fn((cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma)) };
  return { mockPrisma: mockPrismaConTransaccion, filaAmbigua, filaReconciliationMatch: reconciliationMatchesCreados };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: vi.fn(async () => ({ id: "admin-1", email: "admin@example.com", name: "Admin" })) }));
vi.mock("@/lib/auth/organization-access", () => ({ requireOrganizationAccess: vi.fn(async () => ({ administrator: { id: "admin-1" }, organizationId: "org-1" })) }));
vi.mock("@/lib/product-observability/runtime", () => ({ appendProductEventSafely: vi.fn().mockResolvedValue(true) }));
const { mockLearnFromConfirmation } = vi.hoisted(() => ({ mockLearnFromConfirmation: vi.fn().mockResolvedValue({ status: "LEARNED" }) }));
vi.mock("@/lib/payer-identity/human-confirmation-learning-runtime", () => ({ learnFromPersistedHumanConfirmation: mockLearnFromConfirmation }));

const { listarCasosAmbiguosAction, elegirCandidatoAction, rechazarTodosLosCandidatosAction } = await import("./human-review-actions");
const { inferirProvenanceDeDecision } = await import("@/lib/calibration/decision-provenance");

beforeEach(() => {
  filaReconciliationMatch.length = 0;
  vi.clearAllMocks();
  mockPrisma.paymentEvidenceAssessmentLog.findMany.mockImplementation(async () => [filaAmbigua]);
  mockPrisma.paymentEvidenceAssessmentLog.findFirst.mockImplementation(async ({ where }: { where: { paymentTransactionId: string; candidateUnitId: null } }) =>
    where.paymentTransactionId === filaAmbigua.paymentTransactionId && where.candidateUnitId === null ? filaAmbigua : null
  );
  mockPrisma.reconciliationMatch.findMany.mockImplementation(async () => filaReconciliationMatch.map((f) => ({ paymentTransactionId: f.data.paymentTransactionId, unitId: f.data.unitId, decision: f.decision })));
  mockPrisma.reconciliationMatch.create.mockImplementation(async ({ data }: { data: (typeof filaReconciliationMatch)[number]["data"] }) => {
    const fila = { id: `match-${filaReconciliationMatch.length + 1}`, decision: data.decision, createdAt: new Date(), data };
    filaReconciliationMatch.push(fila);
    return fila;
  });
  mockPrisma.paymentTransaction.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "pay-ambiguo" ? { organizationId: "org-1" } : null));
  mockLearnFromConfirmation.mockResolvedValue({ status: "LEARNED" });
});

describe("listarCasosAmbiguosAction", () => {
  it("encuentra el caso ambiguo real y lo enriquece con datos de pago/organización", async () => {
    const casos = await listarCasosAmbiguosAction();
    expect(casos).toHaveLength(1);
    expect(casos[0].paymentTransactionId).toBe("pay-ambiguo");
    expect(casos[0].candidatos).toHaveLength(2);
    expect(casos[0].organizationName).toBe("[FIXTURE] Consorcio Test");
    expect(casos[0].amount).toBe(100000);
  });

  it("un caso ya decidido (cualquier unidad) no vuelve a aparecer", async () => {
    mockPrisma.reconciliationMatch.findMany.mockImplementationOnce(async () => [{ paymentTransactionId: "pay-ambiguo", unitId: "unit-2B", decision: "APPROVED" }]);
    expect(await listarCasosAmbiguosAction()).toEqual([]);
  });

  it("nunca se mezcla con listarCasosRevisablesAction (candidateUnitId null → siempre camino ambiguo)", async () => {
    const casos = await listarCasosAmbiguosAction();
    expect(casos[0]).not.toHaveProperty("unitCode"); // el DTO de candidato único tiene unitCode singular; este no
  });
});

describe("elegirCandidatoAction", () => {
  it("procesa learning desde el APPROVED persistido para el candidato elegido", async () => {
    await elegirCandidatoAction("pay-ambiguo", "2B");
    expect(mockLearnFromConfirmation).toHaveBeenCalledWith("match-1", "admin-1");
  });
  it("registra APPROVED con el unitId real resuelto y el score real del candidato elegido", async () => {
    const r = await elegirCandidatoAction("pay-ambiguo", "2B");
    expect(r.ok).toBe(true);
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(data.decision).toBe("APPROVED");
    expect(data.unitId).toBe("unit-2B");
    expect(data.score).toBe(40);
    expect(data.signals).toEqual([]); // limitación real documentada — nunca se fabrica un Signal[] detallado acá
    expect(data.reason).toContain("AMOUNT_MATCH"); // la señal real queda preservada en texto
  });

  it("un unitCode que no está entre los candidatos reales → falla, no escribe nada", async () => {
    const r = await elegirCandidatoAction("pay-ambiguo", "9Z");
    expect(r.ok).toBe(false);
    expect(mockPrisma.reconciliationMatch.create).not.toHaveBeenCalled();
  });

  it("si no hay ninguna evaluación ambigua real para el pago, falla sin escribir", async () => {
    const r = await elegirCandidatoAction("pay-inexistente", "2B");
    expect(r.ok).toBe(false);
    expect(mockPrisma.reconciliationMatch.create).not.toHaveBeenCalled();
  });

  it("si la Unit real ya no existe (dato inconsistente), falla sin escribir — nunca se inventa un unitId", async () => {
    mockPrisma.unit.findMany.mockImplementationOnce(async () => []);
    const r = await elegirCandidatoAction("pay-ambiguo", "2B");
    expect(r.ok).toBe(false);
    expect(mockPrisma.reconciliationMatch.create).not.toHaveBeenCalled();
  });

  it("en producción confirmada, produce provenance ORGANIC", async () => {
    await conEntorno(HOST_PRODUCCION, () => elegirCandidatoAction("pay-ambiguo", "2B"));
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(inferirProvenanceDeDecision(data.reason, data.rejectionReason)).toBe("ORGANIC");
  });

  it("en dev-fixtures, nunca es ORGANIC — siempre SYNTHETIC_DEMO", async () => {
    await conEntorno(HOST_FIXTURES, () => elegirCandidatoAction("pay-ambiguo", "2B"));
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];
    expect(inferirProvenanceDeDecision(data.reason, data.rejectionReason)).toBe("SYNTHETIC_DEMO");
  });

  it("la acción primaria no escribe recursos contables fuera de reconciliationMatch.create", async () => {
    await elegirCandidatoAction("pay-ambiguo", "2B");
    expect(mockPrisma.paymentTransaction).not.toHaveProperty("update");
    expect(mockPrisma.unit).not.toHaveProperty("update");
    expect(mockPrisma).not.toHaveProperty("obligation");
    expect(mockPrisma).not.toHaveProperty("unitOwner");
  });
});

describe("rechazarTodosLosCandidatosAction", () => {
  it("registra UN REJECTED por cada candidato real, con el mismo motivo preservado", async () => {
    const r = await rechazarTodosLosCandidatosAction("pay-ambiguo", "Ninguno corresponde, el titular real no tiene unidad entre estas.");
    expect(r.ok).toBe(true);
    expect(mockPrisma.reconciliationMatch.create).toHaveBeenCalledTimes(2);
    const unitIds = mockPrisma.reconciliationMatch.create.mock.calls.map(([{ data }]) => data.unitId).sort();
    expect(unitIds).toEqual(["unit-2B", "unit-3A"]);
    for (const [{ data }] of mockPrisma.reconciliationMatch.create.mock.calls) {
      expect(data.decision).toBe("REJECTED");
      expect(data.rejectionReason).toContain("Ninguno corresponde, el titular real no tiene unidad entre estas.");
    }
  });

  it("motivo vacío → falla sin escribir nada", async () => {
    const r = await rechazarTodosLosCandidatosAction("pay-ambiguo", "   ");
    expect(r.ok).toBe(false);
    expect(mockPrisma.reconciliationMatch.create).not.toHaveBeenCalled();
  });

  it("en dev-fixtures, ambos rechazos quedan SYNTHETIC_DEMO — nunca ORGANIC", async () => {
    await conEntorno(HOST_FIXTURES, () => rechazarTodosLosCandidatosAction("pay-ambiguo", "motivo real de prueba"));
    for (const [{ data }] of mockPrisma.reconciliationMatch.create.mock.calls) {
      expect(inferirProvenanceDeDecision(data.reason, data.rejectionReason)).toBe("SYNTHETIC_DEMO");
    }
  });

  it("en producción confirmada, ambos rechazos quedan ORGANIC", async () => {
    await conEntorno(HOST_PRODUCCION, () => rechazarTodosLosCandidatosAction("pay-ambiguo", "motivo real de prueba"));
    for (const [{ data }] of mockPrisma.reconciliationMatch.create.mock.calls) {
      expect(inferirProvenanceDeDecision(data.reason, data.rejectionReason)).toBe("ORGANIC");
    }
  });

  it("decision nunca es AUTO — siempre REJECTED en este camino", async () => {
    await rechazarTodosLosCandidatosAction("pay-ambiguo", "motivo real");
    const decisiones = mockPrisma.reconciliationMatch.create.mock.calls.map(([{ data }]) => data.decision);
    expect(decisiones.every((d) => d === "REJECTED")).toBe(true);
  });
});

describe("integración con el pipeline de calibración (Fase 5.10/5.11)", () => {
  it("elegir un candidato ambiguo produce, leído de vuelta, un CalibrationCase HUMAN_CONFIRMED + provenance según entorno", async () => {
    const { construirDatasetDeCalibracion } = await import("@/lib/calibration/dataset");
    await conEntorno(HOST_PRODUCCION, () => elegirCandidatoAction("pay-ambiguo", "2B"));
    const [{ data }] = mockPrisma.reconciliationMatch.create.mock.calls[0];

    // La evaluación real vinculable para dataset.ts es la que tiene candidateUnitId=unitId elegido —
    // en la vida real, esto requeriría una NUEVA evaluación del motor sobre esa unidad puntual (fuera
    // de alcance de este test unitario); acá se simula esa evaluación posterior con los mismos datos
    // reales del candidato elegido, para verificar que EL VÍNCULO funciona con el módulo real de Fase 5.10.
    const evaluacionPosterior = {
      id: "eval-posterior",
      paymentTransactionId: "pay-ambiguo",
      engineVersion: "5.7.0",
      state: "PRE_CONCILIABLE" as const,
      candidateUnitId: "unit-2B",
      families: [{ family: "BANK_MOVEMENT" as const, nature: "POSITIVE" as const, present: true, unitId: "unit-2B", unitCode: "2B", score: 40, tier: 3 as const, detail: "" }],
      independentFamiliesConverging: [],
      hasContradiction: false,
      contradictionDetail: null,
      explanation: "",
      structuredEvidence: null,
      evaluatedAt: "2026-01-03T00:00:00.000Z",
    };

    const [caso] = construirDatasetDeCalibracion(
      [evaluacionPosterior],
      [{ id: "match-1", paymentTransactionId: data.paymentTransactionId, unitId: data.unitId, decision: data.decision, createdAt: new Date(Date.now() + 1000).toISOString(), reason: data.reason, rejectionReason: data.rejectionReason }]
    );

    expect(caso.groundTruth).toBe("HUMAN_CONFIRMED");
    expect(caso.humanDecisionProvenance).toBe("ORGANIC");
  });
});
