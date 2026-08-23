import type { AgentResponse } from "./executor";
import { getAgentCapability, getModelExposedCapabilities, type AgentCapabilityName } from "./capability-registry";
import { validateAgentCapabilityInput } from "./capability-input";
import { resolveAgentIntent } from "./intent";
import type { AgentContextMessage, AgentModelProvider, AgentModelRequest } from "./model-provider";

export const AGENT_MAX_TOOL_CALLS = 3;
const UNAVAILABLE = "Esta consulta todavía no está disponible en ConcilIA Agent.";
const PROVIDER_FAILURE = "No pude interpretar esta consulta en este momento.";
export type AgentCapabilityExecutor = (capability: AgentCapabilityName, input: Record<string, string | number>) => Promise<AgentResponse>;

export function modelSafeProjection(response: AgentResponse): unknown {
  const presentation = response.presentation;
  if (!presentation) return { summary: response.message };
  if (presentation.kind === "ATTENTION_SUMMARY") return { summary: response.message, needsDecision: presentation.needsDecision, needsInformation: presentation.needsInformation };
  if (presentation.kind === "RECONCILIATION_REVIEW") return { summary: response.message, cases: presentation.cases.map(({ title, organizationName, amountLabel, reason }) => ({ title, organizationName, amountLabel, reason })) };
  if (presentation.kind === "DEBT_OVERVIEW") return { summary: response.message, results: presentation.results.map(({ organizationName, outstandingLabel, overdueUnits }) => ({ organizationName, outstandingLabel, overdueUnits })) };
  if (presentation.kind === "RECONCILIATION_LOOKUP") return { summary: response.message, matches: presentation.matches.map(({ amountLabel, organizationName, dateLabel, status }) => ({ amountLabel, organizationName, dateLabel, status })) };
  return { summary: response.message, organizations: presentation.organizations.map(({ name, address, status, unitCount, paymentCount }) => ({ name, address, status, unitCount, paymentCount })) };
}

export async function orchestrateAgentTurn(request: AgentModelRequest, provider: AgentModelProvider | null, execute: AgentCapabilityExecutor): Promise<AgentResponse> {
  if (!provider) { const intent = resolveAgentIntent(request.message); return intent ? execute(intent.capability, intent.input) : { message: UNAVAILABLE, capability: null }; }
  let selection;
  try { selection = await provider.select(request); } catch { return { message: PROVIDER_FAILURE, capability: null }; }
  // Free model text cannot establish facts without a trusted tool result.
  if (selection.kind === "MESSAGE") return { message: UNAVAILABLE, capability: null };
  const definition = getAgentCapability(selection.capability);
  if (!definition || !getModelExposedCapabilities().includes(definition)) return { message: UNAVAILABLE, capability: null };
  const input = validateAgentCapabilityInput(definition.capability, selection.arguments);
  if (!input) return { message: "Necesito un criterio más preciso para hacer esa consulta.", capability: null };
  let trusted: AgentResponse;
  try { trusted = await execute(definition.capability, input); } catch { return { message: "No pude completar esta consulta.", capability: definition.capability }; }
  try {
    const synthesized = await provider.synthesize({ ...request, capability: definition.capability, safeResult: modelSafeProjection(trusted), fallback: trusted.message });
    const safe = synthesized.normalize("NFKC").trim();
    if (!safe || safe.length > 800 || /<\/?[a-z][^>]*>|https?:\/\/|javascript:|\[[^\]]+\]\([^)]*\)|[\u0000-\u001f]/i.test(safe)) return trusted;
    return { ...trusted, message: safe };
  } catch { return trusted; }
}

export function boundedConversationContext(messages: AgentContextMessage[]): AgentContextMessage[] {
  return messages.slice(-8).reduceRight<{ items: AgentContextMessage[]; chars: number }>((state, item) => state.chars + item.content.length > 8_000 ? state : { items: [item, ...state.items], chars: state.chars + item.content.length }, { items: [], chars: 0 }).items;
}
