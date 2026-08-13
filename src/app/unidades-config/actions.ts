"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { UnitOccupantType } from "@/generated/prisma/enums";
import type { ErrorFilaImportacion, ResultadoImportacion } from "@/lib/import/types";
import { normalizarRelacionUnidad } from "@/lib/import/validation";
import { requireCurrentAdministrator } from "@/lib/auth/session";
import { requireOrganizationAccess } from "@/lib/auth/organization-access";
import { requireUnitAccess, requireUnitOwnerAccess } from "@/lib/auth/resource-access";

const PATH = "/unidades-config";

// ----------------------------------------------------------------------------
// Fase 2 del Motor de Conciliación por Unidad — gestión e importación real de
// Unidades y Titulares (ver RECONCILIATION_ENGINE_IMPLEMENTATION.md sección
// C/H). Sin motor de matching, sin score, sin IA, sin auto-conciliación: esto
// solo persiste el padrón real para que fases futuras lo usen como fuente de
// verdad.
//
// Fase 2.1 (hardening, sobre la auditoría de Fase 2) agregó tres invariantes
// de integridad que este archivo mantiene en todos los caminos de escritura
// (CRUD manual e importación masiva):
//   1. Eliminar una Unidad soft-deletea también a sus Titulares activos.
//   2. Una Unidad soft-deleted nunca se revive en silencio — recrear o
//      reimportar el mismo código le libera el código a la eliminada (queda
//      con su historial intacto, solo renombrada) y crea una Unidad nueva.
//   3. A lo sumo un UnitOwner activo por Unidad puede tener isPrimary=true.
//
// Fase 2.2 agregó un cuarto invariante, específico de UnitOwner (decisión de
// negocio explícita, distinta de cómo se trata Unit): un UnitOwner
// soft-deleted con el mismo (unitId, taxId) se reactiva en vez de duplicarse
// — ver `upsertTitularPorCuit`.
// ----------------------------------------------------------------------------

export interface OrganizacionOpcionDTO {
  id: string;
  name: string;
  taxId: string;
}

/** Lista de organizaciones reales para el selector — no hay import por fila de organización, se elige una vez por archivo/pantalla. */
export async function listarOrganizacionesParaUnidades(): Promise<OrganizacionOpcionDTO[]> {
  const administrator = await requireCurrentAdministrator();
  return prisma.organization.findMany({
    where: { deletedAt: null, administrators: { some: { administratorId: administrator.id } } },
    select: { id: true, name: true, taxId: true },
    orderBy: { name: "asc" },
  });
}

export interface UnitOwnerDTO {
  id: string;
  fullName: string;
  taxId: string | null;
  relationship: UnitOccupantType;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface UnitDTO {
  id: string;
  code: string;
  coefficient: number | null;
  owners: UnitOwnerDTO[];
}

export interface ListaUnidadesResultado {
  ok: boolean;
  unidades: UnitDTO[];
  error?: string;
}

export async function listarUnidades(organizationId: string): Promise<ListaUnidadesResultado> {
  try {
    await requireOrganizationAccess(organizationId);
    const unidades = await prisma.unit.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        owners: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }],
        },
      },
      orderBy: { code: "asc" },
    });

    return {
      ok: true,
      unidades: unidades.map((u) => ({
        id: u.id,
        code: u.code,
        coefficient: u.coefficient ? u.coefficient.toNumber() : null,
        owners: u.owners.map((o) => ({
          id: o.id,
          fullName: o.fullName,
          taxId: o.taxId,
          relationship: o.relationship,
          email: o.email,
          phone: o.phone,
          isPrimary: o.isPrimary,
        })),
      })),
    };
  } catch (e) {
    return {
      ok: false,
      unidades: [],
      error: e instanceof Error ? e.message : "No se pudieron listar las unidades.",
    };
  }
}

/**
 * Si `code` está ocupado por una Unidad ya eliminada (soft-delete) de esta
 * organización, le renombra el código para liberarlo — nunca revive la
 * unidad eliminada ni toca ningún otro dato suyo. Su historial (titulares
 * soft-deleted, y a futuro Obligations/ReconciliationMatch) queda intacto
 * bajo el código renombrado, consultable si hiciera falta. Ver riesgos #3/#4
 * de la auditoría de Fase 2 — la decisión fue "nunca reactivar en silencio",
 * consistente con que `ReconciliationMatch` está diseñado append-only en el
 * documento de implementación aprobado.
 *
 * No-op si el código está libre o si lo tiene una Unidad activa (en ese
 * caso, el create/update que sigue debe fallar por constraint único, como
 * corresponde).
 */
