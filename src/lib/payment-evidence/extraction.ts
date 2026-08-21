import "server-only";

import { prisma } from "@/lib/prisma";
import {
  ExtractionNormalizationError,
  MAX_EXTRACTION_TEXT,
  MAX_FACTS,
  normalizeAmount,
  normalizeCurrency,
  normalizeDate,
  normalizeDisplayText,
  normalizeReference,
  protectAccountIdentifier,
} from "./extraction-normalizers";

const EXTRACTOR = "concilia-deterministic";
const EXTRACTOR_VERSION = "1";
const DATE_ROLES = new Set<DateRole>(["OPERATION", "ISSUED", "ACCREDITATION", "UNKNOWN"]);
const ACCOUNT_TYPES = new Set<AccountType>(["CBU", "CVU", "ALIAS", "ACCOUNT", "OTHER"]);

export class PaymentEvidenceExtractionAccessError extends Error {
  constructor() { super("Recurso no disponible."); this.name = "PaymentEvidenceExtractionAccessError"; }
}

type DateRole = "OPERATION" | "ISSUED" | "ACCREDITATION" | "UNKNOWN";
type AccountType = "CBU" | "CVU" | "ALIAS" | "ACCOUNT" | "OTHER";

export type StructuredEvidenceFacts = {
  amount?: { value: string | number; currency?: string | null };
  date?: { value: string; role?: DateRole };
  operationReference?: string;
  bankName?: string;
  payerDisplayName?: string;
  accountIdentifier?: { type: AccountType; value: string };
  transferReference?: string;
};

export type PaymentEvidenceExtractionPayload =
  | { kind: "STRUCTURED"; facts: StructuredEvidenceFacts }
  | { kind: "TEXT"; text: string }
  | { kind: "NONE" };

export type PaymentEvidenceExtractorInput = {
  administratorId: string;
  organizationId: string;
  intakeId: string;
  payload: PaymentEvidenceExtractionPayload;
  extractedAt: Date;
};

export type CanonicalPaymentEvidenceFact = {
  type: "AMOUNT" | "DATE" | "OPERATION_REFERENCE" | "BANK_NAME" | "PAYER_DISPLAY_NAME" | "ACCOUNT_IDENTIFIER" | "TRANSFER_REFERENCE";
  normalizedValue?: string;
  numericValue?: number;
  dateValue?: Date;
  currency?: string | null;
  dateRole?: DateRole;
  accountType?: AccountType;
  normalizedFingerprint?: string;
  maskedValue?: string;
  /** Extractor confidence only; never matching or decision confidence. */
  confidence?: number;
};

export type PaymentEvidenceExtractionResult = {
  status: "SUCCEEDED" | "FAILED" | "UNSUPPORTED";
  runId: string;
  intakeId: string;
  facts: CanonicalPaymentEvidenceFact[];
  errorCode: "INVALID_INPUT" | "EXTRACTION_NOT_AVAILABLE" | null;
};

export interface PaymentEvidenceExtractor {
  readonly name: string;
  readonly version: string;
  supports(evidenceType: "IMAGE" | "PDF" | "TEXT" | "STRUCTURED_DATA", payload: PaymentEvidenceExtractionPayload): boolean;
  extract(payload: PaymentEvidenceExtractionPayload): CanonicalPaymentEvidenceFact[];
}

function factsFromStructured(input: StructuredEvidenceFacts): CanonicalPaymentEvidenceFact[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ExtractionNormalizationError();
  if (input.date?.role && !DATE_ROLES.has(input.date.role)) throw new ExtractionNormalizationError();
  if (input.accountIdentifier && !ACCOUNT_TYPES.has(input.accountIdentifier.type)) throw new ExtractionNormalizationError();
  const facts: CanonicalPaymentEvidenceFact[] = [];
  if (input.amount) facts.push({ type: "AMOUNT", numericValue: normalizeAmount(input.amount.value), currency: normalizeCurrency(input.amount.currency) });
  if (input.date) facts.push({ type: "DATE", dateValue: normalizeDate(input.date.value), dateRole: input.date.role ?? "UNKNOWN" });
  if (input.operationReference) facts.push({ type: "OPERATION_REFERENCE", normalizedValue: normalizeReference(input.operationReference) });
  if (input.bankName) facts.push({ type: "BANK_NAME", normalizedValue: normalizeDisplayText(input.bankName) });
  if (input.payerDisplayName) facts.push({ type: "PAYER_DISPLAY_NAME", normalizedValue: normalizeDisplayText(input.payerDisplayName) });
  if (input.accountIdentifier) facts.push({ type: "ACCOUNT_IDENTIFIER", accountType: input.accountIdentifier.type, ...protectAccountIdentifier(input.accountIdentifier.type, input.accountIdentifier.value) });
  if (input.transferReference) facts.push({ type: "TRANSFER_REFERENCE", normalizedValue: normalizeDisplayText(input.transferReference) });
  if (facts.length === 0 || facts.length > MAX_FACTS) throw new ExtractionNormalizationError();
  return deduplicateFacts(facts);
}

function textCurrency(value: string) { return /(?:ARS|\$)/i.test(value) ? "ARS" : null; }

