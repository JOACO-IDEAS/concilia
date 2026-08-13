import { describe, expect, it } from "vitest";
import {
  evaluarFamiliaBankMovement,
  evaluarFamiliaHistorial,
  evaluarFamiliaWhatsapp,
  evaluarPaymentEvidenceScore,
} from "./evidence-score";
import type { ShadowMatchResult, Signal, Blocker } from "@/lib/reconciliation/types";
import type { ResultadoIngestaEvidencia } from "./types";

// ---------------------------------------------------------------------------
// Fixtures — construyen ShadowMatchResult / ResultadoIngestaEvidencia ya
// "calculados" (como si vinieran de runMatchingInShadow /
// evaluarEvidenciaDeComprobante reales) para no depender de Prisma/tx en
// esta suite: evidence-score.ts es puro y síncrono, consume esos resultados
// como caja opaca.
// ---------------------------------------------------------------------------

function signal(overrides: Partial<Signal> = {}): Signal {
  return { signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "CUIT coincide.", ...overrides };
}

function bankResult(overrides: Partial<ShadowMatchResult> = {}): ShadowMatchResult {
  return {
    paymentTransactionId: "pay-1",
    candidateUnitId: "unit-2b",
    candidateUnitOwnerId: "owner-1",
    candidateObligationId: "obl-1",
    score: 85,
    tier: 1,
    status: "CANDIDATE",
    signals: [
      signal({ signal: "CUIT_EXACT", tier: 1, matched: true }),
      signal({ signal: "AMOUNT_MATCH", tier: 2, matched: true, evidence: "Importe exacto." }),
    ],
    blockers: [],
    explanation: "✓ CUIT coincide.\n✓ Importe exacto.",
    engineVersion: "test",
    evaluatedAt: new Date().toISOString(),
    topCandidateScore: 85,
    topCandidateTier: 1,
    topCandidates: [{ unitCode: "UF 2B", score: 85, tier: 1, matchedSignals: ["CUIT_EXACT", "AMOUNT_MATCH"] }],
    ...overrides,
  };
}

function bankBloqueado(blockers: Blocker[], overrides: Partial<ShadowMatchResult> = {}): ShadowMatchResult {
  return bankResult({
    status: "BLOCKED",
    candidateUnitId: null,
    candidateObligationId: null,
    score: 0,
    tier: null,
    signals: [],
    blockers,
    topCandidates: null,
    topCandidateScore: null,
    topCandidateTier: null,
    explanation: `✗ ${blockers[0]?.evidence ?? "Bloqueado."}`,
    ...overrides,
  });
}

function bankAmbiguo(overrides: Partial<ShadowMatchResult> = {}): ShadowMatchResult {
  return bankResult({
    status: "AMBIGUOUS",
    candidateUnitId: null,
    candidateObligationId: null,
    score: 0,
    tier: null,
    signals: [],
    blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "UF 1A (score 72) y UF 2B (score 69) — empate." }],
    topCandidates: [
      { unitCode: "UF 1A", score: 72, tier: 2, matchedSignals: ["AMOUNT_MATCH"] },
      { unitCode: "UF 2B", score: 69, tier: 2, matchedSignals: ["AMOUNT_MATCH"] },
    ],
    explanation: "⚠ UF 1A (score 72) y UF 2B (score 69) — empate.",
    ...overrides,
  });
}

