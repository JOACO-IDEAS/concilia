// Fase 3.7 — dataset de fixtures: 4 consorcios + 10 escenarios de pago.
// Ningún dato acá es real — todo generado a propósito para ejercitar señales
// y bloqueos concretos del motor (ver FASE_3_7_DATA_SEED_PLAN.md §9/§10).
// Nunca se corre contra producción (ver lib/fixtures-env.ts).

export const PREFIJO_EXTERNAL_ID = "seed-fase37:";

function cuitOrganizacion(n: number): string {
  return `30-9990${String(n).padStart(4, "0")}-1`;
}
function cuitTitular(n: number): string {
  return `20-9991${String(n).padStart(4, "0")}-1`;
}

// ----------------------------------------------------------------------------
// Organizaciones — Paso A (/importar, importarOrganizaciones)
// ----------------------------------------------------------------------------
export interface FilaOrganizacionFixture {
  name: string;
  taxId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  billingEmail: string;
  cbuAlias: string;
}

export const ORGANIZACIONES: FilaOrganizacionFixture[] = [
  {
    name: "[FIXTURE] Consorcio Alfa",
    taxId: cuitOrganizacion(1),
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    billingEmail: "",
    cbuAlias: "",
  },
  {
    name: "[FIXTURE] Consorcio Beta",
    taxId: cuitOrganizacion(2),
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    billingEmail: "",
    cbuAlias: "",
  },
  {
    name: "[FIXTURE] Consorcio Gamma",
    taxId: cuitOrganizacion(3),
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    billingEmail: "",
    cbuAlias: "",
  },
  {
    name: "[FIXTURE] Consorcio Delta",
    taxId: cuitOrganizacion(4),
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    billingEmail: "",
    cbuAlias: "",
  },
];

// ----------------------------------------------------------------------------
// Unidades + Titulares — Paso B (/unidades-config, importarUnidades)
// Una fila = una unidad + un titular. Co-titularidad = dos filas, mismo
// unitCode (Beta/2A, a propósito).
// ----------------------------------------------------------------------------
export interface FilaUnidadFixture {
  unitCode: string;
  ownerFullName: string;
  ownerTaxId: string; // "" = sin CUIT, a propósito (Beta/1B)
  ownerRelationship: string;
  ownerEmail: string;
  ownerPhone: string;
  coefficient: string;
}

function fila(
  unitCode: string,
  ownerFullName: string,
  ownerTaxId: string,
  phoneSeed: number
): FilaUnidadFixture {
  return {
    unitCode,
    ownerFullName,
    ownerTaxId,
    ownerRelationship: "Propietario",
    ownerEmail: `${ownerFullName.toLowerCase().replace(/[^a-z]+/g, ".")}@fixture-fase37.test`,
    ownerPhone: `54911${String(phoneSeed).padStart(8, "0")}`,
    coefficient: "",
  };
}

// Caso limpio — todos con CUIT, todos con obligación (salvo 3B, a propósito:
// ver escenario #2 "match por CUIT", que necesita una unidad SIN obligación
// para que AMOUNT_MATCH caiga en SIN_OBLIGACION en vez de aportar ruido).
export const UNIDADES_ALFA: FilaUnidadFixture[] = [
  fila("3A", "Maria Fernandez Alfa", cuitTitular(301), 1),
  fila("3B", "Carlos Gomez Alfa", cuitTitular(302), 2),
  fila("4A", "Lucia Martinez Alfa", cuitTitular(401), 3),
  fila("4B", "Jorge Alvarez Alfa", cuitTitular(402), 4),
  fila("5A", "Sofia Romero Alfa", cuitTitular(501), 5),
  fila("5B", "Diego Torres Alfa", cuitTitular(502), 6),
];