export function factsFromText(text: string): CanonicalPaymentEvidenceFact[] {
  if (typeof text !== "string" || text.length > MAX_EXTRACTION_TEXT) throw new ExtractionNormalizationError();
  const structured: StructuredEvidenceFacts = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    let match: RegExpMatchArray | null;
    if ((match = line.match(/^(?:importe|monto)\s*:\s*(.+)$/i))) structured.amount = { value: match[1], currency: textCurrency(match[1]) };
    else if ((match = line.match(/^fecha(?:\s+de\s+operaci[oó]n)?\s*:\s*(.+)$/i))) structured.date = { value: match[1], role: "OPERATION" };
    else if ((match = line.match(/^(?:operaci[oó]n|n[uú]mero de operaci[oó]n)\s*:\s*(.+)$/i))) structured.operationReference = match[1];
    else if ((match = line.match(/^banco\s*:?\s+(.+)$/i))) structured.bankName = match[1];
    else if ((match = line.match(/^(?:ordenante|titular)\s*:\s*(.+)$/i))) structured.payerDisplayName = match[1];
    else if ((match = line.match(/^(CBU|CVU|ALIAS|CUENTA)\s*:\s*(.+)$/i))) structured.accountIdentifier = { type: match[1].toUpperCase() === "CUENTA" ? "ACCOUNT" : match[1].toUpperCase() as AccountType, value: match[2] };
    else if ((match = line.match(/^(?:concepto|descripci[oó]n|referencia)\s*:\s*(.+)$/i))) structured.transferReference = match[1];
  }
  return factsFromStructured(structured);
}

export function deduplicateFacts(facts: CanonicalPaymentEvidenceFact[]) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = JSON.stringify(fact, (_key, value) => value instanceof Date ? value.toISOString() : value);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export const deterministicPaymentEvidenceExtractor: PaymentEvidenceExtractor = {
  name: EXTRACTOR,
  version: EXTRACTOR_VERSION,
  supports(evidenceType, payload) {
    return (evidenceType === "TEXT" && payload.kind === "TEXT") || (evidenceType === "STRUCTURED_DATA" && payload.kind === "STRUCTURED");
  },
  extract(payload) {
    if (payload.kind === "TEXT") return factsFromText(payload.text);
    if (payload.kind === "STRUCTURED") return factsFromStructured(payload.facts);
    throw new ExtractionNormalizationError();
  },
};

function factData(organizationId: string, fact: CanonicalPaymentEvidenceFact) {
  const confidence = fact.confidence == null ? undefined : fact.confidence;
  if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new ExtractionNormalizationError();
  return { organizationId, type: fact.type, normalizedValue: fact.normalizedValue, numericValue: fact.numericValue, dateValue: fact.dateValue, currency: fact.currency, dateRole: fact.dateRole, accountType: fact.accountType, normalizedFingerprint: fact.normalizedFingerprint, maskedValue: fact.maskedValue, confidence };
}

/** Extracts and persists observations only; never assesses, correlates, resolves or learns. */
export async function extractPaymentEvidence(input: PaymentEvidenceExtractorInput): Promise<PaymentEvidenceExtractionResult> {
  if (!(input.extractedAt instanceof Date) || Number.isNaN(input.extractedAt.getTime())) throw new ExtractionNormalizationError();
  return prisma.$transaction(async (tx) => {
    const membership = await tx.organizationAdministrator.findUnique({
      where: { administratorId_organizationId: { administratorId: input.administratorId, organizationId: input.organizationId } },
      select: { administrator: { select: { deletedAt: true } }, organization: { select: { deletedAt: true, status: true } } },
    });
    if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") throw new PaymentEvidenceExtractionAccessError();
    const intake = await tx.paymentEvidenceIntake.findFirst({ where: { id: input.intakeId, organizationId: input.organizationId }, select: { id: true, evidenceType: true } });
    if (!intake) throw new PaymentEvidenceExtractionAccessError();

    let status: PaymentEvidenceExtractionResult["status"] = "SUCCEEDED";
    let errorCode: PaymentEvidenceExtractionResult["errorCode"] = null;
    let facts: CanonicalPaymentEvidenceFact[] = [];
    if (!deterministicPaymentEvidenceExtractor.supports(intake.evidenceType, input.payload)) {
      status = (intake.evidenceType === "PDF" || intake.evidenceType === "IMAGE") ? "UNSUPPORTED" : "FAILED";
      errorCode = status === "UNSUPPORTED" ? "EXTRACTION_NOT_AVAILABLE" : "INVALID_INPUT";
    } else {
      try { facts = deterministicPaymentEvidenceExtractor.extract(input.payload); }
      catch { status = "FAILED"; errorCode = "INVALID_INPUT"; facts = []; }
    }
    const run = await tx.paymentEvidenceExtractionRun.create({ data: {
      organizationId: input.organizationId,
      intakeId: input.intakeId,
      source: input.payload.kind === "STRUCTURED" ? "STRUCTURED" : input.payload.kind === "TEXT" ? "TEXT" : "EXTERNAL_EXTRACTOR",
      extractor: EXTRACTOR,
      extractorVersion: EXTRACTOR_VERSION,
      status,
      errorCode,
      extractedAt: input.extractedAt,
      createdBy: input.administratorId,
      facts: facts.length ? { create: facts.map((fact) => factData(input.organizationId, fact)) } : undefined,
    }, select: { id: true } });
    return { status, runId: run.id, intakeId: input.intakeId, facts, errorCode };
  });
}
