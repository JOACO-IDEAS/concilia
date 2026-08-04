import { prisma } from "@/lib/prisma";
import type { Prisma, PaymentTransactionStatus } from "@/generated/prisma/client";

export interface ResultadoReconciliacion {
  status: PaymentTransactionStatus;
  organizationId: string | null;
  motivo: string;
}

/**
 * Motor de reconciliación (Fase 3): intenta encontrar la Organization dueña
 * de un pago entrante.
 *
 *  1. Busca por CUIT/RUT exacto (`Organization.taxId`).
 *  2. Si no hay coincidencia, busca por CBU/Alias exacto entre los
 *     `BillingProfile.bankAccountNumber` de todas las organizaciones.
 *  3. Si tampoco hay coincidencia, devuelve UNMATCHED para que quede
 *     pendiente de vínculo manual (ver src/app/conciliacion/payments-actions.ts).
 *
 * Recibe opcionalmente un cliente de transacción (`tx`) para poder correr
 * dentro de la misma transacción que crea/actualiza el PaymentTransaction —
 * si no se pasa ninguno, usa el cliente global.
 */
export async function reconcilePayment(
  payerIdentifier: string | null,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<ResultadoReconciliacion> {
  if (!payerIdentifier) {
    return {
      status: "UNMATCHED",
      organizationId: null,
      motivo: "El webhook no trajo CUIT ni CBU/Alias del pagador.",
    };
  }

  const porTaxId = await tx.organization.findUnique({
    where: { taxId: payerIdentifier },
    select: { id: true },
  });
  if (porTaxId) {
    return {
      status: "MATCHED",
      organizationId: porTaxId.id,
      motivo: `Coincidencia por CUIT/RUT ("${payerIdentifier}").`,
    };
  }

  const porCbu = await tx.billingProfile.findFirst({
    where: { bankAccountNumber: payerIdentifier },
    select: { organizationId: true },
  });
  if (porCbu) {
    return {
      status: "MATCHED",
      organizationId: porCbu.organizationId,
      motivo: `Coincidencia por CBU/Alias ("${payerIdentifier}").`,
    };
  }

  return {
    status: "UNMATCHED",
    organizationId: null,
    motivo: `Sin coincidencia para "${payerIdentifier}" — no hay ninguna Organization con ese CUIT ni ningún BillingProfile con ese CBU/Alias.`,
  };
}
