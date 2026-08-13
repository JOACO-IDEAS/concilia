import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 5.10 — loader.ts contra un delegate de Prisma FALSO que expone
// ÚNICAMENTE `findMany` en `paymentEvidenceAssessmentLog`, `reconciliationMatch`
// y `shadowMatchLog` — DELIBERADAMENTE sin `create`/`update`/`upsert`/`delete`.
// Si loader.ts alguna vez intentara escribir algo, explotaría en runtime
// ("Cannot read properties of undefined") — prueba estructural del
// Escenario #17 (ninguna mutación de datos de producción/fixtures posible
// desde este módulo) y, junto con no exponer ningún otro delegate
// (`obligation`, `unitOwner`), del Escenario #18 (AUTO imposible: no
// hay ningún camino de escritura para producir un CandidateStatus.AUTO ni
// para tocar Obligation/Unit/UnitOwner desde acá).
//
// Fase 5.13 — `paymentTransaction`/`unit` se agregan al mock, TAMBIÉN solo
// con `findMany` — necesarios para resolver `topCandidates.unitCode →
// Unit.id` real de evaluaciones ambiguas (`resolverCandidatosAmbiguosPorEvaluacionId`).
// La garantía estructural no cambia: sigue sin existir NINGÚN método de
// escritura alcanzable desde loader.ts, solo crece el número de delegates
// de LECTURA.

