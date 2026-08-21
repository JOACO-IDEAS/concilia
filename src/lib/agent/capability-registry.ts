export type AgentCapabilityName = "TODAY_ATTENTION" | "RECONCILIATION_REVIEW" | "DEBT_OVERVIEW" | "RECONCILIATION_LOOKUP" | "ORGANIZATION_LOOKUP";

export type AgentCapabilityDefinition = Readonly<{
  capability: AgentCapabilityName;
  availability: "AVAILABLE";
  nature: "READ_ONLY";
  requiresConfirmation: false;
  description: string;
  inputSchema: Readonly<Record<string, string>>;
  outputSchema: Readonly<Record<string, string>>;
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
  }),
  Object.freeze({ capability: "RECONCILIATION_REVIEW", availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false, description: "Lista casos reales que requieren una decisión humana.", inputSchema: Object.freeze({ organizationId: "authorized-context" }), outputSchema: Object.freeze({ total: "number", cases: "max-10" }) }),
  Object.freeze({ capability: "DEBT_OVERVIEW", availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false, description: "Ordena saldos pendientes reales de organizaciones autorizadas.", inputSchema: Object.freeze({ administratorId: "authenticated-context" }), outputSchema: Object.freeze({ results: "max-10", truncated: "boolean" }) }),
  Object.freeze({ capability: "RECONCILIATION_LOOKUP", availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false, description: "Busca movimientos por filtros acotados y validados.", inputSchema: Object.freeze({ organizationId: "authorized-context", amount: "positive-decimal?", reference: "safe-string?", date: "iso-date?" }), outputSchema: Object.freeze({ matches: "max-10", truncated: "boolean" }) }),
  Object.freeze({ capability: "ORGANIZATION_LOOKUP", availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false, description: "Busca organizaciones reales accesibles por nombre.", inputSchema: Object.freeze({ administratorId: "authenticated-context", query: "safe-string" }), outputSchema: Object.freeze({ organizations: "max-10", truncated: "boolean" }) }),
]);

export function getAgentCapability(name: string) {
  return AGENT_CAPABILITIES.find((definition) => definition.capability === name) ?? null;
}
