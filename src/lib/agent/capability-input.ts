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
  if (capability === "DOCUMENT_LOOKUP") {
    const allowed = ["organization", "documentType", "provider", "period", "amount", "expiresFrom", "expiresTo"];
    if (Object.keys(input).some((key) => !allowed.includes(key))) return null;
    const output: Record<string, string | number> = {};
    for (const key of ["organization", "provider"] as const) { if (input[key] != null) { if (typeof input[key] !== "string") return null; const normalized = input[key].normalize("NFKC").trim(); if (normalized.length < 2 || normalized.length > 80 || /[<>\u0000-\u001f]/.test(normalized)) return null; output[key] = normalized; } }
    if (input.documentType != null) { if (typeof input.documentType !== "string" || !["INVOICE", "INSURANCE_POLICY", "CONTRACT", "CERTIFICATE", "RECEIPT", "STATEMENT", "OTHER"].includes(input.documentType)) return null; output.documentType = input.documentType; }
    if (input.period != null) { if (typeof input.period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) return null; output.period = input.period; }
    if (input.amount != null) { if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) return null; output.amount = input.amount; }
    for (const key of ["expiresFrom", "expiresTo"] as const) { if (input[key] != null) { if (typeof input[key] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input[key])) return null; output[key] = input[key]; } }
    return Object.keys(output).length ? output : null;
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