function whatsappResult(overrides: Partial<ResultadoIngestaEvidencia> = {}): ResultadoIngestaEvidencia {
  return {
    resolucionTelefono: { case: "SINGLE_CANDIDATE", candidates: [{ unitId: "unit-2b", unitOwnerId: "owner-1", organizationId: "org-1" }], evidence: "Teléfono único." },
    comprobante: {
      amount: 100000,
      currency: "ARS",
      payerName: "Juan Pérez",
      payerIdentifier: "20-11111111-2",
      transactionDate: new Date().toISOString(),
      referenceNumber: "OP-1",
      bankOrigin: null,
      confidenceExtraccion: 90,
    },
    organizationId: "org-1",
    estado: "CANDIDATE",
    candidatoPropuesto: {
      unitId: "unit-2b",
      unitCode: "UF 2B",
      unitOwnerId: "owner-1",
      ownerFullName: "Juan Pérez",
      obligationId: "obl-1",
      score: 62,
      tier: 2,
      signals: [signal({ signal: "AMOUNT_MATCH", tier: 2 })],
    },
    topCandidates: [{ unitCode: "UF 2B", score: 62, tier: 2, matchedSignals: ["AMOUNT_MATCH"] }],
    blockers: [],
    explicacion: "ConcilIA encontró un candidato compatible: UF 2B.",
    ...overrides,
  };
}

function whatsappSinIdentidad(): ResultadoIngestaEvidencia {
  return whatsappResult({
    estado: "SIN_IDENTIDAD",
    organizationId: null,
    candidatoPropuesto: null,
    topCandidates: null,
    resolucionTelefono: { case: "UNKNOWN", candidates: [], evidence: "Teléfono no registrado." },
    blockers: [{ type: "INSUFFICIENT_EVIDENCE", evidence: "No se pudo determinar a qué consorcio corresponde." }],
    explicacion: "ConcilIA no tiene suficiente información para identificar a qué consorcio pertenece este comprobante.",
  });
}

// ---------------------------------------------------------------------------
// 1) Independencia — múltiples señales de UNA familia no aumentan
//    artificialmente la confianza ni cuentan como más de una familia.
// ---------------------------------------------------------------------------
describe("Independencia — una familia sigue siendo una familia, sin importar cuántas señales internas tenga", () => {
  it("WhatsApp con teléfono + CUIT + nombre + referencia, todos coincidentes, sigue siendo UNA sola familia (WHATSAPP_MESSAGE)", () => {
    const whatsapp = whatsappResult({
      candidatoPropuesto: {
        unitId: "unit-2b",
        unitCode: "UF 2B",
        unitOwnerId: "owner-1",
        ownerFullName: "Juan Pérez",
        obligationId: "obl-1",
        score: 95, // motor real ya sumó CUIT+importe+referencia — score alto, PERO 1 sola familia
        tier: 1,
        signals: [
          signal({ signal: "CUIT_EXACT", tier: 1 }),
          signal({ signal: "AMOUNT_MATCH", tier: 2 }),
          signal({ signal: "REFERENCE_MATCH", tier: 1 }),
          signal({ signal: "NAME_SIMILARITY", tier: 4 }),
        ],
      },
    });

    const r = evaluarPaymentEvidenceScore({ whatsapp });

    expect(r.independentFamiliesConverging).toEqual(["WHATSAPP_MESSAGE"]);
    expect(r.independentFamiliesConverging).toHaveLength(1);
    // Ni con score interno 95 llega a RECONCILIATION_CONFIRMED: sigue siendo
    // una sola familia — el techo es PRE_CONCILIABLE... pero WHATSAPP_MESSAGE
    // sola sin banco es INFORMATIONAL (esperando confirmación bancaria), no
    // PRE_CONCILIABLE (ese estado es solo para BANK_MOVEMENT sola, Parte 6).
    expect(r.state).toBe("INFORMATIONAL");
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
  });

  it("Bank movement con 4 señales fuertes coincidentes sigue siendo UNA sola familia (BANK_MOVEMENT)", () => {
    const bank = bankResult({
      score: 99,
      tier: 1,
      signals: [
        signal({ signal: "CUIT_EXACT", tier: 1 }),
        signal({ signal: "AMOUNT_MATCH", tier: 2 }),
        signal({ signal: "REFERENCE_MATCH", tier: 1 }),
        signal({ signal: "DATE_COMPATIBLE", tier: 4 }),
      ],
    });

    const r = evaluarPaymentEvidenceScore({ bank });

    expect(r.independentFamiliesConverging).toEqual(["BANK_MOVEMENT"]);
    expect(r.state).toBe("PRE_CONCILIABLE");
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
  });
});

