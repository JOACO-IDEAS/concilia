// Generación de candidatos — RECONCILIATION_MATCHING_ARCHITECTURE.md §7.
// Únicamente lectura: nunca crea Unit, nunca crea UnitOwner, nunca modifica
// nada. Scoped SIEMPRE por `organizationId` ya resuelto (Capa 1,
// reconcile-payment.ts, sin tocar) — nunca escanea toda la base.

import type { Prisma } from "@/generated/prisma/client";

export interface CandidateOwner {
  id: string;
  fullName: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface CandidateObligation {
  id: string;
  period: Date;
  amount: number;
  paidAmount: number;
  dueDate: Date | null;
  externalRef: string | null;
}

export interface CandidateUnit {
  id: string;
  code: string;
  owners: CandidateOwner[];
  openObligations: CandidateObligation[]; // ya filtradas a PENDING/PARTIALLY_PAID
}

export interface CandidateUniverse {
  organizationId: string;
  units: CandidateUnit[];
}

/**
 * Universo acotado de candidatos para una organización ya resuelta —
 * típicamente decenas de unidades, nunca miles. Solo unidades/titulares
 * activos (`deletedAt: null`) y obligaciones abiertas.
 */
export async function generarCandidatos(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<CandidateUniverse> {
  const units = await tx.unit.findMany({
    where: { organizationId, deletedAt: null },
    include: {
      owners: { where: { deletedAt: null } },
      obligations: { where: { deletedAt: null, status: { in: ["PENDING", "PARTIALLY_PAID"] } } },
    },
    orderBy: { code: "asc" },
  });

  return {
    organizationId,
    units: units.map((u) => ({
      id: u.id,
      code: u.code,
      owners: u.owners.map((o) => ({
        id: o.id,
        fullName: o.fullName,
        taxId: o.taxId,
        phone: o.phone,
        email: o.email,
        isPrimary: o.isPrimary,
      })),
      openObligations: u.obligations.map((ob) => ({
        id: ob.id,
        period: ob.period,
        amount: ob.amount.toNumber(),
        paidAmount: ob.paidAmount.toNumber(),
        dueDate: ob.dueDate,
        externalRef: ob.externalRef,
      })),
    })),
  };
}
