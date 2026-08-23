export type AgentCapabilityName = "TODAY_ATTENTION" | "RECONCILIATION_REVIEW" | "DEBT_OVERVIEW" | "RECONCILIATION_LOOKUP" | "ORGANIZATION_LOOKUP";

export type AgentCapabilityDefinition = Readonly<{
  capability: AgentCapabilityName;
  availability: "AVAILABLE" | "UNAVAILABLE";
  nature: "READ_ONLY" | "WRITE";
  requiresConfirmation: boolean;
  description: string;
  inputSchema: Readonly<Record<string, string>>;
  outputSchema: Readonly<Record<string, string>>;
  modelInputSchema: Readonly<{ type: "object"; properties: Readonly<Record<string, unknown>>; required: readonly string[]; additionalProperties: false }>;
}>;

/** Metadata only: executable functions and Prisma are deliberately absent. */
export const AGENT_CAPABILITIES: readonly AgentCapabilityDefinition[] = Object.freeze([
  Object.freeze({
    capability: "TODAY_ATTENTION",
    availability: "AVAILABLE",
    nature: "READ_ONLY",
    requiresConfirmation: false,
    description: "Resume situaciones reales que requieren atención en una organización autorizada.",
    inputSchema: Object.freeze({ organizationId: "authorized-context" }),
    outputSchema: Object.freeze({ needsDecision: "bounded-metric", needsInformation: "bounded-metric" }),
    modelInputSchema: Object.freeze({ type: "object", properties: Object.freeze({}), required: Object.freeze([]), additionalProperties: false }),
  }),
  Object.freeze({ capability: "RECONCILIATION_REVIEW", availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false, description: "Lista casos reales que requieren una decisión humana.", inputSchema: Object.freeze({ organizationId: "authorized-context" }), outputSchema: Object.freeze({ total: "number", cases: "max-10" }), modelInputSchema: Object.freeze({ type: "object", properties: Object.freeze({}), required: Object.freeze([]), additionalProperties: false }) }),
  Object.freeze({ capability: "DEBT_OVERVIEW", availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false, description: "Ordena saldos pendientes reales de organizaciones autorizadas.", inputSchema: Object.freeze({ administratorId: "authenticated-context" }), outputSchema: Object.freeze({ results: "max-10", truncated: "boolean" }), modelInputSchema: Object.freeze({ type: "object", properties: Object.freeze({}), required: Object.freeze([]), additionalProperties: false }) }),
  Object.freeze({ capability: "RECONCILIATION_LOOKUP", availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false, description: "Busca movimientos por filtros acotados y validados.", inputSchema: Object.freeze({ organizationId: "authorized-context", amount: "positive-decimal?", reference: "safe-string?", date: "iso-date?" }), outputSchema: Object.freeze({ matches: "max-10", truncated: "boolean" }), modelInputSchema: Object.freeze({ type: "object", properties: Object.freeze({ amount: { type: ["number", "null"], exclusiveMinimum: 0 }, reference: { type: ["string", "null"], minLength: 2, maxLength: 40, pattern: "^[A-Za-z0-9_-]+$" }, date: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" } }), required: Object.freeze(["amount", "reference", "date"]), additionalProperties: false }) }),
  Object.freeze({ capability: "ORGANIZATION_LOOKUP", availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false, description: "Busca organizaciones reales accesibles por nombre.", inputSchema: Object.freeze({ administratorId: "authenticated-context", query: "safe-string" }), outputSchema: Object.freeze({ organizations: "max-10", truncated: "boolean" }), modelInputSchema: Object.freeze({ type: "object", properties: Object.freeze({ query: { type: "string", minLength: 2, maxLength: 80 } }), required: Object.freeze(["query"]), additionalProperties: false }) }),
]);

export function getAgentCapability(name: string) {
  return AGENT_CAPABILITIES.find((definition) => definition.capability === name) ?? null;
}

export function getModelExposedCapabilities() {
  return AGENT_CAPABILITIES.filter(isModelExposableCapability);
}

export function isModelExposableCapability(definition: Pick<AgentCapabilityDefinition, "availability" | "nature" | "requiresConfirmation">) {
  return definition.availability === "AVAILABLE" && definition.nature === "READ_ONLY" && definition.requiresConfirmation === false;
}