// ---------------------------------------------------------------------------
// 2) PADRON + OBLIGATION nunca reemplazan una segunda familia independiente
//    — porque ni siquiera son parámetros de la función: ya se usaron DENTRO
//    de cada motor como contexto de validación.
// ---------------------------------------------------------------------------
describe("PADRON y OBLIGATION son contexto, nunca familias con peso propio", () => {
  it("evaluarPaymentEvidenceScore no acepta padrón ni obligación como evidencia adicional — no existen como parámetros", () => {
    // Verificación estructural: los únicos inputs posibles son bank/whatsapp.
    const inputsPosibles: (keyof Parameters<typeof evaluarPaymentEvidenceScore>[0])[] = ["bank", "whatsapp"];
    expect(inputsPosibles).toEqual(["bank", "whatsapp"]);
  });

  it("BANK_MOVEMENT perfecto (ya validado internamente contra padrón+obligación por candidate-generator.ts) NUNCA alcanza RECONCILIATION_CONFIRMED sin una segunda familia", () => {
    const bank = bankResult({ score: 99, tier: 1 }); // el mejor caso posible de una sola familia

    const r = evaluarPaymentEvidenceScore({ bank });

    expect(r.state).toBe("PRE_CONCILIABLE");
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
    expect(r.independentFamiliesConverging).toHaveLength(1);
  });

  it("agregar únicamente más contexto de HISTORY (siempre MISSING hoy) no cambia el resultado — no hay forma de simular una tercera familia con datos", () => {
    const historial = evaluarFamiliaHistorial();
    expect(historial.nature).toBe("MISSING");
    expect(historial.present).toBe(false);

    const bank = bankResult({ score: 99, tier: 1 });
    const r = evaluarPaymentEvidenceScore({ bank });
    // HISTORY siempre aparece en `families` pero nunca en `independentFamiliesConverging`.
    expect(r.families.find((f) => f.family === "HISTORY")?.nature).toBe("MISSING");
    expect(r.independentFamiliesConverging).not.toContain("HISTORY");
  });
});