async function liberarCodigoDeUnidadEliminada(
  tx: Prisma.TransactionClient,
  organizationId: string,
  code: string
): Promise<void> {
  const bloqueando = await tx.unit.findUnique({
    where: { organizationId_code: { organizationId, code } },
  });
  if (bloqueando && bloqueando.deletedAt) {
    await tx.unit.update({
      where: { id: bloqueando.id },
      data: { code: `${code}__eliminada-${bloqueando.id}` },
    });
  }
}

export interface CrearUnidadInput {
  organizationId: string;
  code: string;
  coefficient?: number | null;
}

export async function crearUnidad(
  input: CrearUnidadInput
): Promise<{ ok: boolean; unitId?: string; error?: string }> {
  const code = input.code.trim();
  if (!code) return { ok: false, error: "El código de unidad es obligatorio." };

  try {
    await requireOrganizationAccess(input.organizationId);
    const unidad = await prisma.$transaction(async (tx) => {
      await liberarCodigoDeUnidadEliminada(tx, input.organizationId, code);
      return tx.unit.create({
        data: { organizationId: input.organizationId, code, coefficient: input.coefficient ?? null },
      });
    });
    revalidatePath(PATH);
    return { ok: true, unitId: unidad.id };
  } catch (e) {
    if (esErrorDeConstraintUnico(e)) {
      return { ok: false, error: `Ya existe una unidad activa "${code}" en este consorcio.` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la unidad." };
  }
}

export interface ActualizarUnidadInput {
  code?: string;
  coefficient?: number | null;
}

export async function actualizarUnidad(
  unitId: string,
  input: ActualizarUnidadInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireUnitAccess(unitId);
    await prisma.$transaction(async (tx) => {
      if (input.code !== undefined) {
        const actual = await tx.unit.findUniqueOrThrow({
          where: { id: unitId },
          select: { organizationId: true, code: true },
        });
        const nuevoCodigo = input.code.trim();
        if (nuevoCodigo !== actual.code) {
          await liberarCodigoDeUnidadEliminada(tx, actual.organizationId, nuevoCodigo);
        }
      }

      await tx.unit.update({
        where: { id: unitId },
        data: {
          ...(input.code !== undefined ? { code: input.code.trim() } : {}),
          ...(input.coefficient !== undefined ? { coefficient: input.coefficient } : {}),
        },
      });
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    if (esErrorDeConstraintUnico(e)) {
      return { ok: false, error: "Ya existe una unidad activa con ese código en este consorcio." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo actualizar la unidad." };
  }
}

/**
 * Soft delete de la Unidad, cascadeado a sus Titulares activos en la misma
 * transacción — mismo criterio que el resto del schema (deletedAt, nunca
 * borrado físico). Una Unidad eliminada no debe dejar Titulares "activos"
 * que un futuro motor de conciliación pueda seguir usando (riesgo #2 de la
 * auditoría de Fase 2).
 */
export async function eliminarUnidad(unitId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireUnitAccess(unitId);
    await prisma.$transaction(async (tx) => {
      await tx.unit.update({ where: { id: unitId }, data: { deletedAt: new Date() } });
      await tx.unitOwner.updateMany({
        where: { unitId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo eliminar la unidad." };
  }
}

/** true si `unitId` no tiene ningún Titular activo todavía. */
async function esElPrimerTitularActivo(tx: Prisma.TransactionClient, unitId: string): Promise<boolean> {
  const existente = await tx.unitOwner.findFirst({ where: { unitId, deletedAt: null }, select: { id: true } });
  return !existente;
}

/**
 * Garantiza el invariante "a lo sumo un Titular primario activo por
 * Unidad" (riesgo #5 de la auditoría de Fase 2): desmarca isPrimary de
 * cualquier otro Titular activo de la unidad antes de que se asiente uno
 * nuevo como primario. `ownerIdAExcluir` es el propio titular que se está
 * actualizando (para no desmarcarse a sí mismo).
 */
async function despriorizarOtrosTitulares(
  tx: Prisma.TransactionClient,
  unitId: string,
  ownerIdAExcluir: string | null
): Promise<void> {
  await tx.unitOwner.updateMany({
    where: {
      unitId,
      deletedAt: null,
      isPrimary: true,
      ...(ownerIdAExcluir ? { id: { not: ownerIdAExcluir } } : {}),
    },
    data: { isPrimary: false },
  });
}

interface DatosTitular {
  fullName: string;
  relationship: UnitOccupantType;
  email: string | null;
  phone: string | null;
}

type AccionUpsertTitular = "creado" | "actualizado" | "reactivado";

/**
 * Resuelve un Titular por (unitId, taxId) — Fase 2.2, decisión de negocio
 * explícita: a diferencia de `Unit`, un `UnitOwner` con el mismo CUIT en la
 * misma Unidad SÍ debe reactivarse en lugar de generar un duplicado (el CUIT
 * es una identidad fuerte y UnitOwner modela la relación titular↔unidad, no
 * una entidad histórica como Unit). Casos:
 *   A. Activo con ese CUIT   -> se actualiza.
 *   B. Soft-deleted con ese CUIT -> se reactiva (deletedAt = null) y se
 *      actualiza; si conservaba isPrimary=true de antes de eliminarse, se
 *      desprioriza a cualquier otro titular activo de la unidad para no
 *      terminar con dos primarios (mismo invariante ya existente).
 *   C. No existe con ese CUIT -> se crea, con el mismo default seguro de
 *      isPrimary que ya usa el resto del archivo (primario solo si es el
 *      primer titular activo de la unidad).
 * Caso D (sin CUIT) NO pasa por acá — se resuelve en el caller, sin
 * deduplicar por nombre (ver comentario en `importarUnidades`).
 */
async function upsertTitularPorCuit(
  tx: Prisma.TransactionClient,
  unitId: string,
  taxId: string,
  datos: DatosTitular
): Promise<{ ownerId: string; accion: AccionUpsertTitular }> {
  const existente = await tx.unitOwner.findUnique({ where: { unitId_taxId: { unitId, taxId } } });

  if (existente && existente.deletedAt) {
    if (existente.isPrimary) {
      await despriorizarOtrosTitulares(tx, unitId, existente.id);
    }
    await tx.unitOwner.update({
      where: { id: existente.id },
      data: { ...datos, deletedAt: null },
    });
    return { ownerId: existente.id, accion: "reactivado" };
  }

  if (existente) {
    await tx.unitOwner.update({ where: { id: existente.id }, data: datos });
    return { ownerId: existente.id, accion: "actualizado" };
  }

  const yaTienePrimario = !(await esElPrimerTitularActivo(tx, unitId));
  const nuevo = await tx.unitOwner.create({
    data: { unitId, taxId, ...datos, isPrimary: !yaTienePrimario },
  });
  return { ownerId: nuevo.id, accion: "creado" };
}

export interface TitularInput {
  fullName: string;
  taxId?: string | null;
  relationship?: UnitOccupantType;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
}

export async function agregarTitular(
  unitId: string,
  input: TitularInput
): Promise<{ ok: boolean; ownerId?: string; error?: string }> {
  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "El nombre del titular es obligatorio." };
  const taxId = input.taxId?.trim() || null;
  const relationship = input.relationship ?? "OWNER";
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;

  try {
    await requireUnitAccess(unitId);
    const ownerId = await prisma.$transaction(async (tx) => {
      if (taxId) {
        // Con CUIT: resolver por (unitId, taxId) — actualiza si ya existe
        // activo, reactiva si existe soft-deleted, crea si no existe (casos
        // A/B/C de la Fase 2.2). Nunca duplica.
        const resultado = await upsertTitularPorCuit(tx, unitId, taxId, { fullName, relationship, email, phone });
        if (input.isPrimary !== undefined) {
          if (input.isPrimary) await despriorizarOtrosTitulares(tx, unitId, resultado.ownerId);
          await tx.unitOwner.update({ where: { id: resultado.ownerId }, data: { isPrimary: input.isPrimary } });
        }
        return resultado.ownerId;
      }

      // Sin CUIT (caso D): comportamiento actual, sin deduplicar por
      // nombre — ver el mismo razonamiento documentado en `importarUnidades`.
      // Sin pedido explícito, el primer titular activo de la unidad queda
      // como primario por defecto (comportamiento histórico preservado);
      // cualquier titular siguiente entra como no-primario por defecto, para
      // no desplazar en silencio al primario existente.
      const isPrimary = input.isPrimary ?? (await esElPrimerTitularActivo(tx, unitId));
      if (isPrimary) await despriorizarOtrosTitulares(tx, unitId, null);

      const titular = await tx.unitOwner.create({
        data: { unitId, fullName, taxId: null, relationship, email, phone, isPrimary },
      });
      return titular.id;
    });
    revalidatePath(PATH);
    return { ok: true, ownerId };
  } catch (e) {
    if (esErrorDeConstraintUnico(e)) {
      return { ok: false, error: "Ese titular (mismo CUIT) ya está cargado en esta unidad." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo agregar el titular." };
  }
}

export async function actualizarTitular(
  ownerId: string,
  input: Partial<TitularInput>
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireUnitOwnerAccess(ownerId);
    await prisma.$transaction(async (tx) => {
      if (input.isPrimary === true) {
        const actual = await tx.unitOwner.findUniqueOrThrow({
          where: { id: ownerId },
          select: { unitId: true },
        });
        await despriorizarOtrosTitulares(tx, actual.unitId, ownerId);
      }

      await tx.unitOwner.update({
        where: { id: ownerId },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
          ...(input.taxId !== undefined ? { taxId: input.taxId?.trim() || null } : {}),
          ...(input.relationship !== undefined ? { relationship: input.relationship } : {}),
          ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
          ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
        },
      });
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    if (esErrorDeConstraintUnico(e)) {
      return { ok: false, error: "Ese titular (mismo CUIT) ya está cargado en esta unidad." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo actualizar el titular." };
  }
}

export async function eliminarTitular(ownerId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireUnitOwnerAccess(ownerId);
    await prisma.unitOwner.update({ where: { id: ownerId }, data: { deletedAt: new Date() } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo eliminar el titular." };
  }
}

// ----------------------------------------------------------------------------
// Importación masiva — Paso 4 del wizard genérico (ver
// src/components/import/ImportWizard.tsx). Mismo patrón que
// `importarOrganizaciones`: por fila, try/catch, transacción por fila, un
// error no frena el resto del archivo.
// ----------------------------------------------------------------------------

export interface FilaUnidadParaImportar {
  unitCode: string;
  ownerFullName: string;
  ownerTaxId: string;
  ownerRelationship: string;
  ownerEmail: string;
  ownerPhone: string;
  coefficient: string;
}

function parsearCoeficiente(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".").replace("%", "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isNaN(n) ? null : n;
}

export async function importarUnidades(
  organizationId: string,
  filas: FilaUnidadParaImportar[]
): Promise<ResultadoImportacion> {
  await requireOrganizationAccess(organizationId);
  let creadas = 0;
  let actualizadas = 0;
  const errores: ErrorFilaImportacion[] = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 1;
    const code = fila.unitCode.trim();
    const fullName = fila.ownerFullName.trim();
    const etiqueta = code ? `UF ${code}` : `Fila ${numeroFila}`;

    try {
      if (!code) throw new Error("Falta el código de unidad.");

      const taxId = fila.ownerTaxId.trim() || null;
      const relationship: UnitOccupantType = normalizarRelacionUnidad(fila.ownerRelationship) ?? "OWNER";
      const coefficient = parsearCoeficiente(fila.coefficient);
      const email = fila.ownerEmail.trim() || null;
      const phone = fila.ownerPhone.trim() || null;

      const unidadEsNueva = await prisma.$transaction(async (tx) => {
        const existente = await tx.unit.findUnique({
          where: { organizationId_code: { organizationId, code } },
        });

        let unidad;
        let esNueva: boolean;
        if (existente && existente.deletedAt) {
          // La Unidad de este código está eliminada — no la revivimos en
          // silencio (riesgo #4): le liberamos el código y creamos una
          // Unidad nueva. La anterior queda intacta, solo renombrada.
          await liberarCodigoDeUnidadEliminada(tx, organizationId, code);
          unidad = await tx.unit.create({ data: { organizationId, code, coefficient } });
          esNueva = true;
        } else if (existente) {
          unidad = await tx.unit.update({ where: { id: existente.id }, data: { coefficient } });
          esNueva = false;
        } else {
          unidad = await tx.unit.create({ data: { organizationId, code, coefficient } });
          esNueva = true;
        }

        if (!fullName) return esNueva; // solo la unidad, sin titular en esta fila

        if (taxId) {
          // Casos A/B/C de la Fase 2.2: actualiza si ya existe activo,
          // reactiva si existe soft-deleted (nunca lo duplica), crea si no
          // existe. Reemplaza el find+branch manual que antes podía
          // "actualizar" una fila eliminada sin limpiarle deletedAt.
          await upsertTitularPorCuit(tx, unidad.id, taxId, { fullName, relationship, email, phone });
        } else {
          // Sin CUIT no hay clave natural confiable para deduplicar — se
          // crea siempre una fila nueva. Limitación conocida y documentada
          // (ver el warning de `validarFilaUnidad` en el wizard, mostrado
          // antes de confirmar la importación): reimportar el mismo archivo
          // sin CUIT puede duplicar titulares. No se implementa un match
          // heurístico por nombre a propósito — sería más peligroso que el
          // duplicado que evitaría (nombres repetidos, homónimos).
          const yaTienePrimario = !(await esElPrimerTitularActivo(tx, unidad.id));
          await tx.unitOwner.create({
            data: {
              unitId: unidad.id,
              fullName,
              relationship,
              email,
              phone,
              isPrimary: !yaTienePrimario,
            },
          });
        }

        return esNueva;
      });

      if (unidadEsNueva) creadas++;
      else actualizadas++;
    } catch (e) {
      errores.push({ fila: numeroFila, etiqueta, mensaje: mensajeDeError(e) });
    }
  }

  revalidatePath(PATH);
  return { ok: errores.length === 0, creadas, actualizadas, errores };
}

function esErrorDeConstraintUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === "P2002";
}

function mensajeDeError(e: unknown): string {
  if (e instanceof Error) {
    if ("code" in e && e.code === "P2002") return "Ya existe un registro con ese valor único.";
    return e.message;
  }
  return "Error desconocido al procesar la fila.";
}