// Mezcla parcial — 1B sin CUIT, 2A con co-titularidad.
export const UNIDADES_BETA: FilaUnidadFixture[] = [
  fila("1A", "Ana Diaz Beta", cuitTitular(101), 11),
  fila("1B", "Pedro Sanchez Beta", "", 12),
  fila("2A", "Laura Perez Beta", cuitTitular(201), 13),
  fila("2A", "Miguel Ruiz Beta", cuitTitular(202), 14), // co-titular, misma unidad
  fila("2B", "Valentina Lopez Beta", cuitTitular(203), 15),
  fila("PB1", "Roberto Nunez Beta", cuitTitular(204), 16),
];

// Ambigüedad de código — "3-A" y "3A" son dos Unit.code REALES y distintos
// (error de tipeo humano ya cargado), ambos canonicalizan igual.
export const UNIDADES_GAMMA: FilaUnidadFixture[] = [
  fila("3-A", "Fernando Castro Gamma", cuitTitular(1001), 21),
  fila("3A", "Gabriela Molina Gamma", cuitTitular(1002), 22),
  fila("4A", "Hector Vega Gamma", cuitTitular(1003), 23),
  fila("4B", "Ines Suarez Gamma", cuitTitular(1004), 24),
];

// CUIT contradictorio — Julian Rivas (1A) vs. la unidad que el pago señala (2A).
export const UNIDADES_DELTA: FilaUnidadFixture[] = [
  fila("1A", "Julian Rivas Delta", cuitTitular(2001), 31),
  fila("1B", "Camila Ortiz Delta", cuitTitular(2002), 32),
  fila("2A", "Nicolas Paz Delta", cuitTitular(2003), 33),
];

// ----------------------------------------------------------------------------
// Obligaciones — Paso C (/unidades-config, importarObligaciones)
// ----------------------------------------------------------------------------
export interface FilaObligacionFixture {
  unitCode: string;
  period: string;
  amount: string;
  concept: string;
  dueDate: string;
}

function obligacion(unitCode: string, amount: number): FilaObligacionFixture {
  return {
    unitCode,
    period: "2026-08",
    amount: String(amount),
    concept: "Expensas Agosto 2026",
    dueDate: "2026-08-10",
  };
}

// 3B deliberadamente SIN obligación — ver comentario en UNIDADES_ALFA.
export const OBLIGACIONES_ALFA: FilaObligacionFixture[] = [
  obligacion("3A", 150000),
  obligacion("4A", 150000),
  obligacion("4B", 150000),
  obligacion("5A", 150000),
  obligacion("5B", 150000),
];

// 1A y 2B con el MISMO importe pendiente (100000) a propósito — ver
// escenario #5 "pago ambiguo".
export const OBLIGACIONES_BETA: FilaObligacionFixture[] = [
  obligacion("1A", 100000),
  obligacion("1B", 90000),
  obligacion("2A", 110000),
  obligacion("2B", 100000),
  obligacion("PB1", 80000),
];

export const OBLIGACIONES_GAMMA: FilaObligacionFixture[] = [
  obligacion("3-A", 130000),
  obligacion("3A", 130000),
  obligacion("4A", 130000),
  obligacion("4B", 130000),
];

// 1A deliberadamente con un importe DISTINTO al de 2A (200000 vs 140000):
// una primera versión de este fixture usaba el mismo importe (140000) en
// ambas, lo que sin querer le daba a 1A (el verdadero dueño del CUIT del
// escenario #6) un score limpio (CUIT + importe EXACTO) que empataba y le
// ganaba por orden de iteración al candidato 2A con bloqueo — enmascarando
// CUIT_CONTRADICTORY en vez de probarlo. Con importes distintos, 1A pasa a
// PARCIAL (score menor) y 2A (con el bloqueo real) queda como "mejor".
export const OBLIGACIONES_DELTA: FilaObligacionFixture[] = [
  obligacion("1A", 200000),
  obligacion("1B", 125000),
  obligacion("2A", 140000),
];

