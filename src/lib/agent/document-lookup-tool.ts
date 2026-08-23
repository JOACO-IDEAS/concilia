import "server-only";
import type { Prisma } from "@/generated/prisma/client";

const LIMIT = 10;
export const DOCUMENT_LOOKUP_TYPES = ["INVOICE", "INSURANCE_POLICY", "CONTRACT", "CERTIFICATE", "RECEIPT", "STATEMENT", "OTHER"] as const;
export type DocumentLookupType = typeof DOCUMENT_LOOKUP_TYPES[number];
export type DocumentLookupInput = {
  organization?: string;
  documentType?: DocumentLookupType;
  provider?: string;
  period?: string;
  amount?: number;
  expiresFrom?: string;
  expiresTo?: string;
};
export type DocumentLookupItem = {
  resultKey: string;
  documentType: string;
  title: string;
  organizationName: string;
  providerName: string | null;
  periodLabel: string | null;
  issuedAtLabel: string | null;
  expiresAtLabel: string | null;
  amountLabel: string | null;
  availability: "AVAILABLE" | "FILE_UNAVAILABLE";
};
export type DocumentLookupResult = {
  outcome: "FOUND" | "MULTIPLE_MATCHES" | "NOT_FOUND" | "INSUFFICIENT_CRITERIA";
  message: string;
  truncated: boolean;
  documents: DocumentLookupItem[];
};

const adminType: Partial<Record<DocumentLookupType, "INVOICE" | "CONTRACT" | "RECEIPT" | "STATEMENT" | "OTHER">> = {
  INVOICE: "INVOICE", CONTRACT: "CONTRACT", RECEIPT: "RECEIPT", STATEMENT: "STATEMENT", OTHER: "OTHER",
};
const providerTypes: Partial<Record<DocumentLookupType, Array<"ART" | "RC" | "MATRICULA" | "AFIP" | "ANSES" | "OTRO">>> = {
  INSURANCE_POLICY: ["ART", "RC"], CERTIFICATE: ["MATRICULA", "AFIP", "ANSES"], OTHER: ["OTRO"],
};
const typeLabels: Record<string, string> = { INVOICE: "Factura", CONTRACT: "Contrato", RECEIPT: "Recibo", STATEMENT: "Resumen", OTHER: "Documento", ART: "ART", RC: "Seguro de responsabilidad civil", MATRICULA: "Matrícula", AFIP: "Constancia AFIP", ANSES: "Constancia ANSES", OTRO: "Documento de proveedor" };

function safeText(value: string | undefined, max: number) {
  const normalized = value?.normalize("NFKC").trim();
  if (!normalized) return undefined;
  if (normalized.length > max || /[<>\u0000-\u001f]/.test(normalized)) throw new Error("INVALID_DOCUMENT_FILTER");
  return normalized;
}
function date(value: string | undefined, end = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_DOCUMENT_FILTER");
  const result = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(result.getTime())) throw new Error("INVALID_DOCUMENT_FILTER");
  return result;
}
function label(value: Date | null) { return value ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(value) : null; }
function money(value: { toString(): string } | null, currency: string | null) { return value ? new Intl.NumberFormat("es-AR", { style: "currency", currency: currency || "ARS", maximumFractionDigits: 2 }).format(Number(value.toString())) : null; }

