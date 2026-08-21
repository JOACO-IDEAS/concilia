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

export type AgentIntent = { capability: AgentCapabilityName; input: Record<string, string | number> };

export function resolveAgentIntent(message: string): AgentIntent | null {
  const normalized = normalizeIntent(message);
  if (TODAY_ATTENTION_INTENTS.has(normalized)) return { capability: "TODAY_ATTENTION", input: {} };
  if (/^(que )?pagos (necesitan|requieren) (revision|mi decision)$|^(mostrame )?conciliaciones pendientes$|^pagos para revisar$/.test(normalized)) return { capability: "RECONCILIATION_REVIEW", input: {} };
  if (/^(donde tengo (mas|mayor) mora|que consorcios tienen mayor deuda|mostrame los principales saldos pendientes|quien debe mas)$/.test(normalized)) return { capability: "DEBT_OVERVIEW", input: {} };
  if (/\b(pago|movimiento)\b/.test(normalized)) {
    const amount = normalized.match(/(?:\$\s*)?([0-9][0-9.]*(?:,[0-9]{1,2})?)/)?.[1];
    const reference = normalized.match(/(?:referencia|ref)\s+([a-z0-9_-]{2,40})/)?.[1];
    const date = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if (amount || reference || date) return { capability: "RECONCILIATION_LOOKUP", input: { ...(amount ? { amount: Number(amount.replace(/\./g, "").replace(",", ".")) } : {}), ...(reference ? { reference } : {}), ...(date ? { date } : {}) } };
  }
  const organization = normalized.match(/^(?:mostrame|como esta)\s+(.{2,80})$/)?.[1];
  if (organization && !/^(el|la|los|las|esto|eso|documento|factura)\b/.test(organization)) return { capability: "ORGANIZATION_LOOKUP", input: { query: organization } };
  return null;
}
