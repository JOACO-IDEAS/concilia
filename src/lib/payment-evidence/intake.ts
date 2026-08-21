import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentEvidenceIntakeSource, PaymentEvidenceIntakeType } from "@/generated/prisma/enums";

const SAFE_DENIAL = "Recurso no disponible.";
const SAFE_INVALID = "La evidencia recibida no es válida.";
const EXTERNAL_REFERENCE_MAX = 255;
const STORAGE_REFERENCE_MAX = 512;
const MIME_TYPE_MAX = 127;
const SOURCES = new Set(["WEB_UPLOAD", "WHATSAPP", "EMAIL", "API", "OTHER"]);
const EVIDENCE_TYPES = new Set(["IMAGE", "PDF", "TEXT", "STRUCTURED_DATA"]);

type IntakeRow = {
  id: string;
  organizationId: string;
  source: PaymentEvidenceIntakeSource;
  evidenceType: PaymentEvidenceIntakeType;
  state: "RECEIVED";
  receivedAt: Date;
};

export class PaymentEvidenceIntakeAccessError extends Error {
  constructor() { super(SAFE_DENIAL); this.name = "PaymentEvidenceIntakeAccessError"; }
}

export class PaymentEvidenceIntakeValidationError extends Error {
  constructor() { super(SAFE_INVALID); this.name = "PaymentEvidenceIntakeValidationError"; }
}

export type RegisterPaymentEvidenceInput = {
  administratorId: string;
  organizationId: string;
  source: PaymentEvidenceIntakeSource;
  evidenceType: PaymentEvidenceIntakeType;
  receivedAt: Date;
  externalReference?: string | null;
  storageReference?: string | null;
  declaredMimeType?: string | null;
};

export type RegisterPaymentEvidenceResult = {
  status: "CREATED" | "ALREADY_RECEIVED";
  intake: {
    id: string;
    organizationId: string;
    source: PaymentEvidenceIntakeSource;
    evidenceType: PaymentEvidenceIntakeType;
    state: "RECEIVED";
    receivedAt: Date;
  };
  idempotency: "EXTERNAL_REFERENCE" | "NONE";
};

function optionalText(value: string | null | undefined, max: number) {
  if (value == null) return null;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw new PaymentEvidenceIntakeValidationError();
  return normalized;
}

function validate(input: RegisterPaymentEvidenceInput) {
  if (
    !input.administratorId.trim()
    || !input.organizationId.trim()
    || !SOURCES.has(input.source)
    || !EVIDENCE_TYPES.has(input.evidenceType)
    || !(input.receivedAt instanceof Date)
    || Number.isNaN(input.receivedAt.getTime())
  ) throw new PaymentEvidenceIntakeValidationError();
  const externalReference = optionalText(input.externalReference, EXTERNAL_REFERENCE_MAX);
  const storageReference = optionalText(input.storageReference, STORAGE_REFERENCE_MAX);
  const declaredMimeType = optionalText(input.declaredMimeType, MIME_TYPE_MAX);
  if (!externalReference && !storageReference) throw new PaymentEvidenceIntakeValidationError();
  // Storage references are opaque keys, not paths or signed/public URLs.
  if (storageReference && (/^[a-z][a-z0-9+.-]*:\/\//i.test(storageReference) || storageReference.includes("?") || storageReference.split(/[\\/]/).includes(".."))) {
    throw new PaymentEvidenceIntakeValidationError();
  }
  if (declaredMimeType && !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(declaredMimeType)) throw new PaymentEvidenceIntakeValidationError();
  return { externalReference, storageReference, declaredMimeType };
}

type TrustedTransportInput = Omit<RegisterPaymentEvidenceInput, "administratorId" | "organizationId">;
type TransactionClient = Prisma.TransactionClient;

function validateTrusted(input: TrustedTransportInput) {
  return validate({ ...input, administratorId: "trusted-transport", organizationId: "resolved-tenant" });
}

function present(row: IntakeRow, status: RegisterPaymentEvidenceResult["status"], idempotency: RegisterPaymentEvidenceResult["idempotency"]): RegisterPaymentEvidenceResult {
  return { status, idempotency, intake: { id: row.id, organizationId: row.organizationId, source: row.source, evidenceType: row.evidenceType, state: row.state, receivedAt: row.receivedAt } };
}

async function persistIntake(
  tx: TransactionClient,
  input: TrustedTransportInput,
  organizationId: string,
  receivedBy: string | null,
  normalized: ReturnType<typeof validateTrusted>,
) {
  if (normalized.externalReference) {
    const existing = await tx.paymentEvidenceIntake.findUnique({
      where: { organizationId_source_externalReference: { organizationId, source: input.source, externalReference: normalized.externalReference } },
    });
    if (existing) return present(existing, "ALREADY_RECEIVED", "EXTERNAL_REFERENCE");
  }
  try {
    const created = await tx.paymentEvidenceIntake.create({ data: {
      organizationId,
      source: input.source,
      evidenceType: input.evidenceType,
      externalReference: normalized.externalReference,
      storageReference: normalized.storageReference,
      declaredMimeType: normalized.declaredMimeType,
      receivedAt: input.receivedAt,
      receivedBy,
    } });
    return present(created, "CREATED", normalized.externalReference ? "EXTERNAL_REFERENCE" : "NONE");
  } catch (error) {
    if (!normalized.externalReference || typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error;
    const existing = await tx.paymentEvidenceIntake.findUnique({
      where: { organizationId_source_externalReference: { organizationId, source: input.source, externalReference: normalized.externalReference } },
    });
    if (!existing) throw error;
    return present(existing, "ALREADY_RECEIVED", "EXTERNAL_REFERENCE");
  }
}

/** Internal transport boundary. Tenant resolution executes inside the same transaction and must fail closed. */
export async function registerPaymentEvidenceFromTrustedTransport(
  input: TrustedTransportInput,
  resolveTenant: (tx: TransactionClient) => Promise<{ organizationId: string } | null>,
): Promise<RegisterPaymentEvidenceResult> {
  const normalized = validateTrusted(input);
  return prisma.$transaction(async (tx) => {
    const tenant = await resolveTenant(tx);
    if (!tenant) throw new PaymentEvidenceIntakeAccessError();
    return persistIntake(tx, input, tenant.organizationId, null, normalized);
  });
}

/** Register receipt only. It performs no extraction, matching, correlation, learning or reconciliation. */
export async function registerPaymentEvidence(input: RegisterPaymentEvidenceInput): Promise<RegisterPaymentEvidenceResult> {
  const normalized = validate(input);
  return prisma.$transaction(async (tx) => {
    const membership = await tx.organizationAdministrator.findUnique({
      where: { administratorId_organizationId: { administratorId: input.administratorId, organizationId: input.organizationId } },
      select: { administrator: { select: { deletedAt: true } }, organization: { select: { deletedAt: true, status: true } } },
    });
    if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") throw new PaymentEvidenceIntakeAccessError();

    return persistIntake(tx, input, input.organizationId, input.administratorId, normalized);
  });
}