export const PADRON = [
  { org: ORGANIZACIONES[0], unidades: UNIDADES_ALFA, obligaciones: OBLIGACIONES_ALFA },
  { org: ORGANIZACIONES[1], unidades: UNIDADES_BETA, obligaciones: OBLIGACIONES_BETA },
  { org: ORGANIZACIONES[2], unidades: UNIDADES_GAMMA, obligaciones: OBLIGACIONES_GAMMA },
  { org: ORGANIZACIONES[3], unidades: UNIDADES_DELTA, obligaciones: OBLIGACIONES_DELTA },
];

// ----------------------------------------------------------------------------
// Escenarios de pago — Paso D (seed directo de PaymentTransaction, sin AI
// parser). 10 de los 11 originales — "pago duplicado" queda documentado como
// NOT TESTABLE WITH CURRENT REAL DATA (decisión #2 de Fase 3.7: no se
// fabrica ReconciliationMatch de fixture).
// ----------------------------------------------------------------------------
export interface EscenarioPago {
  id: string;
  descripcion: string;
  organizationTaxId: string; // referencia a ORGANIZACIONES, resuelto a organizationId real en el seed
  amount: number;
  payerIdentifier: string | null;
  concept: string;
  resultadoEsperado: "CANDIDATE" | "AMBIGUOUS" | "BLOCKED";
  bloqueosEsperados: string[]; // BlockerType[] esperados, [] si ninguno
  notaEsperada: string;
}

