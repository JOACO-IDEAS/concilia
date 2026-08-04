import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// No se re-notifica a la misma organización antes de este tiempo, aunque se
// dispare el Reclamador Automático varias veces o se apruebe un recordatorio
// individual dos veces por error.
export const REMINDER_COOLDOWN_DAYS = 3;

const CICLO_DEFAULT_DIAS = 30;

export interface OrganizacionEnMora {
  organizationId: string;
  organizationName: string;
  taxId: string;
  diasSinPagar: number;
  cicloEsperadoDias: number;
  diasAtraso: number; // diasSinPagar - cicloEsperadoDias, siempre > 0
  montoEstimado: number | null; // null = nunca tuvo un pago MATCHED del cual estimar
  currency: string;
  fechaUltimoPago: string | null; // ISO
  bankAccountType: string | null;
  bankAccountNumber: string | null;
  ultimoRecordatorioEnviado: string | null; // ISO
  puedeNotificar: boolean;
}

function parsearCicloDias(paymentTerms: string | undefined): number {
  if (!paymentTerms) return CICLO_DEFAULT_DIAS;
  const match = paymentTerms.match(/(\d+)/);
  if (match) return Number(match[1]);
  if (/contado/i.test(paymentTerms)) return 15; // margen mínimo razonable — 0 generaría falsos positivos masivos
  return CICLO_DEFAULT_DIAS;
}

function diasEntre(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24));
}

const selectOrganizacionParaMora = {
  id: true,
  name: true,
  taxId: true,
  createdAt: true,
  billingProfiles: { where: { isDefault: true, deletedAt: null }, take: 1 },
  paymentTransactions: {
    where: { status: "MATCHED" as const },
    orderBy: { matchedAt: "desc" as const },
    take: 1,
  },
  paymentReminders: { orderBy: { sentAt: "desc" as const }, take: 1 },
} satisfies Prisma.OrganizationSelect;

type OrganizacionParaMora = Prisma.OrganizationGetPayload<{ select: typeof selectOrganizacionParaMora }>;

/**
 * Heurística de "en mora" — documentada porque no es un cálculo exacto: el
 * schema todavía no tiene un modelo de expensas/facturación emitida (ver
 * prisma/schema.prisma), así que no hay un "saldo real" para consultar.
 *
 *  - "Ciclo esperado" = `BillingProfile.paymentTerms` parseado a días
 *    (default 30 si no se puede parsear o no hay perfil).
 *  - "Días sin pagar" = días desde el último `PaymentTransaction` MATCHED de
 *    la organización, o desde su alta (`createdAt`) si nunca pagó.
 *  - En mora si díasSinPagar > cicloEsperado.
 *  - "Monto estimado adeudado" = monto del último pago MATCHED × cantidad de
 *    ciclos vencidos — es una ESTIMACIÓN, no un saldo real. `null` si la
 *    organización nunca tuvo ningún pago MATCHED del cual estimar (en ese
 *    caso se le puede seguir mandando un recordatorio, pero sin monto).
 */
function calcularMora(org: OrganizacionParaMora, ahora: Date): OrganizacionEnMora | null {
  const perfil = org.billingProfiles[0];
  const ultimoPago = org.paymentTransactions[0];
  const ultimoRecordatorio = org.paymentReminders[0];

  const cicloEsperadoDias = parsearCicloDias(perfil?.paymentTerms);
  const fechaReferencia = ultimoPago?.matchedAt ?? org.createdAt;
  const diasSinPagar = diasEntre(fechaReferencia, ahora);

  if (diasSinPagar <= cicloEsperadoDias) return null;

  const diasAtraso = diasSinPagar - cicloEsperadoDias;
  const ciclosVencidos = Math.max(1, Math.ceil(diasSinPagar / cicloEsperadoDias) - 1);
  const montoEstimado = ultimoPago ? ultimoPago.amount.toNumber() * ciclosVencidos : null;
  const puedeNotificar =
    !ultimoRecordatorio || diasEntre(ultimoRecordatorio.sentAt, ahora) >= REMINDER_COOLDOWN_DAYS;

  return {
    organizationId: org.id,
    organizationName: org.name,
    taxId: org.taxId,
    diasSinPagar,
    cicloEsperadoDias,
    diasAtraso,
    montoEstimado,
    currency: perfil?.billingCurrency ?? ultimoPago?.currency ?? "ARS",
    fechaUltimoPago: ultimoPago?.matchedAt ? ultimoPago.matchedAt.toISOString() : null,
    bankAccountType: perfil?.bankAccountType ?? null,
    bankAccountNumber: perfil?.bankAccountNumber ?? null,
    ultimoRecordatorioEnviado: ultimoRecordatorio ? ultimoRecordatorio.sentAt.toISOString() : null,
    puedeNotificar,
  };
}

/** Todas las organizaciones activas en mora, ordenadas por días de atraso descendente. */
export async function detectarOrganizacionesEnMora(): Promise<OrganizacionEnMora[]> {
  const ahora = new Date();
  const organizaciones = await prisma.organization.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    select: selectOrganizacionParaMora,
  });

  const enMora: OrganizacionEnMora[] = [];
  for (const org of organizaciones) {
    const mora = calcularMora(org, ahora);
    if (mora) enMora.push(mora);
  }
  return enMora.sort((a, b) => b.diasAtraso - a.diasAtraso);
}

/** Igual que `detectarOrganizacionesEnMora`, para una sola organización — usado al enviar un recordatorio. */
export async function calcularMoraDeUnaOrganizacion(
  organizationId: string
): Promise<OrganizacionEnMora | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: selectOrganizacionParaMora,
  });
  if (!org) return null;
  return calcularMora(org, new Date());
}
