import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { PayerIdentitySignalType, PayerProvenanceSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const SAFE_DENIAL = "Recurso no disponible.";

export class PayerIdentityAccessError extends Error {
  constructor() {
    super(SAFE_DENIAL);
    this.name = "PayerIdentityAccessError";
  }
}

export class PayerIdentityConflictError extends Error {
  constructor(message = "La señal ya está registrada con otra identidad.") {
    super(message);
    this.name = "PayerIdentityConflictError";
  }
}

type Tx = Prisma.TransactionClient;

async function requireActiveOrganizationAccess(tx: Tx, administratorId: string, organizationId: string) {
  const membership = await tx.organizationAdministrator.findUnique({
    where: { administratorId_organizationId: { administratorId, organizationId } },
    select: {
      administrator: { select: { deletedAt: true } },
      organization: { select: { deletedAt: true, status: true } },
    },
  });
  if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") {
    throw new PayerIdentityAccessError();
  }
}

function requiredReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) throw new Error("La razón es obligatoria.");
  return normalized;
}

export type CreatePayerInput = {
  administratorId: string;
  organizationId: string;
  displayName?: string | null;
  source: PayerProvenanceSource;
  reason: string;
};

export async function createPayer(input: CreatePayerInput) {
  const reason = requiredReason(input.reason);
  const displayName = input.displayName?.trim() || null;
  return prisma.$transaction(async (tx) => {
    await requireActiveOrganizationAccess(tx, input.administratorId, input.organizationId);
    return tx.payer.create({
      data: {
        organizationId: input.organizationId,
        displayName,
        source: input.source,
        reason,
        createdBy: input.administratorId,
      },
    });
  });
}

export async function getPayer(administratorId: string, payerId: string) {
  return prisma.$transaction(async (tx) => {
    const payer = await tx.payer.findUnique({ where: { id: payerId } });
    if (!payer) throw new PayerIdentityAccessError();
    await requireActiveOrganizationAccess(tx, administratorId, payer.organizationId);
    return payer;
  });
}

function normalizeSignal(type: PayerIdentitySignalType, value: string) {
  const trimmed = value.normalize("NFKC").trim();
  if (!trimmed) throw new Error("La señal de identidad es obligatoria.");
  switch (type) {
    case PayerIdentitySignalType.PHONE:
    case PayerIdentitySignalType.WHATSAPP:
    case PayerIdentitySignalType.TAX_ID: {
      const digits = trimmed.replace(/\D/g, "");
      if (!digits) throw new Error("La señal de identidad no tiene un formato válido.");
      return digits;
    }
    case PayerIdentitySignalType.EMAIL:
      return trimmed.toLocaleLowerCase("en-US");
    default:
      return trimmed.replace(/\s+/g, " ").toLocaleUpperCase("en-US");
  }
}

function protectSignal(type: PayerIdentitySignalType, value: string) {
  const normalized = normalizeSignal(type, value);
  const normalizedFingerprint = createHash("sha256").update(`${type}\0${normalized}`, "utf8").digest("hex");
  const suffix = normalized.slice(-4);
  const maskedValue = suffix ? `••••${suffix}` : "••••";
  return { normalizedFingerprint, maskedValue };
}

export type RegisterPayerIdentitySignalInput = {
  administratorId: string;
  organizationId: string;
  payerId?: string | null;
  type: PayerIdentitySignalType;
  value: string;
  source: PayerProvenanceSource;
  reason: string;
};

export async function registerPayerIdentitySignal(input: RegisterPayerIdentitySignalInput) {
  const reason = requiredReason(input.reason);
  const protectedSignal = protectSignal(input.type, input.value);
  return prisma.$transaction(async (tx) => {
    await requireActiveOrganizationAccess(tx, input.administratorId, input.organizationId);
    if (input.payerId) {
      const payer = await tx.payer.findUnique({ where: { id: input.payerId }, select: { organizationId: true, status: true } });
      if (!payer || payer.organizationId !== input.organizationId || payer.status !== "ACTIVE") throw new PayerIdentityAccessError();
    }

    const existing = await tx.payerIdentitySignal.findUnique({
      where: {
        organizationId_type_normalizedFingerprint: {
          organizationId: input.organizationId,
          type: input.type,
          normalizedFingerprint: protectedSignal.normalizedFingerprint,
        },
      },
    });
    if (existing) {
      if (existing.payerId !== (input.payerId ?? null)) throw new PayerIdentityConflictError();
      return existing;
    }

    return tx.payerIdentitySignal.create({
      data: {
        organizationId: input.organizationId,
        payerId: input.payerId ?? null,
        type: input.type,
        ...protectedSignal,
        source: input.source,
        reason,
        createdBy: input.administratorId,
      },
    });
  });
}
