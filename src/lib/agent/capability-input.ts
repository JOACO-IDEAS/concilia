import type { AgentCapabilityName } from "./capability-registry";

export function validateAgentCapabilityInput(capability: AgentCapabilityName, value: unknown): Record<string, string | number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (capability === "TODAY_ATTENTION" || capability === "RECONCILIATION_REVIEW" || capability === "DEBT_OVERVIEW") return Object.keys(input).length === 0 ? {} : null;
  if (capability === "ORGANIZATION_LOOKUP") {
    if (Object.keys(input).some((key) => key !== "query") || typeof input.query !== "string") return null;
    const query = input.query.normalize("NFKC").trim();
    return query.length >= 2 && query.length <= 80 && !/[<>\u0000-\u001f]/.test(query) ? { query } : null;
  }
  if (Object.keys(input).some((key) => !["amount", "reference", "date"].includes(key))) return null;
  const amount = input.amount == null ? undefined : input.amount;
  const reference = input.reference == null ? undefined : input.reference;
  const date = input.date == null ? undefined : input.date;
  if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)) return null;
  if (reference !== undefined && (typeof reference !== "string" || !/^[A-Za-z0-9_-]{2,40}$/.test(reference))) return null;
  if (date !== undefined && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime()))) return null;
  if (amount === undefined && reference === undefined && date === undefined) return null;
  return { ...(amount !== undefined ? { amount } : {}), ...(reference !== undefined ? { reference } : {}), ...(date !== undefined ? { date } : {}) };
}
