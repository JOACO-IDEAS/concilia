// Fase 5.1 — ConcilIA OS Inbox: clasificación y priorización UNIFICADA de
// AgentObservation, sin importar qué agente la generó. Funciones 100% PURAS
// — sin Prisma, sin I/O, sin reloj implícito (reciben `ahora` como parámetro
// opcional, mismo criterio ya usado en document-status.ts). Determinísticas
// y testeables en aislamiento.
//
// Principio central (Fase 4.F/4.G, reafirmado en Fase 5): un status técnico
// del motor (BLOCKED/AMBIGUOUS) NO es lo mismo que "requiere intervención
// humana". La clasificación deriva SIEMPRE de datos ya persistidos
// (type/severity/status/evidence) — nunca se agrega una columna nueva para
// esto, nunca se inventa información que no esté en `evidence`.

import type { ObservacionAgentePersistida } from "./types";
import type { ObservacionEnBandeja } from "./work-queue";

export type InboxCategory = "NEEDS_ACTION" | "NEEDS_DECISION" | "NEEDS_DATA" | "INFORMATIONAL" | "RESOLVED";

// Blockers del motor de matching que representan "ConcilIA no tiene con qué
// trabajar todavía" — Capa 1 de Fase 4.G — nunca una ambigüedad genuina
// entre candidatos reales.
const BLOCKER_TYPES_DATOS_INCOMPLETOS = new Set(["NO_UNITS_IN_ORGANIZATION", "INSUFFICIENT_EVIDENCE"]);

type ObservacionClasificable = Pick<ObservacionAgentePersistida, "agentType" | "type" | "severity" | "status" | "evidence">;

function extraerTiposDeBloqueo(evidence: Record<string, unknown>): string[] {
  const blockers = evidence.blockers;
  if (!Array.isArray(blockers)) return [];
  return blockers
    .filter((b): b is { type: string } => typeof b === "object" && b !== null && typeof (b as { type?: unknown }).type === "string")
    .map((b) => b.type);
}

/**
 * Clasifica una observación en una de las 5 categorías del Inbox. Pura,
 * determinística, sin Prisma. Nunca persiste el resultado — se recalcula en
 * cada lectura (mismo criterio que "vigente"/"vencido" en Obligation/
 * ProviderDocument: derivado, nunca una segunda fuente de verdad que pueda
 * desincronizarse).
 *
 * Reglas, en orden de precedencia:
 * 1. RESOLVED — la observación ya fue atendida (status real, no derivado).
 * 2. MATCHING con blocker de Capa 1 (sin organización/unidades/evidencia
 *    para evaluar) → NEEDS_DATA. Nunca NEEDS_ACTION ni NEEDS_DECISION — un
 *    dato faltante no es una decisión que tomar ni una acción que ejecutar.
 * 3. MATCHING con blocker de Capa 2 (CUIT_CONTRADICTORY/AMOUNT_INCOMPATIBLE/
 *    UNIT_CODE_AMBIGUOUS) o AMBIGUOUS (MULTIPLE_EQUIVALENT_CANDIDATES) →
 *    NEEDS_DECISION — hay candidatos/evidencia real en conflicto, requiere
 *    criterio humano para elegir, no una gestión de trámite.
 * 4. COMPLIANCE `PROVIDER_WITHOUT_DOCUMENTS` → NEEDS_DATA, por decisión
 *    explícita de Fase 5.1: "ConcilIA no tiene documentación suficiente para
 *    evaluar" NUNCA implica "el proveedor incumple" — falta de evidencia ≠
 *    incumplimiento.
 * 5. COMPLIANCE `DOCUMENT_EXPIRED`/`DOCUMENT_EXPIRING_SOON` → NEEDS_ACTION —
 *    no hay ambigüedad sobre qué hacer, solo falta gestionarlo.
 * 6. Fallback conservador para cualquier (agentType,type) todavía no
 *    mapeado (agentes futuros): `severity=INFO` → INFORMATIONAL (mismo
 *    significado que ese valor ya tiene en el sistema desde Fase 4D — "no
 *    accionable"); cualquier otra severidad → NEEDS_DECISION, nunca se
 *    esconde algo que no se supo clasificar.
 */