export const ESCENARIOS: EscenarioPago[] = [
  {
    id: "01-match-inequivoco",
    descripcion: "Match inequívoco — CUIT + código de UF + importe exacto, todo coincide",
    organizationTaxId: cuitOrganizacion(1),
    amount: 150000,
    payerIdentifier: cuitTitular(301),
    concept: "Transferencia UF 3A - Maria Fernandez - Expensas Agosto",
    resultadoEsperado: "CANDIDATE",
    bloqueosEsperados: [],
    notaEsperada: "Tier 1 (CUIT + código), score cerca del techo (99), sin ambigüedad ni bloqueos.",
  },
  {
    id: "02-match-por-cuit",
    descripcion: "Match por CUIT — solo el CUIT identifica, unidad 3B sin obligación cargada todavía",
    organizationTaxId: cuitOrganizacion(1),
    amount: 50000,
    payerIdentifier: cuitTitular(302),
    concept: "Transferencia varios",
    resultadoEsperado: "CANDIDATE",
    bloqueosEsperados: [],
    notaEsperada: "Solo CUIT_EXACT matchea (tier 1) — AMOUNT_MATCH cae en SIN_OBLIGACION (3B no tiene obligación en este dataset).",
  },
  {
    id: "03-match-uf-importe",
    descripcion: "Match por UF + importe — sin CUIT, código de unidad exacto + importe exacto",
    organizationTaxId: cuitOrganizacion(2),
    amount: 100000,
    payerIdentifier: null,
    concept: "Pago UF 2B expensas agosto",
    resultadoEsperado: "CANDIDATE",
    bloqueosEsperados: [],
    notaEsperada: "UNIT_CODE_EXACT (tier1) + AMOUNT_MATCH EXACTO (tier2) — gana sobre 1A pese al empate de importe, porque 1A no tiene ninguna señal de código.",
  },
  {
    id: "04-match-por-obligacion",
    descripcion: "Match por obligación — sin CUIT, sin código, importe exacto único en todo el consorcio",
    organizationTaxId: cuitOrganizacion(2),
    amount: 80000,
    payerIdentifier: null,
    concept: "Transferencia recibida",
    resultadoEsperado: "CANDIDATE",
    bloqueosEsperados: [],
    notaEsperada: "Solo AMOUNT_MATCH (tier2) matchea, único candidato con score > 0 en el consorcio (PB1) — sin competidor, no hay ambigüedad.",
  },
  {
    id: "05-pago-ambiguo",
    descripcion: "Pago ambiguo — dos unidades con el mismo importe pendiente, sin código ni CUIT que desempate",
    organizationTaxId: cuitOrganizacion(2),
    amount: 100000,
    payerIdentifier: null,
    concept: "Transferencia recibida",
    resultadoEsperado: "AMBIGUOUS",
    bloqueosEsperados: ["MULTIPLE_EQUIVALENT_CANDIDATES"],
    notaEsperada: "1A y 2B empatan en 100000 (AMOUNT_MATCH tier2, score 22 cada uno) — diferencia 0 ≤ MARGEN_AMBIGUEDAD(10).",
  },
  {
    id: "06-cuit-contradictorio",
    descripcion: "CUIT contradictorio — el CUIT del pago pertenece a OTRO titular del mismo consorcio",
    organizationTaxId: cuitOrganizacion(4),
    amount: 140000,
    payerIdentifier: cuitTitular(2001), // Julian Rivas, titular de 1A
    concept: "Pago UF 2A expensas", // pero el concepto apunta a la unidad de Nicolas Paz
    resultadoEsperado: "BLOCKED",
    bloqueosEsperados: ["CUIT_CONTRADICTORY"],
    notaEsperada: "Mejor candidato real (2A, por código+importe) queda BLOCKED con CUIT_CONTRADICTORY explícito, no un genérico 'sin evidencia'.",
  },
  {
    id: "07-sin-cuit",
    descripcion: "Pago sin CUIT — igual resuelve por código de unidad + importe",
    organizationTaxId: cuitOrganizacion(3),
    amount: 130000,
    payerIdentifier: null,
    concept: "UF 4A pago expensas agosto",
    resultadoEsperado: "CANDIDATE",
    bloqueosEsperados: [],
    notaEsperada: "Usa la unidad 4A de Gamma (código NO ambiguo) — demuestra que el CUIT no es obligatorio cuando hay otra señal Tier 1.",
  },
  {
    id: "09-importe-diferente",
    descripcion: "Importe muy superior al pendiente, sin obligación futura que lo explique — score alto pero BLOCKED",
    organizationTaxId: cuitOrganizacion(1),
    amount: 500000,
    payerIdentifier: cuitTitular(401), // Lucia Martinez, titular real de 4A
    concept: "Transferencia UF 4A - Lucia Martinez",
    resultadoEsperado: "BLOCKED",
    bloqueosEsperados: ["AMOUNT_INCOMPATIBLE"],
    notaEsperada: "CUIT + código coinciden (score muy alto) pero el importe (500000) no tiene obligación que lo explique — SUPERIOR_SIN_EXPLICAR bloquea igual. Caso de calibración: 'score alto pero bloqueado'.",
  },
  {
    id: "10-otra-unidad-codigo-ambiguo",
    descripcion: "El código extraído coincide con DOS Unit.code reales del consorcio (error de tipeo en el padrón)",
    organizationTaxId: cuitOrganizacion(3),
    amount: 130000,
    payerIdentifier: null,
    concept: "Pago UF 3A - varios",
    resultadoEsperado: "BLOCKED",
    bloqueosEsperados: ["UNIT_CODE_AMBIGUOUS"],
    notaEsperada: "\"3-A\" y \"3A\" canonicalizan igual — el motor nunca adivina cuál de las dos es la real.",
  },
  {
    id: "11-datos-insuficientes",
    descripcion: "Sin CUIT, sin código, sin nombre, importe que no explica nada — cero evidencia utilizable",
    organizationTaxId: cuitOrganizacion(4),
    amount: 999999999,
    payerIdentifier: null,
    concept: "Movimiento sin detalle adicional",
    resultadoEsperado: "BLOCKED",
    bloqueosEsperados: ["INSUFFICIENT_EVIDENCE"],
    notaEsperada: "Ninguna señal matchea para ningún candidato del consorcio — score 0 en el mejor candidato.",
  },
];

// Escenario #8 (pago duplicado) — documentado, NO incluido en ESCENARIOS:
// requeriría un ReconciliationMatch(decision=AUTO|APPROVED) preexistente
// para esa unidad/importe, y la decisión #2 de Fase 3.7 prohibe fabricar
// ese historial. Queda como NOT TESTABLE WITH CURRENT REAL DATA — ver
// informe final.
