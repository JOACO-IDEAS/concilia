"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ObligationStatus } from "@/generated/prisma/enums";
import type { ErrorFilaImportacion, ResultadoImportacion } from "@/lib/import/types";
import { parsearPeriodo } from "@/lib/import/period";
import { requireOrganizationAccess } from "@/lib/auth/organization-access";
import { requireObligationAccess, requireUnitAccess } from "@/lib/auth/resource-access";

const PATH = "/unidades-config";

// ----------------------------------------------------------------------------
// Fase 3.2 — CRUD e importación real de Obligation (ver OBLIGATION_MODEL.md,
// decisiones ya cerradas en §8-9: una sola obligación consolidada por
// período, excedente sin período futuro cae a excepción manual, sin
// historial de ediciones todavía). Obligation pertenece exclusivamente a
// Unit — nunca a UnitOwner (ver OBLIGATION_MODEL.md §2): una expensa es de
// la unidad, no de quien hoy la habita. Esta capa NO implementa nada de
// conciliación: no calcula intereses (no existe esa política todavía), no
// deduce titulares, no crea ReconciliationMatch, no toca paidAmount/status
// más allá de lo que el propio CRUD/import edita explícitamente.
// ----------------------------------------------------------------------------

export interface ObligationDTO {
  id: string;
  unitId: string;
  unitCode: string;
  period: string; // ISO yyyy-mm-dd, siempre primer día del mes
  amount: number;
  paidAmount: number;
  status: ObligationStatus;
  concept: string | null;
  dueDate: string | null;
  externalRef: string | null;
}

export interface ListaObligacionesResultado {
  ok: boolean;
  obligaciones: ObligationDTO[];
  error?: string;
}

export async function listarObligaciones(unitId: string): Promise<ListaObligacionesResultado> {
  try {
    await requireUnitAccess(unitId);
    const obligaciones = await prisma.obligation.findMany({
      where: { unitId, deletedAt: null },
      include: { unit: { select: { code: true } } },
      orderBy: { period: "desc" },
    });

    return {
      ok: true,
      obligaciones: obligaciones.map((o) => ({
        id: o.id,
        unitId: o.unitId,
        unitCode: o.unit.code,
        period: o.period.toISOString(),
        amount: o.amount.toNumber(),
        paidAmount: o.paidAmount.toNumber(),
        status: o.status,
        concept: o.concept,
        dueDate: o.dueDate ? o.dueDate.toISOString() : null,
        externalRef: o.externalRef,
      })),
    };
  } catch (e) {
    return {
      ok: false,
      obligaciones: [],
      error: e instanceof Error ? e.message : "No se pudieron listar las obligaciones.",
    };
  }
}

export interface CrearObligacionInput {
  unitId: string;
  period: string; // texto libre, se normaliza con parsearPeriodo
  amount: number;
  concept?: string | null;
  dueDate?: string | null; // ISO yyyy-mm-dd
}

