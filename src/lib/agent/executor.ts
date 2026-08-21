import type { AgentCapabilityName } from "./capability-registry";
import { getAgentCapability } from "./capability-registry";
import type { TodayAttentionResult } from "./today-attention-tool";

export type AgentToolContext = {
  todayAttention(): Promise<TodayAttentionResult>;
};

export type AgentResponse = {
  message: string;
  capability: AgentCapabilityName | null;
  presentation?: { kind: "ATTENTION_SUMMARY"; needsDecision: TodayAttentionResult["needsDecision"]; needsInformation: TodayAttentionResult["needsInformation"] };
};

/** Allowlisted dispatch only. User text and tool data never become executable instructions. */
export async function executeAgentCapability(capability: AgentCapabilityName, context: AgentToolContext): Promise<AgentResponse> {
  const definition = getAgentCapability(capability);
  if (!definition || definition.availability !== "AVAILABLE" || definition.nature !== "READ_ONLY") {
    return { message: "Esta consulta todavía no está disponible en ConcilIA Agent.", capability: null };
  }
  switch (capability) {
    case "TODAY_ATTENTION": {
      const result = await context.todayAttention();
      return { message: result.message, capability, presentation: { kind: "ATTENTION_SUMMARY", needsDecision: result.needsDecision, needsInformation: result.needsInformation } };
    }
  }
}
