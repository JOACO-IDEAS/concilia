"use server";

import { prisma } from "@/lib/prisma";
import type { ErrorFilaImportacion, ResultadoImportacion } from "@/lib/import/types";
import { requireCurrentAdministrator } from "@/lib/auth/session";
import { requireOrganizationAccess } from "@/lib/auth/organization-access";

// Payload que llega ya validado y editado desde el Paso 3 del wizard — el
// archivo original nunca se sube al servidor, solo estos valores planos.
export interface FilaParaImportar {
  name: string;
  taxId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  billingEmail: string;
  cbuAlias: string;
}

// Re-exportado para no romper imports existentes (`StepConfirm.tsx` /
// `ImportWizard.tsx` los importaban desde acá antes de generalizar el
// wizard) — la fuente de verdad ahora vive en src/lib/import/types.ts,
// compartida con cualquier otro "sabor" de importación (ej. unidades).
export type { ResultadoImportacion, ErrorFilaImportacion } from "@/lib/import/types";

function separarNombreApellido(nombreCompleto: string): { firstName: string; lastName: string } {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { firstName: "", lastName: "" };
  if (partes.length === 1) return { firstName: partes[0], lastName: "" };
  return { firstName: partes[0], lastName: partes.slice(1).join(" ") };
}

function pareceCbu(valor: string): boolean {
  return /^\d{22}$/.test(valor.replace(/\s/g, ""));
}

/**
 * Server Action del Módulo de Importación Asistida.
 *
 * Por cada fila: crea o actualiza la Organization (upsert por `taxId`, para
 * no duplicar clientes que ya existen), su Contact primario, los
 * ContactChannel de email/teléfono/facturación, y su BillingProfile por
 * defecto — todo dentro de una única transacción por fila, para que una fila
 * mal formada no deje datos a medio insertar. Un error en una fila NO frena
 * el resto del archivo: se acumula en `errores` y se sigue con la siguiente.
 */
export async function importarOrganizaciones(
  filas: FilaParaImportar[]
): Promise<ResultadoImportacion> {
  const administrator = await requireCurrentAdministrator();
  let creadas = 0;
  let actualizadas = 0;
  const errores: ErrorFilaImportacion[] = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 1;

    try {
      const yaExistia = await prisma.organization.findUnique({
        where: { taxId: fila.taxId },
        select: { id: true },
      });
      if (yaExistia) await requireOrganizationAccess(yaExistia.id);

      await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.upsert({
          where: { taxId: fila.taxId },
          update: { name: fila.name },
          create: {
            name: fila.name,
            legalName: fila.name,
            taxId: fila.taxId,
            address: "",
            status: "ACTIVE",
            administrators: { create: { administratorId: administrator.id } },
          },
        });

        // Contact primario: si la organización ya tenía uno, se actualiza en
        // vez de crear un duplicado en cada reimportación.
        if (fila.contactName.trim()) {
          const { firstName, lastName } = separarNombreApellido(fila.contactName);
          const vinculoExistente = await tx.contactOrganization.findFirst({
            where: { organizationId: organization.id, isPrimaryContact: true },
            select: { contactId: true },
          });

          const contactId = vinculoExistente
            ? (
                await tx.contact.update({
                  where: { id: vinculoExistente.contactId },
                  data: { firstName, lastName },
                })
              ).id
            : (
                await tx.contact.create({
                  data: {
                    firstName,
                    lastName,
                    organizations: {
                      create: { organizationId: organization.id, isPrimaryContact: true },
                    },
                  },
                })
              ).id;

          if (fila.contactEmail.trim()) {
            await tx.contactChannel.upsert({
              where: {
                organizationId_type_value: {
                  organizationId: organization.id,
                  type: "EMAIL",
                  value: fila.contactEmail.trim(),
                },
              },
              update: { contactId },
              create: {
                organizationId: organization.id,
                contactId,
                type: "EMAIL",
                value: fila.contactEmail.trim(),
                purpose: "GENERAL",
              },
            });
          }

          if (fila.contactPhone.trim()) {
            await tx.contactChannel.upsert({
              where: {
                organizationId_type_value: {
                  organizationId: organization.id,
                  type: "PHONE",
                  value: fila.contactPhone.trim(),
                },
              },
              update: { contactId },
              create: {
                organizationId: organization.id,
                contactId,
                type: "PHONE",
                value: fila.contactPhone.trim(),
                purpose: "NOTIFICATIONS",
              },
            });
          }
        }

        // Canal de facturación: genérico de la organización (sin contactId),
        // como una casilla compartida de cobranza.
        if (fila.billingEmail.trim()) {
          await tx.contactChannel.upsert({
            where: {
              organizationId_type_value: {
                organizationId: organization.id,
                type: "EMAIL",
                value: fila.billingEmail.trim(),
              },
            },
            update: { purpose: "BILLING" },
            create: {
              organizationId: organization.id,
              contactId: null,
              type: "EMAIL",
              value: fila.billingEmail.trim(),
              purpose: "BILLING",
            },
          });
        }

        // Perfil de facturación por defecto de la organización.
        if (fila.cbuAlias.trim()) {
          const perfilExistente = await tx.billingProfile.findFirst({
            where: { organizationId: organization.id, isDefault: true },
          });

          const bankAccountType = pareceCbu(fila.cbuAlias) ? "CBU" : "ALIAS";

          if (perfilExistente) {
            await tx.billingProfile.update({
              where: { id: perfilExistente.id },
              data: { bankAccountType, bankAccountNumber: fila.cbuAlias.trim() },
            });
          } else {
            await tx.billingProfile.create({
              data: {
                organizationId: organization.id,
                taxCondition: "A confirmar",
                bankAccountType,
                bankAccountNumber: fila.cbuAlias.trim(),
                paymentTerms: "30 días",
                isDefault: true,
              },
            });
          }
        }
      });

      if (yaExistia) actualizadas++;
      else creadas++;
    } catch (e) {
      errores.push({
        fila: numeroFila,
        etiqueta: fila.name || fila.taxId || `Fila ${numeroFila}`,
        mensaje: mensajeDeError(e),
      });
    }
  }

  return { ok: errores.length === 0, creadas, actualizadas, errores };
}

function mensajeDeError(e: unknown): string {
  if (e instanceof Error) {
    // Violación de constraint único de Prisma (ej. carrera entre dos filas
    // con el mismo taxId dentro del mismo lote).
    if ("code" in e && e.code === "P2002") {
      return "Ya existe un registro con ese valor único (posible tax_id repetido en el archivo).";
    }
    return e.message;
  }
  return "Error desconocido al procesar la fila.";
}
