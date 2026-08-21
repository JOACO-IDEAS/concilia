import type { AgentCapabilityName } from "./capability-registry";

function normalizeIntent(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-AR").replace(/[¿?!.]/g, "").replace(/\s+/g, " ");
}

const TODAY_ATTENTION_INTENTS = new Set([
  "que requiere mi atencion hoy",
  "que necesita mi atencion hoy",
  "que tengo pendiente",
  "que tengo que revisar",
]);

export function resolveAgentIntent(message: string): AgentCapabilityName | null {
  return TODAY_ATTENTION_INTENTS.has(normalizeIntent(message)) ? "TODAY_ATTENTION" : null;
}