export function classifyObservation(o: ObservacionClasificable): InboxCategory {
  if (o.status === "RESOLVED") return "RESOLVED";

  if (o.agentType === "MATCHING") {
    const bloqueos = extraerTiposDeBloqueo(o.evidence);
    if (bloqueos.some((t) => BLOCKER_TYPES_DATOS_INCOMPLETOS.has(t))) return "NEEDS_DATA";
    return "NEEDS_DECISION"; // PAYMENT_MATCH_AMBIGUOUS o PAYMENT_MATCH_BLOCKED genuino
  }

  if (o.agentType === "COMPLIANCE") {
    if (o.type === "PROVIDER_WITHOUT_DOCUMENTS") return "NEEDS_DATA";
    if (o.type === "DOCUMENT_EXPIRED" || o.type === "DOCUMENT_EXPIRING_SOON") return "NEEDS_ACTION";
  }

  return o.severity === "INFO" ? "INFORMATIONAL" : "NEEDS_DECISION";
}

// Orden de categoría — banda dominante del score, 1000 puntos de separación
// entre cada una para que ningún factor secundario pueda hacer que una
// observación de una categoría se ordene por encima de otra de categoría
// más urgente (ver `priorityScore`, suma secundaria acotada a <1000).
const ORDEN_CATEGORIA: Record<InboxCategory, number> = {
  NEEDS_ACTION: 4000,
  NEEDS_DECISION: 3000,
  NEEDS_DATA: 2000,
  INFORMATIONAL: 1000,
  RESOLVED: 0,
};

const PUNTOS_SEVERIDAD: Record<ObservacionAgentePersistida["severity"], number> = {
  CRITICAL: 300,
  WARNING: 150,
  INFO: 0,
};

// Blockers que representan un bloqueo duro real (vs. una ambigüedad entre
// candidatos) — dentro de NEEDS_DECISION, un bloqueo concreto ordena un
// poco antes que una ambigüedad a desempatar, sin sacarla de la categoría.
const BLOCKER_TYPES_DUROS = new Set(["CUIT_CONTRADICTORY", "AMOUNT_INCOMPATIBLE", "UNIT_CODE_AMBIGUOUS"]);