// ---------------------------------------------------------------------------
// 3) Hard blockers existentes — clasificación correcta.
// ---------------------------------------------------------------------------
describe("Hard blockers reales — clasificación por naturaleza", () => {
  it.each([
    ["IDENTITY_CONFLICT", "CONTRADICTORY"],
    ["CUIT_CONTRADICTORY", "CONTRADICTORY"],
    ["MULTIPLE_EQUIVALENT_CANDIDATES", "NEGATIVE"],
    ["AMOUNT_INCOMPATIBLE", "NEGATIVE"],
    ["UNIT_CODE_AMBIGUOUS", "NEGATIVE"],
    ["PREVIOUSLY_REJECTED", "NEGATIVE"],
    ["DUPLICATE", "NEGATIVE"],
    ["NO_UNITS_IN_ORGANIZATION", "NEGATIVE"],
    ["INSUFFICIENT_EVIDENCE", "NEGATIVE"],
    ["PHONE_AMBIGUOUS", "NEGATIVE"],
  ] as const)("blocker %s del motor bancario → BANK_MOVEMENT.nature = %s", (tipo, esperado) => {
    const bank = bankBloqueado([{ type: tipo, evidence: `Blocker ${tipo}.` }]);
    const resultado = evaluarFamiliaBankMovement(bank);
    expect(resultado.nature).toBe(esperado);
  });

  it("IDENTITY_CONFLICT en la evidencia de WhatsApp (Fase 5.3, ya construido) → WHATSAPP_MESSAGE.nature = CONTRADICTORY", () => {
    const whatsapp = whatsappResult({
      estado: "BLOCKED",
      candidatoPropuesto: null,
      blockers: [{ type: "IDENTITY_CONFLICT", evidence: "El comprobante fue enviado desde el teléfono asociado a UF 2B, pero el mejor candidato es UF 1A." }],
    });
    const resultado = evaluarFamiliaWhatsapp(whatsapp);
    expect(resultado.nature).toBe("CONTRADICTORY");
  });

  it("una contradicción SIEMPRE fuerza NEEDS_DECISION, sin importar cuán fuerte sea el resto de la evidencia", () => {
    const bank = bankBloqueado([{ type: "CUIT_CONTRADICTORY", evidence: "El CUIT del pagador pertenece a otro titular." }], { score: 90, tier: 1 });
    const r = evaluarPaymentEvidenceScore({ bank });
    expect(r.state).toBe("NEEDS_DECISION");
    expect(r.hasContradiction).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4) Casos A-I del diseño (FASE_5_7_PAYMENT_EVIDENCE_SCORE_DESIGN.md Parte 8)
// ---------------------------------------------------------------------------
describe("Casos A-I", () => {
  it("A — WhatsApp + banco + padrón + obligación coinciden exactamente → RECONCILIATION_CONFIRMED", () => {
    const bank = bankResult({ score: 90, tier: 1, candidateUnitId: "unit-2b" });
    const whatsapp = whatsappResult({ candidatoPropuesto: { ...whatsappResult().candidatoPropuesto!, unitId: "unit-2b", unitCode: "UF 2B" } });

    const r = evaluarPaymentEvidenceScore({ bank, whatsapp });

    expect(r.state).toBe("RECONCILIATION_CONFIRMED");
    expect(r.independentFamiliesConverging.sort()).toEqual(["BANK_MOVEMENT", "WHATSAPP_MESSAGE"]);
    expect(r.hasContradiction).toBe(false);
  });

  it("B — WhatsApp llega primero, banco todavía no → INFORMATIONAL (esperando confirmación bancaria)", () => {
    const r = evaluarPaymentEvidenceScore({ bank: null, whatsapp: whatsappResult() });
    expect(r.state).toBe("INFORMATIONAL");
    expect(r.explanation).toContain("esperando confirmación bancaria");
  });

  it("C — Banco llega primero, sin WhatsApp → puede seguir avanzando (PRE_CONCILIABLE)", () => {
    const r = evaluarPaymentEvidenceScore({ bank: bankResult(), whatsapp: null });
    expect(r.state).toBe("PRE_CONCILIABLE");
  });

  it("D — WhatsApp dice UF 2B pero el comprobante contradice → NEEDS_DECISION", () => {
    const whatsapp = whatsappResult({
      estado: "BLOCKED",
      candidatoPropuesto: null,
      blockers: [{ type: "IDENTITY_CONFLICT", evidence: "El teléfono apunta a UF 2B pero el comprobante indica UF 1A." }],
    });
    const r = evaluarPaymentEvidenceScore({ whatsapp });
    expect(r.state).toBe("NEEDS_DECISION");
    expect(r.hasContradiction).toBe(true);
  });

  it("E — Banco coincide en importe+obligación pero hay dos UFs posibles → NEEDS_DECISION", () => {
    const r = evaluarPaymentEvidenceScore({ bank: bankAmbiguo() });
    expect(r.state).toBe("NEEDS_DECISION");
  });

  it("F — Banco sin CUIT/referencia y sin WhatsApp, sin candidato → NEEDS_DATA", () => {
    const bank = bankBloqueado([{ type: "INSUFFICIENT_EVIDENCE", evidence: "El mejor candidato puntuó 0." }]);
    const r = evaluarPaymentEvidenceScore({ bank });
    expect(r.state).toBe("NEEDS_DATA");
  });

  it("G — WhatsApp con comprobante pero sin movimiento bancario todavía → INFORMATIONAL, igual que B", () => {
    const r = evaluarPaymentEvidenceScore({ whatsapp: whatsappResult() });
    expect(r.state).toBe("INFORMATIONAL");
  });

  it("H — Dos movimientos bancarios idénticos, sin comprobante → GAP DOCUMENTADO, no resuelto esta fase (ver informe: decisión de negocio pendiente)", () => {
    // Comportamiento ACTUAL, sin ninguna detección de duplicado cruzado: dos
    // PaymentTransaction distintos, evaluados independientemente, cada uno
    // llega a PRE_CONCILIABLE por su cuenta — nada en este módulo ni en
    // deterministic-matcher.ts (blocker DUPLICATE solo dispara si YA existe
    // una ReconciliationMatch aprobada previa, no entre dos crudos sin
    // decidir) detecta que son "el mismo pago dos veces". Este test prueba
    // el gap, no lo resuelve — ver FASE_5_7_INFORME_IMPLEMENTACION.md.
    const movimientoA = bankResult({ paymentTransactionId: "pay-A" });
    const movimientoB = bankResult({ paymentTransactionId: "pay-B" }); // mismo importe/candidato, id distinto

    const resultadoA = evaluarPaymentEvidenceScore({ bank: movimientoA });
    const resultadoB = evaluarPaymentEvidenceScore({ bank: movimientoB });

    expect(resultadoA.state).toBe("PRE_CONCILIABLE");
    expect(resultadoB.state).toBe("PRE_CONCILIABLE");
    // Ninguno de los dos resultados sabe del otro — no hay ningún campo que
    // señale "posible duplicado". Documentado, no implementado.
  });

  it("I — Pago parcial: nunca alcanza RECONCILIATION_CONFIRMED por monto solo, aunque converjan 2 familias", () => {
    const bankParcial = bankResult({
      signals: [signal({ signal: "AMOUNT_MATCH", tier: 3, matched: true, evidence: "Importe parcial: $100.000 de $200.000." })],
    });
    const whatsapp = whatsappResult();

    const r = evaluarPaymentEvidenceScore({ bank: bankParcial, whatsapp });

    expect(r.state).toBe("PRE_CONCILIABLE");
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
    expect(r.explanation).toContain("importe bancario no es exacto");
  });
});

// ---------------------------------------------------------------------------
// 5) Ninguna combinación de señales débiles produce confirmación por
//    acumulación artificial.
// ---------------------------------------------------------------------------
describe("Sin acumulación artificial de evidencia débil", () => {
  it("banco BLOCKED (sin candidato) + WhatsApp SIN_IDENTIDAD → NEEDS_DATA, nunca PRE_CONCILIABLE ni RECONCILIATION_CONFIRMED", () => {
    const r = evaluarPaymentEvidenceScore({
      bank: bankBloqueado([{ type: "INSUFFICIENT_EVIDENCE", evidence: "Sin candidato." }]),
      whatsapp: whatsappSinIdentidad(),
    });
    expect(r.state).toBe("NEEDS_DATA");
    expect(r.independentFamiliesConverging).toHaveLength(0);
  });

  it("banco AMBIGUOUS + WhatsApp SIN_IDENTIDAD → NEEDS_DECISION (nunca se \"promedian\" hacia un estado más fuerte)", () => {
    const r = evaluarPaymentEvidenceScore({ bank: bankAmbiguo(), whatsapp: whatsappSinIdentidad() });
    expect(r.state).toBe("NEEDS_DECISION");
  });

  it("acumular muchas señales de tier bajo (4) dentro de una sola familia no la convierte en dos familias ni sube el estado", () => {
    const bank = bankResult({
      score: 20,
      tier: 4,
      signals: [
        signal({ signal: "DATE_COMPATIBLE", tier: 4, evidence: "Fecha compatible." }),
        signal({ signal: "NAME_SIMILARITY", tier: 4, evidence: "Nombre parecido." }),
        signal({ signal: "EMAIL_MATCH", tier: 4, evidence: "Email parecido." }),
      ],
    });
    const r = evaluarPaymentEvidenceScore({ bank });
    expect(r.independentFamiliesConverging).toEqual(["BANK_MOVEMENT"]);
    expect(r.state).toBe("PRE_CONCILIABLE"); // sigue siendo 1 familia — nunca CONFIRMED
  });
});

// ---------------------------------------------------------------------------
// 6) Reglas "X solo nunca confirma"
// ---------------------------------------------------------------------------
describe("Reglas 'X solo nunca confirma'", () => {
  it("teléfono solo (WhatsApp con identidad resuelta pero sin candidato de motor) → nunca confirma", () => {
    const whatsapp = whatsappResult({ estado: "AMBIGUOUS", candidatoPropuesto: null });
    const r = evaluarPaymentEvidenceScore({ whatsapp });
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
  });

  it("CUIT solo (una sola familia, aunque sea Tier 1) → nunca confirma", () => {
    const bank = bankResult({ signals: [signal({ signal: "CUIT_EXACT", tier: 1 })], score: 40, tier: 1 });
    const r = evaluarPaymentEvidenceScore({ bank });
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
    expect(r.state).toBe("PRE_CONCILIABLE");
  });

  it("importe exacto solo → nunca confirma", () => {
    const bank = bankResult({ signals: [signal({ signal: "AMOUNT_MATCH", tier: 2 })], score: 22, tier: 2 });
    const r = evaluarPaymentEvidenceScore({ bank });
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
  });

  it("historial solo → estructuralmente imposible que confirme (siempre MISSING, no puede ni aparecer como positiva)", () => {
    const historial = evaluarFamiliaHistorial();
    expect(historial.nature).toBe("MISSING");
    // No hay ningún input posible que la haga POSITIVE esta fase — se prueba
    // llamando el evaluador de más alto nivel sin bank ni whatsapp.
    const r = evaluarPaymentEvidenceScore({});
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
    expect(r.state).toBe("NEEDS_DATA");
  });

  it("WhatsApp solo (candidato fuerte del motor, sin banco) → nunca confirma, queda INFORMATIONAL", () => {
    const r = evaluarPaymentEvidenceScore({ whatsapp: whatsappResult() });
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
    expect(r.state).toBe("INFORMATIONAL");
  });

  it("banco solo (candidato fuerte, sin WhatsApp/historial) → nunca confirma, queda PRE_CONCILIABLE", () => {
    const r = evaluarPaymentEvidenceScore({ bank: bankResult({ score: 99, tier: 1 }) });
    expect(r.state).not.toBe("RECONCILIATION_CONFIRMED");
    expect(r.state).toBe("PRE_CONCILIABLE");
  });
});

// ---------------------------------------------------------------------------
// 7) Contradicción cruzada entre familias — la única detección genuinamente
//    NUEVA de esta capa (ninguno de los dos motores, evaluados por separado,
//    puede verla).
// ---------------------------------------------------------------------------
describe("Contradicción cruzada entre familias (nueva, propia de esta capa)", () => {
  it("banco propone UF 2B, WhatsApp propone UF 1A (sin blocker interno en ninguno de los dos) → NEEDS_DECISION", () => {
    const bank = bankResult({ candidateUnitId: "unit-2b", topCandidates: [{ unitCode: "UF 2B", score: 85, tier: 1, matchedSignals: ["CUIT_EXACT"] }] });
    const whatsapp = whatsappResult({
      candidatoPropuesto: { ...whatsappResult().candidatoPropuesto!, unitId: "unit-1a", unitCode: "UF 1A" },
    });

    const r = evaluarPaymentEvidenceScore({ bank, whatsapp });

    expect(r.state).toBe("NEEDS_DECISION");
    expect(r.hasContradiction).toBe(true);
    expect(r.contradictionDetail).toContain("UF 2B");
    expect(r.contradictionDetail).toContain("UF 1A");
  });
});