const { mockPrisma, filaAmbigua } = vi.hoisted(() => {
  interface FilaEvaluacionMock {
    id: string;
    paymentTransactionId: string;
    engineVersion: string;
    state: string;
    candidateUnitId: string | null;
    families: { family: string; nature: string; present: boolean; unitId: string | null; unitCode: string | null; score: number | null; tier: number | null; detail: string }[];
    independentFamiliesConverging: string[];
    hasContradiction: boolean;
    contradictionDetail: string | null;
    explanation: string;
    structuredEvidence: unknown;
    evaluatedAt: Date;
    createdAt: Date;
  }

  const filasEvaluaciones: FilaEvaluacionMock[] = [
    {
      id: "eval-1",
      paymentTransactionId: "pay-1",
      engineVersion: "5.7.0",
      state: "PRE_CONCILIABLE",
      candidateUnitId: "unit-1",
      families: [{ family: "BANK_MOVEMENT", nature: "POSITIVE", present: true, unitId: "unit-1", unitCode: "UF 2B", score: 85, tier: 1, detail: "" }],
      independentFamiliesConverging: ["BANK_MOVEMENT"],
      hasContradiction: false,
      contradictionDetail: null,
      explanation: "",
      structuredEvidence: null,
      evaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  const filaAmbigua: FilaEvaluacionMock = {
    id: "eval-ambiguo",
    paymentTransactionId: "pay-ambiguo",
    engineVersion: "5.7.0",
    state: "NEEDS_DECISION",
    candidateUnitId: null,
    families: [{ family: "BANK_MOVEMENT", nature: "NEGATIVE", present: true, unitId: null, unitCode: null, score: null, tier: null, detail: "" }],
    independentFamiliesConverging: [],
    hasContradiction: false,
    contradictionDetail: null,
    explanation: "Hay más de una unidad compatible.",
    structuredEvidence: {
      bank: { signals: [], blockers: [], topCandidates: [{ unitCode: "1A", score: 22, tier: 2, matchedSignals: ["AMOUNT_MATCH"] }, { unitCode: "2B", score: 22, tier: 2, matchedSignals: ["AMOUNT_MATCH"] }] },
      whatsapp: null,
    },
    evaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  interface FilaDecisionMock {
    id: string;
    paymentTransactionId: string;
    unitId: string | null;
    decision: string;
    createdAt: Date;
    reason: string | null;
    rejectionReason: string | null;
    decidedBy: string | null;
    score: number | null;
  }
  const filasDecisiones: FilaDecisionMock[] = [{ id: "dec-1", paymentTransactionId: "pay-1", unitId: "unit-1", decision: "APPROVED", createdAt: new Date("2026-01-02T00:00:00.000Z"), reason: "test", rejectionReason: null, decidedBy: "admin-1", score: 85 }];
  const filasShadow = [{ paymentTransactionId: "pay-1", engineVersion: "3.9.0", updatedAt: new Date("2026-01-01T00:00:00.000Z") }];
  const filasPagos = [
    { id: "pay-1", organizationId: "org-1" },
    { id: "pay-ambiguo", organizationId: "org-1" },
  ];
  const filasUnidades = [
    { id: "unit-1A-real", code: "1A", organizationId: "org-1" },
    { id: "unit-2B-real", code: "2B", organizationId: "org-1" },
  ];

  const mockPrisma = {
    paymentEvidenceAssessmentLog: { findMany: vi.fn(async () => filasEvaluaciones) },
    reconciliationMatch: { findMany: vi.fn(async () => filasDecisiones) },
    shadowMatchLog: { findMany: vi.fn(async () => filasShadow) },
    paymentTransaction: { findMany: vi.fn(async () => filasPagos) },
    unit: { findMany: vi.fn(async () => filasUnidades) },
  };
  return { mockPrisma, filaAmbigua };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { cargarTodasLasEvaluaciones, cargarTodasLasDecisiones, cargarVersionesDeMotorBancario, cargarDatasetDeCalibracionReal } = await import("./loader");

describe("loader.ts — solo lectura", () => {
  // Fase 5.13 — se agregó vi.clearAllMocks() (no existía antes) para que los
  // nuevos tests de resolución de candidatos ambiguos, que aserta llamadas
  // ausentes (`.not.toHaveBeenCalled()`), no arrastren llamadas de tests
  // anteriores. Los `mockResolvedValueOnce` de cada test se auto-consumen,
  // así que no se ven afectados; la implementación base (closures del
  // `vi.hoisted`) tampoco se pierde — `clearAllMocks` solo limpia historial
  // de llamadas, no implementaciones.
  beforeEach(() => {
    vi.clearAllMocks();
  });


  it("cargarTodasLasEvaluaciones solo llama findMany, mapea correctamente", async () => {
    const r = await cargarTodasLasEvaluaciones();
    expect(mockPrisma.paymentEvidenceAssessmentLog.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "asc" } });
    expect(r).toHaveLength(1);
    expect(r[0].paymentTransactionId).toBe("pay-1");
    expect(r[0].evaluatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("cargarTodasLasDecisiones solo llama findMany, sin filtrar por decision (el filtro APPROVED/REJECTED vive en ground-truth.ts)", async () => {
    const r = await cargarTodasLasDecisiones();
    expect(mockPrisma.reconciliationMatch.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "asc" } });
    expect(r).toEqual([{ id: "dec-1", paymentTransactionId: "pay-1", unitId: "unit-1", decision: "APPROVED", createdAt: "2026-01-02T00:00:00.000Z", reason: "test", rejectionReason: null, decidedBy: "admin-1", score: 85 }]);
  });

  it("cargarVersionesDeMotorBancario deduplica por pago, quedándose con la versión más reciente", async () => {
    const r = await cargarVersionesDeMotorBancario();
    expect(r).toEqual([{ paymentTransactionId: "pay-1", engineVersion: "3.9.0" }]);
  });

  // Escenario #20: auditabilidad sin depender de ShadowMatchLog.
  it("cargarDatasetDeCalibracionReal construye el dataset completo incluso si ShadowMatchLog está vacío", async () => {
    mockPrisma.shadowMatchLog.findMany.mockResolvedValueOnce([]);
    const casos = await cargarDatasetDeCalibracionReal();
    expect(casos).toHaveLength(1);
    expect(casos[0].groundTruth).toBe("HUMAN_CONFIRMED");
    expect(casos[0].bankEngineVersion).toBeNull();
  });

  // Escenario #17/#18: estructuralmente, este módulo solo conoce 5 delegates
  // (Fase 5.13 agregó paymentTransaction/unit, ambos solo lectura), ninguno
  // con métodos de escritura — no hay forma de mutar nada desde acá.
  it("el mock de Prisma no expone ningún método de escritura ni delegates de escritura (AUTO/mutación imposible desde loader.ts)", () => {
    expect(Object.keys(mockPrisma).sort()).toEqual(["paymentEvidenceAssessmentLog", "paymentTransaction", "reconciliationMatch", "shadowMatchLog", "unit"]);
    for (const delegate of Object.values(mockPrisma)) {
      expect(Object.keys(delegate)).toEqual(["findMany"]);
    }
    expect(mockPrisma).not.toHaveProperty("obligation");
    expect(mockPrisma).not.toHaveProperty("unitOwner");
  });

  // Escenario #19: WhatsApp inbound sigue ausente — el loader nunca toca ningún modelo de WhatsApp/PaymentNotice.
  it("ningún delegate de WhatsApp/PaymentNotice es referenciado por este módulo", () => {
    expect(mockPrisma).not.toHaveProperty("paymentNotice");
    expect(mockPrisma).not.toHaveProperty("whatsAppMessage");
  });

  // Fase 5.13 — resolución real de candidatos ambiguos.
  describe("resolución de candidatos ambiguos (Fase 5.13)", () => {
    it("una evaluación ambigua real, con una decisión APPROVED sobre uno de sus candidatos reales, resuelve a HUMAN_CONFIRMED", async () => {
      mockPrisma.paymentEvidenceAssessmentLog.findMany.mockResolvedValueOnce([filaAmbigua]);
      mockPrisma.reconciliationMatch.findMany.mockResolvedValueOnce([{ id: "dec-ambiguo", paymentTransactionId: "pay-ambiguo", unitId: "unit-1A-real", decision: "APPROVED", createdAt: new Date("2026-01-02T00:00:00.000Z"), reason: "test", rejectionReason: null, decidedBy: "admin-1", score: 22 }]);
      mockPrisma.shadowMatchLog.findMany.mockResolvedValueOnce([]);

      const casos = await cargarDatasetDeCalibracionReal();
      const caso = casos.find((c) => c.paymentTransactionId === "pay-ambiguo");
      expect(caso?.groundTruth).toBe("HUMAN_CONFIRMED");
      expect(caso?.humanConfirmedUnitId).toBe("unit-1A-real");
      expect(caso?.candidateUnitId).toBeNull(); // nunca se inventa candidateUnitId en la evaluación
      // Fase 5.15 — hallazgo real (ver informe): engineScore queda null para
      // toda evaluación AMBIGUA (scoreYTierDeCandidato solo mira `families`
      // por candidateUnitId, que acá es null por diseño). humanDecisionScore
      // sí captura el score real de la decisión, porque viene de
      // ReconciliationMatch, no de `families`.
      expect(caso?.engineScore).toBeNull();
      expect(caso?.humanDecisionScore).toBe(22);
    });

    it("sin ninguna decisión sobre los candidatos ambiguos, el caso queda INSUFFICIENT_DATA — nunca se fuerza nada", async () => {
      mockPrisma.paymentEvidenceAssessmentLog.findMany.mockResolvedValueOnce([filaAmbigua]);
      mockPrisma.reconciliationMatch.findMany.mockResolvedValueOnce([]);
      mockPrisma.shadowMatchLog.findMany.mockResolvedValueOnce([]);

      const casos = await cargarDatasetDeCalibracionReal();
      const caso = casos.find((c) => c.paymentTransactionId === "pay-ambiguo");
      expect(caso?.groundTruth).toBe("INSUFFICIENT_DATA");
    });

    it("un unitCode que no resuelve a ninguna Unit real vigente se omite — nunca se inventa un id", async () => {
      mockPrisma.paymentEvidenceAssessmentLog.findMany.mockResolvedValueOnce([filaAmbigua]);
      mockPrisma.reconciliationMatch.findMany.mockResolvedValueOnce([]);
      mockPrisma.shadowMatchLog.findMany.mockResolvedValueOnce([]);
      mockPrisma.unit.findMany.mockResolvedValueOnce([]); // ninguna Unit real resuelve

      const casos = await cargarDatasetDeCalibracionReal();
      const caso = casos.find((c) => c.paymentTransactionId === "pay-ambiguo");
      expect(caso?.groundTruth).toBe("INSUFFICIENT_DATA"); // sin candidatos resueltos, se comporta como antes de Fase 5.13
    });

    it("evaluaciones no ambiguas (candidateUnitId ya presente) nunca disparan la resolución de candidatos — cero llamadas extra necesarias", async () => {
      // Fixture por defecto (pay-1, candidateUnitId="unit-1", sin topCandidates) — sin ninguna evaluación ambigua real.
      await cargarDatasetDeCalibracionReal();
      // paymentTransaction/unit solo deberían haberse llamado si hay ambiguos reales — acá no los hay.
      expect(mockPrisma.paymentTransaction.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.unit.findMany).not.toHaveBeenCalled();
    });
  });
});