function diasEntre(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Puntaje de prioridad DERIVADO — nunca persistido, se recalcula en cada
 * lectura. Mayor puntaje = más urgente. Ordenar una lista de observaciones
 * por este puntaje agrupa automáticamente por categoría (bandas de 1000,
 * ver arriba) y, dentro de cada categoría, por urgencia real.
 *
 * Solo usa datos que YA existen en la observación — nunca inventa impacto
 * financiero, fechas, ni urgencia. Cada componente se activa únicamente si
 * el dato real está presente en `evidence`; si falta, ese componente aporta
 * 0 (degrada elegantemente, nunca rompe ni asume un valor por defecto no
 * neutral).
 *
 * Componentes (todos acotados, para que ninguna combinación cruce la banda
 * de la categoría siguiente — suma máxima real ≈ 750 < 1000):
 * - severity: CRITICAL +300 / WARNING +150 / INFO +0.
 * - vencimiento: si `evidence.diasParaVencer` (real, ya lo persiste
 *   compliance-detector.ts) es un número, cuanto MENOS falte, más puntos
 *   (hasta 150). Documentos ya vencidos (sin este campo, `validTo` en el
 *   pasado) usan la antigüedad de la detección como proxy, no se inventa
 *   un número de "días de atraso" que el detector no calculó.
 * - antigüedad: `detectedAt` (siempre real) — hasta 50 puntos, para que una
 *   observación vieja no quede enterrada bajo una nueva del mismo tipo.
 * - bloqueo duro vs. ambigüedad (solo NEEDS_DECISION de matching): +50 si
 *   el blocker es un conflicto concreto (CUIT/importe/código), +0 si es
 *   ambigüedad entre candidatos — ambos siguen siendo NEEDS_DECISION.
 * - impacto: solo si `evidence.amount` es un número real (evidencia de
 *   matching) — hasta 200 puntos, jamás inventado para Compliance (que no
 *   tiene monto).
 * - entidades afectadas: `organizationNames.length` (real, ya resuelto por
 *   work-queue.ts vía Organization/ProviderOrganization) — hasta 50 puntos.
 */
export function priorityScore(
  o: ObservacionEnBandeja,
  categoria: InboxCategory,
  opciones: { ahora?: Date } = {}
): number {
  const ahora = opciones.ahora ?? new Date();
  let score = ORDEN_CATEGORIA[categoria];

  score += PUNTOS_SEVERIDAD[o.severity];

  const diasParaVencer = o.evidence.diasParaVencer;
  if (typeof diasParaVencer === "number") {
    score += Math.max(0, Math.min(150, 150 - diasParaVencer * 5));
  }

  const detectedAt = new Date(o.detectedAt);
  if (!Number.isNaN(detectedAt.getTime())) {
    score += Math.min(50, Math.floor(diasEntre(ahora, detectedAt)));
  }

  if (categoria === "NEEDS_DECISION" && o.agentType === "MATCHING") {
    const bloqueos = extraerTiposDeBloqueo(o.evidence);
    if (bloqueos.some((t) => BLOCKER_TYPES_DUROS.has(t))) score += 50;
  }

  const amount = o.evidence.amount;
  if (typeof amount === "number") {
    score += Math.min(200, Math.floor(amount / 10000));
  }

  if (o.organizationNames.length > 1) {
    score += Math.min(50, (o.organizationNames.length - 1) * 25);
  }

  return score;
}

export interface ObservacionClasificada extends ObservacionEnBandeja {
  categoria: InboxCategory;
  prioridad: number;
}

/**
 * Agrupa y ordena una lista de observaciones por categoría del Inbox,
 * dentro de cada categoría por `priorityScore` descendente. Pura — recibe
 * la lista ya cargada (work-queue.ts sigue siendo el único que consulta
 * Prisma), nunca vuelve a tocar la base.
 */
export function clasificarBandeja(
  observaciones: ObservacionEnBandeja[],
  opciones: { ahora?: Date } = {}
): Record<InboxCategory, ObservacionClasificada[]> {
  const resultado: Record<InboxCategory, ObservacionClasificada[]> = {
    NEEDS_ACTION: [],
    NEEDS_DECISION: [],
    NEEDS_DATA: [],
    INFORMATIONAL: [],
    RESOLVED: [],
  };

  for (const o of observaciones) {
    const categoria = classifyObservation(o);
    const prioridad = priorityScore(o, categoria, opciones);
    resultado[categoria].push({ ...o, categoria, prioridad });
  }

  for (const categoria of Object.keys(resultado) as InboxCategory[]) {
    resultado[categoria].sort((a, b) => b.prioridad - a.prioridad);
  }

  return resultado;
}

export interface ResumenPorConsorcio {
  organizationId: string;
  organizationName: string;
  requierenAccion: number;
  requierenDecision: number;
  faltaInformacion: number;
}

/**
 * Vista derivada, agrupada por consorcio (§15 del pedido) — nunca una
 * entidad nueva, se recalcula sobre la lista ya clasificada. Una
 * observación que aplica a varias organizaciones (proveedor compartido)
 * cuenta en cada una — mismo criterio ya usado por el cruce de contexto de
 * Fase 4.F (organizationNames/organizationIds, nunca un "dueño" único
 * inventado).
 */
export function agruparPorConsorcio(clasificadas: Record<InboxCategory, ObservacionClasificada[]>): ResumenPorConsorcio[] {
  const porOrg = new Map<string, ResumenPorConsorcio>();

  function contar(o: ObservacionClasificada, campo: "requierenAccion" | "requierenDecision" | "faltaInformacion") {
    o.organizationIds.forEach((id, i) => {
      const name = o.organizationNames[i];
      if (!name) return;
      const entry = porOrg.get(id) ?? { organizationId: id, organizationName: name, requierenAccion: 0, requierenDecision: 0, faltaInformacion: 0 };
      entry[campo]++;
      porOrg.set(id, entry);
    });
  }

  for (const o of clasificadas.NEEDS_ACTION) contar(o, "requierenAccion");
  for (const o of clasificadas.NEEDS_DECISION) contar(o, "requierenDecision");
  for (const o of clasificadas.NEEDS_DATA) contar(o, "faltaInformacion");

  return [...porOrg.values()].sort(
    (a, b) => b.requierenAccion + b.requierenDecision - (a.requierenAccion + a.requierenDecision)
  );
}
