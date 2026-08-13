import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceFamilyResult } from "./evidence-score";
import type { StructuredEvidenceSnapshot } from "./evidence-score-store";

// Fase 5.9.1 — PrismaPaymentEvidenceAssessmentStore contra un delegate de
// Prisma FALSO que expone ÚNICAMENTE `create`/`findFirst`/`findMany` —
// DELIBERADAMENTE sin `upsert`/`update`/`delete`/`deleteMany`. Si el store
// alguna vez intentara mutar o borrar una fila existente, explotaría en
// runtime ("Cannot read properties of undefined") — es la prueba
// estructural del escenario #I (ningún mecanismo de UPDATE/DELETE existe
// para invocar), no solo una aserción de "no se llamó". El mock también
// expone ÚNICAMENTE `paymentEvidenceAssessmentLog` — ningún otro delegate
// (`reconciliationMatch`, `obligation`, `unit`, `unitOwner`) existe, prueba
// estructural de #K (AUTO imposible).

const { fakePaymentEvidenceAssessmentLog, mockPrisma } = vi.hoisted(() => {
  type Fila = {
    id: string;
    paymentTransactionId: string;
    engineVersion: string;
    state: string;
    candidateUnitId: string | null;
    families: unknown;
    independentFamiliesConverging: unknown;
    hasContradiction: boolean;
    contradictionDetail: string | null;
    explanation: string;
    structuredEvidence: unknown;
    evaluatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  };

  const filas: Fila[] = [];
  let contador = 0;

  const fakePaymentEvidenceAssessmentLog = {
    // SIEMPRE inserta — sin importar si ya existe una fila con el mismo
    // (paymentTransactionId, engineVersion). Ningún `where` de unicidad
    // acá — ya no hay ninguna constraint que lo exija (migración
    // payment_evidence_append_only_history, Fase 5.9.1).
    async create({ data }: { data: Omit<Fila, "id" | "createdAt" | "updatedAt"> }) {
      contador++;
      const ahora = new Date(Date.now() + contador); // desempata orden incluso si createdAt coincidiera al ms
      const nueva: Fila = { id: `pealog-${contador}`, createdAt: ahora, updatedAt: ahora, ...data };
      filas.push(nueva);
      return nueva;
    },
    async findFirst({
      where,
      orderBy,
    }: {
      where?: { paymentTransactionId?: string; engineVersion?: string };
      orderBy?: { createdAt?: "asc" | "desc" };
    } = {}) {
      let candidatas = filas.filter(
        (f) =>
          (where?.paymentTransactionId === undefined || f.paymentTransactionId === where.paymentTransactionId) &&
          (where?.engineVersion === undefined || f.engineVersion === where.engineVersion)
      );
      candidatas = [...candidatas].sort((a, b) => (orderBy?.createdAt === "desc" ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime()));
      return candidatas[0] ?? null;
    },
    async findMany({
      where = {},
      orderBy,
    }: {
      where?: { paymentTransactionId?: string; state?: string; engineVersion?: string };
      orderBy?: { createdAt?: "asc" | "desc" };
    } = {}) {
      let resultado = filas.filter(
        (f) =>
          (where.paymentTransactionId === undefined || f.paymentTransactionId === where.paymentTransactionId) &&
          (where.state === undefined || f.state === where.state) &&
          (where.engineVersion === undefined || f.engineVersion === where.engineVersion)
      );
      resultado = [...resultado].sort((a, b) => (orderBy?.createdAt === "desc" ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime()));
      return resultado;
    },
    _todas: () => [...filas],
    _clear: () => {
      filas.length = 0;
      contador = 0;
    },
  };

  const mockPrisma = { paymentEvidenceAssessmentLog: fakePaymentEvidenceAssessmentLog };
  return { fakePaymentEvidenceAssessmentLog, mockPrisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { PrismaPaymentEvidenceAssessmentStore, candidatoUnitIdDesdeFamilias } = await import("./evidence-score-store");
const { prisma: prismaImportado } = await import("@/lib/prisma");
type PaymentEvidenceAssessmentRecord = Awaited<ReturnType<InstanceType<typeof PrismaPaymentEvidenceAssessmentStore>["obtenerUltima"]>>;

function familiaBanco(overrides: Partial<EvidenceFamilyResult> = {}): EvidenceFamilyResult {
  return { family: "BANK_MOVEMENT", nature: "POSITIVE", present: true, unitId: "unit-1", unitCode: "UF 2B", score: 85, tier: 1, detail: "✓ CUIT coincide.", ...overrides };
}
function familiaWhatsapp(overrides: Partial<EvidenceFamilyResult> = {}): EvidenceFamilyResult {
  return { family: "WHATSAPP_MESSAGE", nature: "MISSING", present: false, unitId: null, unitCode: null, score: null, tier: null, detail: "No llegó ningún comprobante.", ...overrides };
}
function familiaHistorial(): EvidenceFamilyResult {
  return { family: "HISTORY", nature: "MISSING", present: false, unitId: null, unitCode: null, score: null, tier: null, detail: "HISTORY no se computa esta fase." };
}

function estructuraBanco(): StructuredEvidenceSnapshot {
  return {
    bank: {
      signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "CUIT coincide." }],
      blockers: [],
      topCandidates: [{ unitCode: "UF 2B", score: 85, tier: 1, matchedSignals: ["CUIT_EXACT"] }],
    },
    whatsapp: null,
  };
}

function record(overrides: Partial<NonNullable<PaymentEvidenceAssessmentRecord>> = {}): NonNullable<PaymentEvidenceAssessmentRecord> {
  const families = [familiaWhatsapp(), familiaBanco(), familiaHistorial()];
  return {
    paymentTransactionId: "pt-1",
    engineVersion: "5.7.0",
    state: "PRE_CONCILIABLE",
    candidateUnitId: candidatoUnitIdDesdeFamilias(families),
    families,
    independentFamiliesConverging: ["BANK_MOVEMENT"],
    hasContradiction: false,
    contradictionDetail: null,
    explanation: "Movimiento bancario identificado, todavía sin una segunda familia independiente.",
    structuredEvidence: estructuraBanco(),
    evaluatedAt: "2026-08-11T12:00:00.000Z",
    ...overrides,
  };
}

let store: InstanceType<typeof PrismaPaymentEvidenceAssessmentStore>;

beforeEach(() => {
  fakePaymentEvidenceAssessmentLog._clear();
  store = new PrismaPaymentEvidenceAssessmentStore();
});

describe("persistencia básica", () => {
  it("guardar() crea una fila en payment_evidence_assessment_logs", async () => {
    await store.guardar(record());
    expect(fakePaymentEvidenceAssessmentLog._todas()).toHaveLength(1);
  });

  it("la fila persistida tiene el paymentTransactionId exacto", async () => {
    await store.guardar(record({ paymentTransactionId: "pt-especifico" }));
    const ultima = await store.obtenerUltima("pt-especifico", "5.7.0");
    expect(ultima?.paymentTransactionId).toBe("pt-especifico");
  });
});

// #A — dos evaluaciones del mismo (paymentTransactionId, engineVersion) → DOS registros históricos.
describe("#A dos evaluaciones de la misma clave → dos registros", () => {
  it("guardar dos veces con paymentTransactionId+engineVersion idénticos crea DOS filas, nunca una", async () => {
    await store.guardar(record({ state: "NEEDS_DATA" }));
    await store.guardar(record({ state: "PRE_CONCILIABLE" }));

    const historial = await store.listarHistorialPorPago("pt-1");
    expect(historial).toHaveLength(2);
  });
});

// #B — reevaluar no sobrescribe el registro anterior.
describe("#B reevaluar no sobrescribe", () => {
  it("el primer registro sigue existiendo, con su contenido original, después de la segunda evaluación", async () => {
    await store.guardar(record({ state: "NEEDS_DATA", explanation: "Primera lectura — sin candidato." }));
    await store.guardar(record({ state: "PRE_CONCILIABLE", explanation: "Segunda lectura — candidato encontrado." }));

    const historial = await store.listarHistorialPorPago("pt-1");
    expect(historial[0].state).toBe("NEEDS_DATA");
    expect(historial[0].explanation).toBe("Primera lectura — sin candidato.");
    expect(historial[1].state).toBe("PRE_CONCILIABLE");
  });
});

// #C — timestamps/versiones/estados de ambas evaluaciones preservados.
describe("#C timestamps/versiones/estados de ambas evaluaciones preservados", () => {
  it("cada evento conserva su propio evaluatedAt/engineVersion/state, sin mezclarse", async () => {
    await store.guardar(record({ evaluatedAt: "2026-08-11T10:00:00.000Z", engineVersion: "5.7.0", state: "NEEDS_DATA" }));
    await store.guardar(record({ evaluatedAt: "2026-08-11T14:00:00.000Z", engineVersion: "5.7.0", state: "PRE_CONCILIABLE" }));

    const historial = await store.listarHistorialPorPago("pt-1");
    expect(historial[0].evaluatedAt).toBe("2026-08-11T10:00:00.000Z");
    expect(historial[1].evaluatedAt).toBe("2026-08-11T14:00:00.000Z");
    expect(historial.every((h) => h.engineVersion === "5.7.0")).toBe(true);
    expect(historial.map((h) => h.state)).toEqual(["NEEDS_DATA", "PRE_CONCILIABLE"]);
  });
});

// #D — una evaluación puede reconstruirse sin consultar ShadowMatchLog.
describe("#D auto-suficiencia — reconstruible sin ShadowMatchLog", () => {
  it("structuredEvidence trae signals/blockers/topCandidates completos, sin necesitar leer ninguna otra tabla", async () => {
    await store.guardar(record());
    const ultima = await store.obtenerUltima("pt-1", "5.7.0");
    expect(ultima?.structuredEvidence?.bank?.signals).toEqual([
      { signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "CUIT coincide." },
    ]);
    expect(ultima?.structuredEvidence?.bank?.topCandidates).toEqual([{ unitCode: "UF 2B", score: 85, tier: 1, matchedSignals: ["CUIT_EXACT"] }]);
  });
});

// #E — si ShadowMatchLog no existiera, la evaluación histórica sigue siendo auditable.
describe("#E auditable aunque ShadowMatchLog no exista", () => {
  it("el mock de Prisma NO expone shadowMatchLog en absoluto, y aun así se puede leer todo el detalle de la evaluación", async () => {
    expect((mockPrisma as Record<string, unknown>).shadowMatchLog).toBeUndefined();
    await store.guardar(record({ hasContradiction: false }));
    const ultima = await store.obtenerUltima("pt-1", "5.7.0");
    expect(ultima?.state).toBeDefined();
    expect(ultima?.families).toBeDefined();
    expect(ultima?.structuredEvidence).toBeDefined();
    expect(ultima?.explanation).toBeDefined();
  });
});

// #F — dos engineVersion diferentes producen eventos históricos independientes.
describe("#F engineVersion distintas → eventos independientes", () => {
  it("dos versiones del motor generan dos historiales que no se pisan entre sí", async () => {
    await store.guardar(record({ engineVersion: "5.7.0", state: "PRE_CONCILIABLE" }));
    await store.guardar(record({ engineVersion: "5.8.0", state: "RECONCILIATION_CONFIRMED" }));

    const historial = await store.listarHistorialPorPago("pt-1");
    expect(historial).toHaveLength(2);
    expect(historial.map((r) => r.engineVersion).sort()).toEqual(["5.7.0", "5.8.0"]);

    const v57 = await store.obtenerUltima("pt-1", "5.7.0");
    const v58 = await store.obtenerUltima("pt-1", "5.8.0");
    expect(v57?.state).toBe("PRE_CONCILIABLE");
    expect(v58?.state).toBe("RECONCILIATION_CONFIRMED");
  });
});

// #G — una evaluación con contradicción conserva la contradicción original.
describe("#G contradicción original preservada", () => {
  it("hasContradiction/contradictionDetail quedan intactos, incluso si una evaluación posterior ya no tiene contradicción", async () => {
    await store.guardar(
      record({
        hasContradiction: true,
        contradictionDetail: "BANK_MOVEMENT propone UF 2B, pero WHATSAPP_MESSAGE propone UF 1A.",
        state: "NEEDS_DECISION",
      })
    );
    await store.guardar({ ...record(), hasContradiction: false, contradictionDetail: null, state: "PRE_CONCILIABLE" });

    const historial = await store.listarHistorialPorPago("pt-1");
    expect(historial[0].hasContradiction).toBe(true);
    expect(historial[0].contradictionDetail).toBe("BANK_MOVEMENT propone UF 2B, pero WHATSAPP_MESSAGE propone UF 1A.");
    expect(historial[1].hasContradiction).toBe(false); // la evaluación nueva, sin alterar la vieja
  });
});

// #H — familias originales preservadas.
describe("#H familias originales preservadas", () => {
  it("families del primer evento no cambia aunque el segundo evento tenga familias distintas", async () => {
    const familiasV1 = [familiaWhatsapp(), familiaBanco({ score: 40 }), familiaHistorial()];
    const familiasV2 = [familiaWhatsapp(), familiaBanco({ score: 99 }), familiaHistorial()];
    await store.guardar(record({ families: familiasV1 }));
    await store.guardar(record({ families: familiasV2 }));

    const historial = await store.listarHistorialPorPago("pt-1");
    expect(historial[0].families.find((f) => f.family === "BANK_MOVEMENT")?.score).toBe(40);
    expect(historial[1].families.find((f) => f.family === "BANK_MOVEMENT")?.score).toBe(99);
  });
});

// #I — el historial no tiene UPDATE ni DELETE como mecanismo de mutación.
describe("#I sin UPDATE ni DELETE", () => {
  it("el fake delegate no expone update/upsert/delete/deleteMany — estructuralmente no existen para invocar", () => {
    const delegate = fakePaymentEvidenceAssessmentLog as unknown as Record<string, unknown>;
    expect(delegate.update).toBeUndefined();
    expect(delegate.upsert).toBeUndefined();
    expect(delegate.delete).toBeUndefined();
    expect(delegate.deleteMany).toBeUndefined();
  });

  it("guardar múltiples veces solo ACUMULA filas, nunca reduce el total", async () => {
    await store.guardar(record());
    await store.guardar(record());
    await store.guardar(record({ engineVersion: "5.8.0" }));
    expect(fakePaymentEvidenceAssessmentLog._todas()).toHaveLength(3);
  });
});

// #J — idempotencia (no implementada) claramente separada de append-only.
describe("#J idempotencia NO implementada — deliberadamente separada de append-only", () => {
  it("guardar el MISMO contenido dos veces (mismo trigger hipotético) sigue creando dos filas — no hay deduplicación", async () => {
    const mismoRegistro = record();
    await store.guardar(mismoRegistro);
    await store.guardar(mismoRegistro);

    // Esto es intencional: este store no implementa idempotencia. Si el
    // futuro necesitara deduplicar reintentos accidentales del mismo
    // trigger, esa lógica debe vivir en el caller (o un campo aditivo
    // nuevo) — nunca borrando/reemplazando un evento ya registrado.
    expect(fakePaymentEvidenceAssessmentLog._todas()).toHaveLength(2);
  });
});

// #K — AUTO imposible.
describe("#K AUTO imposible", () => {
  it("el mock de @/lib/prisma expone SOLO paymentEvidenceAssessmentLog — ningún otro delegate existe", () => {
    expect(Object.keys(mockPrisma)).toEqual(["paymentEvidenceAssessmentLog"]);
    expect((mockPrisma as Record<string, unknown>).reconciliationMatch).toBeUndefined();
    expect((mockPrisma as Record<string, unknown>).obligation).toBeUndefined();
    expect((mockPrisma as Record<string, unknown>).unit).toBeUndefined();
    expect((mockPrisma as Record<string, unknown>).unitOwner).toBeUndefined();
  });

  it("guardar un RECONCILIATION_CONFIRMED sigue siendo solo un evento diagnóstico más — no dispara ninguna otra escritura", async () => {
    await store.guardar(record({ state: "RECONCILIATION_CONFIRMED", independentFamiliesConverging: ["BANK_MOVEMENT", "WHATSAPP_MESSAGE"] }));
    expect(fakePaymentEvidenceAssessmentLog._todas()).toHaveLength(1);
  });
});

describe("filas anteriores sin structuredEvidence se leen como null (compatibilidad)", () => {
  it("una fila persistida antes de Fase 5.9.1 (sin esa columna) se lee con structuredEvidence: null, nunca undefined", async () => {
    await fakePaymentEvidenceAssessmentLog.create({
      data: {
        paymentTransactionId: "pt-vieja",
        engineVersion: "5.7.0",
        state: "PRE_CONCILIABLE",
        candidateUnitId: "unit-1",
        families: [],
        independentFamiliesConverging: [],
        hasContradiction: false,
        contradictionDetail: null,
        explanation: "Evento anterior a structuredEvidence.",
        structuredEvidence: undefined as unknown,
        evaluatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    });
    const ultima = await store.obtenerUltima("pt-vieja", "5.7.0");
    expect(ultima?.structuredEvidence).toBeNull();
  });
});

describe("sin Neon real", () => {
  it("el módulo @/lib/prisma importado en este archivo es el mock, no un cliente real", () => {
    expect(prismaImportado.paymentEvidenceAssessmentLog).toBe(fakePaymentEvidenceAssessmentLog);
  });
});

describe("candidatoUnitIdDesdeFamilias", () => {
  it("prioriza BANK_MOVEMENT sobre WHATSAPP_MESSAGE", () => {
    const families = [familiaWhatsapp({ present: true, nature: "POSITIVE", unitId: "unit-whatsapp" }), familiaBanco({ unitId: "unit-banco" }), familiaHistorial()];
    expect(candidatoUnitIdDesdeFamilias(families)).toBe("unit-banco");
  });
  it("cae a WHATSAPP_MESSAGE si BANK_MOVEMENT no tiene unitId", () => {
    const families = [familiaWhatsapp({ present: true, nature: "POSITIVE", unitId: "unit-whatsapp" }), familiaBanco({ unitId: null, present: false, nature: "MISSING" }), familiaHistorial()];
    expect(candidatoUnitIdDesdeFamilias(families)).toBe("unit-whatsapp");
  });
  it("null si ninguna familia tiene unitId", () => {
    const families = [familiaWhatsapp(), familiaBanco({ unitId: null, present: false, nature: "MISSING" }), familiaHistorial()];
    expect(candidatoUnitIdDesdeFamilias(families)).toBeNull();
  });
});
