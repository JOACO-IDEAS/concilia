// Fase 5.3 — resolución de identidad por CUIT, cross-organización — mismo
// principio que `phone-identity.ts::resolverTelefono`, para el caso en que
// el teléfono no resuelve nada (Caso C/Parte 3) pero el comprobante sí trae
// un CUIT real. Reutiliza el índice ya existente `UnitOwner.taxId` — cero
// query nueva costosa, cero schema.
//
// NO reemplaza a resolverTelefono — es un segundo camino de bootstrapping
// de organización, para cuando el primero no alcanza. Mismo criterio:
// nunca "adivina" un ganador, siempre clasifica en un caso explícito.

import type { Prisma } from "@/generated/prisma/client";
import { soloDigitos } from "@/lib/reconciliation/text-utils";

export type CuitCase = "UNKNOWN" | "SINGLE_CANDIDATE" | "AMBIGUOUS_ACROSS_ORGS";

export interface CuitResolution {
  case: CuitCase;
  candidates: { unitId: string; unitOwnerId: string; organizationId: string }[];
  evidence: string;
}

export async function resolverPorCuit(tx: Prisma.TransactionClient, cuit: string): Promise<CuitResolution> {
  const normalizado = soloDigitos(cuit);
  if (!normalizado) {
    return { case: "UNKNOWN", candidates: [], evidence: "CUIT vacío o sin dígitos reconocibles." };
  }

  const activos = await tx.unitOwner.findMany({
    where: { deletedAt: null, taxId: { not: null } },
    select: { id: true, unitId: true, taxId: true, unit: { select: { organizationId: true, deletedAt: true } } },
  });

  const candidatos = activos
    .filter((o) => o.unit && !o.unit.deletedAt && o.taxId && soloDigitos(o.taxId) === normalizado)
    .map((o) => ({ unitId: o.unitId, unitOwnerId: o.id, organizationId: o.unit!.organizationId }));

  if (candidatos.length === 0) {
    return { case: "UNKNOWN", candidates: [], evidence: `CUIT ${normalizado} no está registrado en ningún titular.` };
  }

  const organizaciones = new Set(candidatos.map((c) => c.organizationId));
  // Un mismo CUIT no debería repetirse dentro de la misma organización (es
  // la misma persona) — si aparece, es la misma unidad/titular, no una
  // ambigüedad real. Solo cruzar organizaciones es un caso genuino a
  // reportar, nunca a adivinar.
  if (organizaciones.size > 1) {
    return {
      case: "AMBIGUOUS_ACROSS_ORGS",
      candidates: candidatos,
      evidence: `CUIT ${normalizado} está registrado en ${organizaciones.size} organizaciones distintas — no se puede anclar la organización sin otra señal.`,
    };
  }

  return {
    case: "SINGLE_CANDIDATE",
    candidates: candidatos,
    evidence: `CUIT ${normalizado} coincide con un único titular conocido.`,
  };
}