export async function crearObligacion(
  input: CrearObligacionInput
): Promise<{ ok: boolean; obligationId?: string; error?: string }> {
  const period = parsearPeriodo(input.period);
  if (!period) return { ok: false, error: 'El período debe tener formato "AAAA-MM" (ej. 2026-08).' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "El importe debe ser un número mayor a cero." };
  }

  try {
    await requireUnitAccess(input.unitId);
    const obligacion = await prisma.obligation.create({
      data: {
        unitId: input.unitId,
        period,
        amount: input.amount,
        concept: input.concept?.trim() || null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
    });
    revalidatePath(PATH);
    return { ok: true, obligationId: obligacion.id };
  } catch (e) {
    if (esErrorDeConstraintUnico(e)) {
      return { ok: false, error: "Ya existe una obligación para ese período en esta unidad." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la obligación." };
  }
}

export interface ActualizarObligacionInput {
  period?: string;
  amount?: number;
  concept?: string | null;
  dueDate?: string | null;
}

export async function actualizarObligacion(
  obligationId: string,
  input: ActualizarObligacionInput
): Promise<{ ok: boolean; error?: string }> {
  let period: Date | undefined;
  if (input.period !== undefined) {
    const parseado = parsearPeriodo(input.period);
    if (!parseado) return { ok: false, error: 'El período debe tener formato "AAAA-MM" (ej. 2026-08).' };
    period = parseado;
  }
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) {
    return { ok: false, error: "El importe debe ser un número mayor a cero." };
  }

  try {
    await requireObligationAccess(obligationId);
    await prisma.obligation.update({
      where: { id: obligationId },
      data: {
        ...(period !== undefined ? { period } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.concept !== undefined ? { concept: input.concept?.trim() || null } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
      },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    if (esErrorDeConstraintUnico(e)) {
      return { ok: false, error: "Ya existe una obligación para ese período en esta unidad." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo actualizar la obligación." };
  }
}

/** Soft delete — mismo criterio que el resto del schema (deletedAt, no borrado físico, preserva historial). */
export async function eliminarObligacion(obligationId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireObligationAccess(obligationId);
    await prisma.obligation.update({ where: { id: obligationId }, data: { deletedAt: new Date() } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo eliminar la obligación." };
  }
}

// ----------------------------------------------------------------------------
// Importación masiva — mismo patrón que importarUnidades. El código de
// unidad se resuelve por coincidencia EXACTA contra Unit.code de la
// organización (nunca la canonicalización/fuzzy diseñada para el motor de
// matching de Fase 3.2+ — acá el objetivo es cero ambigüedad al cargar
// deuda real, no interpretar texto bancario desprolijo). Si el código no
// matchea ninguna Unidad activa, la fila se rechaza — nunca se crea una
// Unidad nueva ni se adivina cuál era.
// ----------------------------------------------------------------------------

export interface FilaObligacionParaImportar {
  unitCode: string;
  period: string;
  amount: string;
  concept: string;
  dueDate: string;
}

export async function importarObligaciones(
  organizationId: string,
  filas: FilaObligacionParaImportar[]
): Promise<ResultadoImportacion> {
  await requireOrganizationAccess(organizationId);
  let creadas = 0;
  let actualizadas = 0;
  const errores: ErrorFilaImportacion[] = [];

  const unidades = await prisma.unit.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, code: true },
  });
  const unidadPorCodigo = new Map(unidades.map((u) => [u.code, u.id]));

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 1;
    const unitCode = fila.unitCode.trim();
    const etiqueta = unitCode ? `UF ${unitCode}` : `Fila ${numeroFila}`;

    try {
      if (!unitCode) throw new Error("Falta el código de unidad.");

      const unitId = unidadPorCodigo.get(unitCode);
      if (!unitId) {
        throw new Error(`No existe ninguna unidad activa con código "${unitCode}" en este consorcio.`);
      }

      const period = parsearPeriodo(fila.period);
      if (!period) throw new Error('El período debe tener formato "AAAA-MM" (ej. 2026-08).');

      const amount = Number(fila.amount.trim().replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("El importe debe ser un número mayor a cero.");

      const concept = fila.concept.trim() || null;
      const dueDateTexto = fila.dueDate.trim();
      const dueDate = dueDateTexto ? new Date(dueDateTexto) : null;
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        throw new Error("La fecha de vencimiento no tiene un formato reconocible.");
      }

      const yaExistia = await prisma.obligation.findUnique({
        where: { unitId_period: { unitId, period } },
        select: { id: true },
      });

      await prisma.obligation.upsert({
        where: { unitId_period: { unitId, period } },
        update: { amount, concept, dueDate },
        create: { unitId, period, amount, concept, dueDate },
      });

      if (yaExistia) actualizadas++;
      else creadas++;
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
    if ("code" in e && e.code === "P2002") return "Ya existe una obligación para ese período en esta unidad.";
    return e.message;
  }
  return "Error desconocido al procesar la fila.";
}