export async function loadDocumentLookup(tx: Prisma.TransactionClient, administratorId: string, organizationId: string, input: DocumentLookupInput): Promise<DocumentLookupResult> {
  const organization = safeText(input.organization, 80);
  const provider = safeText(input.provider, 80);
  if (!input.documentType && !provider && !input.period && input.amount === undefined && !input.expiresFrom && !input.expiresTo) return { outcome: "INSUFFICIENT_CRITERIA", message: "Necesito al menos un tipo, proveedor, período, importe o vencimiento para buscar documentos.", truncated: false, documents: [] };
  if (input.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new Error("INVALID_DOCUMENT_FILTER");
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) throw new Error("INVALID_DOCUMENT_FILTER");
  const access = await tx.organization.findFirst({ where: { id: organizationId, deletedAt: null, status: "ACTIVE", administrators: { some: { administratorId, administrator: { deletedAt: null } } }, ...(organization ? { name: { equals: organization, mode: "insensitive" } } : {}) }, select: { id: true, name: true } });
  if (!access) throw new Error("DOCUMENT_ACCESS_DENIED");
  const periodStart = input.period ? new Date(`${input.period}-01T00:00:00.000Z`) : undefined;
  const periodEnd = periodStart ? new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1)) : undefined;
  const commonProvider = provider ? { provider: { name: { contains: provider, mode: "insensitive" as const }, deletedAt: null } } : {};
  const [administrative, compliance] = await Promise.all([
    adminType[input.documentType ?? "OTHER"] && input.documentType !== "INSURANCE_POLICY" && input.documentType !== "CERTIFICATE"
      ? tx.administrativeDocument.findMany({ where: { organizationId, deletedAt: null, status: "ACTIVE", type: input.documentType ? adminType[input.documentType] : undefined, ...commonProvider, period: periodStart ? { gte: periodStart, lt: periodEnd } : undefined, amount: input.amount === undefined ? undefined : input.amount, expiresAt: input.expiresFrom || input.expiresTo ? { gte: date(input.expiresFrom), lte: date(input.expiresTo, true) } : undefined }, select: { id: true, type: true, title: true, period: true, issuedAt: true, expiresAt: true, amount: true, currency: true, storageReference: true, provider: { select: { name: true } } }, orderBy: [{ issuedAt: "desc" }, { id: "asc" }], take: LIMIT + 1 })
      : Promise.resolve([]),
    (!input.documentType || providerTypes[input.documentType]) && !input.period && input.amount === undefined
      ? tx.providerDocument.findMany({ where: { deletedAt: null, status: "ACTIVE", type: input.documentType ? { in: providerTypes[input.documentType] } : undefined, provider: { deletedAt: null, ...(provider ? { name: { contains: provider, mode: "insensitive" as const } } : {}) }, validTo: input.expiresFrom || input.expiresTo ? { gte: date(input.expiresFrom), lte: date(input.expiresTo, true) } : undefined, OR: [{ organizationId }, { organizationId: null, provider: { organizations: { some: { organizationId, activo: true } } } }] }, select: { id: true, type: true, issuedAt: true, validTo: true, evidenceUrl: true, documentNumber: true, provider: { select: { name: true } } }, orderBy: [{ issuedAt: "desc" }, { id: "asc" }], take: LIMIT + 1 })
      : Promise.resolve([]),
  ]);
  const documents: DocumentLookupItem[] = [
    ...administrative.map((row) => ({ resultKey: `administrative:${row.id}`, documentType: typeLabels[row.type], title: row.title, organizationName: access.name, providerName: row.provider?.name ?? null, periodLabel: row.period ? row.period.toISOString().slice(0, 7) : null, issuedAtLabel: label(row.issuedAt), expiresAtLabel: label(row.expiresAt), amountLabel: money(row.amount, row.currency), availability: row.storageReference ? "AVAILABLE" as const : "FILE_UNAVAILABLE" as const })),
    ...compliance.map((row) => ({ resultKey: `provider:${row.id}`, documentType: typeLabels[row.type], title: row.documentNumber ? `${typeLabels[row.type]} · ${row.documentNumber}` : typeLabels[row.type], organizationName: access.name, providerName: row.provider.name, periodLabel: null, issuedAtLabel: label(row.issuedAt), expiresAtLabel: label(row.validTo), amountLabel: null, availability: row.evidenceUrl ? "AVAILABLE" as const : "FILE_UNAVAILABLE" as const })),
  ].slice(0, LIMIT);
  const truncated = administrative.length + compliance.length > LIMIT;
  const outcome = documents.length === 0 ? "NOT_FOUND" : documents.length === 1 ? "FOUND" : "MULTIPLE_MATCHES";
  return { outcome, truncated, documents, message: outcome === "NOT_FOUND" ? "No encontré documentos reales con esos criterios." : outcome === "FOUND" ? "Encontré este documento." : truncated ? `Encontré más de ${LIMIT} documentos. Te muestro los primeros ${LIMIT}.` : `Encontré ${documents.length} documentos posibles.` };
}
