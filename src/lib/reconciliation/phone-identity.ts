// Resolución de identidad por teléfono/WhatsApp — algoritmo de 4 casos
// aprobado en FASE_3_1_PREPARACION_DE_DATOS.md §6.4. Cadena de identidad
// SIEMPRE: WhatsApp phone → UnitOwner.phone → Unit → Organization. NUNCA
// pasa por Contact (ese modela al contacto administrativo de la
// Organization, un dominio distinto — ver OBLIGATION_MODEL.md/
// RECONCILIATION_ENGINE_IMPLEMENTATION.md sección A).
//
// Esta es una primitiva reutilizable, independiente de PaymentTransaction:
// un pago bancario no trae ningún teléfono (ver FASE_3_3_IMPLEMENTATION_PLAN.md
// §5) — este módulo existe para cuando exista un canal que sí lo traiga
// (WhatsApp/PaymentNotice, Fase 3.4+), y se testea en aislamiento.

import type { Prisma } from "@/generated/prisma/client";
import type { PhoneResolution } from "./types";

/** Mismo criterio que whatsapp-client.ts::normalizarTelefono — sin exportarse desde ahí, se replica acá. */
export function normalizarTelefono(telefono: string): string {
  return telefono.replace(/[^\d]/g, "");
}

/**
 * Busca todos los UnitOwner activos cuyo teléfono normalizado coincida, SIN
 * scoping por organización (decisión aprobada: número de WhatsApp
 * compartido, no hay organización resuelta de entrada — ver
 * FASE_3_1_PREPARACION_DE_DATOS.md §6.3). Clasifica el resultado en uno de
 * los 4 casos — nunca "adivina" un ganador.
 */
export async function resolverTelefono(
  tx: Prisma.TransactionClient,
  telefono: string
): Promise<PhoneResolution> {
  const normalizado = normalizarTelefono(telefono);
  if (!normalizado) {
    return { case: "UNKNOWN", candidates: [], evidence: "Teléfono vacío o sin dígitos reconocibles." };
  }

  // Comparación en memoria (no vía el índice de `phone` tal cual, porque el
  // dato guardado puede no estar normalizado) — aceptable para modo sombra
  // con el volumen actual; una implementación de producción debería
  // normalizar al cargar el padrón para poder indexar directo.
  const activos = await tx.unitOwner.findMany({
    where: { deletedAt: null, phone: { not: null } },
    select: {
      id: true,
      unitId: true,
      phone: true,
      unit: { select: { organizationId: true, deletedAt: true } },
    },
  });

  const candidatos = activos
    .filter((o) => o.unit && !o.unit.deletedAt && o.phone && normalizarTelefono(o.phone) === normalizado)
    .map((o) => ({ unitId: o.unitId, unitOwnerId: o.id, organizationId: o.unit!.organizationId }));

  if (candidatos.length === 0) {
    return { case: "UNKNOWN", candidates: [], evidence: `Teléfono ${normalizado} no está registrado en ningún titular.` };
  }

  const organizaciones = new Set(candidatos.map((c) => c.organizationId));

  if (organizaciones.size > 1) {
    return {
      case: "AMBIGUOUS_ACROSS_ORGS",
      candidates: candidatos,
      evidence: `Teléfono ${normalizado} está registrado en ${organizaciones.size} organizaciones distintas — no se puede anclar la organización sin otra señal.`,
    };
  }

  if (candidatos.length > 1) {
    return {
      case: "AMBIGUOUS_WITHIN_ORG",
      candidates: candidatos,
      evidence: `Teléfono ${normalizado} está registrado en ${candidatos.length} titulares/unidades distintas dentro de la misma organización.`,
    };
  }

  return {
    case: "SINGLE_CANDIDATE",
    candidates: candidatos,
    evidence: `Teléfono ${normalizado} coincide con un único titular conocido.`,
  };
}
