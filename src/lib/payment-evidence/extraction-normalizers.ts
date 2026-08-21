import { createHash } from "node:crypto";

export const MAX_EXTRACTION_TEXT = 16_000;
export const MAX_FACTS = 32;
export const MAX_FACT_TEXT = 255;

export class ExtractionNormalizationError extends Error {
  constructor() { super("La evidencia no pudo normalizarse."); this.name = "ExtractionNormalizationError"; }
}

function safeText(value: string, max = MAX_FACT_TEXT) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw new ExtractionNormalizationError();
  return normalized;
}

export function normalizeAmount(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new ExtractionNormalizationError();
    return Math.round(value * 100) / 100;
  }
  let text = safeText(value, 64).replace(/(?:ARS|\$)/gi, "").replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(text)) throw new ExtractionNormalizationError();
  if (text.includes(",") && text.includes(".")) text = text.replace(/\./g, "").replace(",", ".");
  else if (text.includes(",")) text = text.replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) throw new ExtractionNormalizationError();
  return Math.round(amount * 100) / 100;
}

export function normalizeCurrency(value?: string | null): string | null {
  if (!value) return null;
  const currency = safeText(value, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new ExtractionNormalizationError();
  return currency;
}

export function normalizeDate(value: string): Date {
  const text = safeText(value, 10);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  let year: number; let month: number; let day: number;
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (local) {
    day = Number(local[1]); month = Number(local[2]); year = Number(local[3]);
    // Both values <= 12 are inherently ambiguous without an explicit locale.
    if (day <= 12 && month <= 12) throw new ExtractionNormalizationError();
  } else throw new ExtractionNormalizationError();
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new ExtractionNormalizationError();
  return date;
}

export function normalizeReference(value: string): string {
  return safeText(value).toUpperCase();
}

export function normalizeDisplayText(value: string): string {
  return safeText(value);
}

export function protectAccountIdentifier(type: "CBU" | "CVU" | "ALIAS" | "ACCOUNT" | "OTHER", value: string) {
  const text = safeText(value, 128);
  const normalized = type === "ALIAS"
    ? text.toLocaleLowerCase("en-US").replace(/\s/g, "")
    : text.replace(/[\s.-]/g, "").toLocaleUpperCase("en-US");
  if (!normalized) throw new ExtractionNormalizationError();
  if ((type === "CBU" || type === "CVU") && !/^\d{22}$/.test(normalized)) throw new ExtractionNormalizationError();
  const fingerprint = createHash("sha256").update(`${type}\0${normalized}`, "utf8").digest("hex");
  const suffix = normalized.slice(-4);
  return { normalizedFingerprint: fingerprint, maskedValue: suffix ? `••••${suffix}` : "••••" };
}
