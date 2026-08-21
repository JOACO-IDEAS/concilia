export type AgentCapabilityName = "TODAY_ATTENTION";

export type AgentCapabilityDefinition = Readonly<{
  capability: AgentCapabilityName;
  availability: "AVAILABLE";
  nature: "READ_ONLY";
  requiresConfirmation: false;
  description: string;
}>;

/** Metadata only: executable functions and Prisma are deliberately absent. */
export const AGENT_CAPABILITIES: readonly AgentCapabilityDefinition[] = Object.freeze([
  Object.freeze({
    capability: "TODAY_ATTENTION",
    availability: "AVAILABLE",
    nature: "READ_ONLY",
    requiresConfirmation: false,
    description: "Resume situaciones reales que requieren atención en una organización autorizada.",
  }),
]);

export function getAgentCapability(name: string) {
  return AGENT_CAPABILITIES.find((definition) => definition.capability === name) ?? null;
}
