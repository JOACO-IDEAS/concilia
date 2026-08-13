"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Prisma, PaymentTransactionStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { MovimientoExtraidoPDF } from "@/lib/statements/parse-pdf-statement";
import {
  parseStatementWithAI,
  convertirATransaccionesPipeline,
  detectarTipoArchivo,
  limiteBytesPara,
} from "@/lib/statements/ai-parser";
import { reconcilePayment } from "@/lib/payments/reconcile-payment";
import { notificarPagoMatched, notificarPagoUnmatched } from "@/lib/notifications/send-payment-notifications";
import { ejecutarEvaluacionSombraCompleta } from "@/lib/payment-evidence/evidence-score-runner";
import { requireCurrentAdministrator } from "@/lib/auth/session";
import { requireOrganizationAccess } from "@/lib/auth/organization-access";
import { appendProductEventSafely } from "@/lib/product-observability/runtime";

const PROVIDER = "pdf_statement";

export interface MovimientoPreviewDTO extends MovimientoExtraidoPDF {
  yaImportado: boolean;
  organizationPropuesta: { id: string; name: string } | null;
  puedeImportarse: boolean;
}

class MovimientoNoAtribuibleError extends Error {
  constructor() {
    super("El movimiento no se pudo atribuir a una organización disponible.");
    this.name = "MovimientoNoAtribuibleError";
  }
}

/** El motor propone; la aplicación verifica que el administrador pueda operar la organización propuesta. */
async function exigirOrganizacionAutorizada(organizationId: string | null): Promise<void> {
  if (!organizationId) throw new MovimientoNoAtribuibleError();
  try {
    await requireOrganizationAccess(organizationId);
  } catch {
    throw new MovimientoNoAtribuibleError();
  }
}

export interface PreviewExtractoResultado {
  ok: boolean;
  fileName?: string;
  bankName?: string | null;
  accountIdentifier?: string | null;
  usedAI?: boolean;
  movimientos?: MovimientoPreviewDTO[];
  error?: string;
}

/**
 * Paso 1 (previsualización) — sube el extracto (PDF, PNG/JPG, CSV o Excel
 * .xlsx/.xls, de cualquier entidad financiera de LATAM), lo manda al parser
 * universal (`parseStatementWithAI` — siempre vía LLM con Structured Output)
 * y corre el motor de reconciliación (`reconcile-payment.ts`, reutilizado tal
 * cual del pipeline de webhooks) en modo lectura para mostrarle al usuario
 * qué organización se propone para cada fila ANTES de confirmar. No escribe
 * nada en la base — `reconcilePayment` es puramente de lectura.
 */
export async function previsualizarExtractoPDF(formData: FormData): Promise<PreviewExtractoResultado> {
  await requireCurrentAdministrator();
  const archivo = formData.get("file");
  if (!(archivo instanceof File)) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }

  const tipo = detectarTipoArchivo(archivo.type, archivo.name);
  if (!tipo) {
    return { ok: false, error: "Formato no soportado — subí un PDF, PNG, JPG, CSV o Excel (.xlsx/.xls)." };
  }
  const limite = limiteBytesPara(tipo);
  if (archivo.size > limite) {
    return {
      ok: false,
      error: `El archivo pesa demasiado (máximo ${Math.round(limite / (1024 * 1024))}MB para este formato).`,
    };
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const extracto = await parseStatementWithAI(buffer, archivo.type, archivo.name);

    if (!extracto.ok || extracto.transactions.length === 0) {
      return {
        ok: false,
        error: extracto.error ?? "No se detectó ningún movimiento reconocible en el archivo.",
      };
    }

    const movimientos = convertirATransaccionesPipeline(extracto);

    const existentes = await prisma.paymentTransaction.findMany({
      where: { externalId: { in: movimientos.map((m) => m.externalId) } },
      select: { externalId: true },
    });
    const yaImportadosSet = new Set(existentes.map((e) => e.externalId));

    const movimientosPreview: MovimientoPreviewDTO[] = [];
    for (const mov of movimientos) {
      const yaImportado = yaImportadosSet.has(mov.externalId);
      let organizationPropuesta: { id: string; name: string } | null = null;
      let puedeImportarse = false;

      if (!mov.esEgreso && !yaImportado) {
        const reconciliacion = await reconcilePayment(mov.payerIdentifier);
        if (reconciliacion.status === "MATCHED" && reconciliacion.organizationId) {
          try {
            await exigirOrganizacionAutorizada(reconciliacion.organizationId);
            organizationPropuesta = await prisma.organization.findUnique({
              where: { id: reconciliacion.organizationId },
              select: { id: true, name: true },
            });
            puedeImportarse = organizationPropuesta !== null;
          } catch {
            // No se revela ni se incorpora una organización fuera del alcance.
          }
        }
      }

      movimientosPreview.push({ ...mov, yaImportado, organizationPropuesta, puedeImportarse });
    }

    return {
      ok: true,
      fileName: archivo.name,
      bankName: extracto.bankName,
      accountIdentifier: extracto.accountIdentifier,
      usedAI: extracto.usedAI,
      movimientos: movimientosPreview,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `No se pudo leer el archivo: ${e.message}` : "No se pudo leer el archivo.",
    };
  }
}

export interface MovimientoParaConfirmar {
  fecha: string;
  amount: number;
  concept: string;
  payerIdentifier: string | null;
  referenceNumber: string | null;
  externalId: string;
  lineaOriginal: string;
}

export interface ErrorMovimientoConfirmacion {
  externalId: string;
  mensaje: string;
}

export interface ConfirmarExtractoResultado {
  ok: boolean;
  creados: number;
  duplicados: number;
  matched: number;
  unmatched: number;
  noAtribuibles: number;
  errores: ErrorMovimientoConfirmacion[];
}

/**
 * Paso 2 (confirmación) — persiste los movimientos que el usuario dejó
 * seleccionados en el preview, uno por uno (un error en uno no frena el
 * resto, mismo criterio que `importarOrganizaciones`). Cada fila entra al
 * pipeline existente de `PaymentTransaction` exactamente como si hubiera
 * llegado por webhook: `reconcilePayment` decide MATCHED (`matchMethod:
 * "AUTO"`) o UNMATCHED — las UNMATCHED quedan listas para resolverse con el
 * módulo Smart Match ya existente, sin código nuevo para eso.
 */
export async function confirmarExtractoPDF(
  fileName: string,
  movimientos: MovimientoParaConfirmar[],
  bankName?: string | null
): Promise<ConfirmarExtractoResultado> {
  const administrator = await requireCurrentAdministrator();
  const provider = bankName?.trim() || PROVIDER;
  let creados = 0;
  let duplicados = 0;
  let matched = 0;
  let unmatched = 0;
  let noAtribuibles = 0;
  const errores: ErrorMovimientoConfirmacion[] = [];
  const paraNotificar: { id: string; status: PaymentTransactionStatus }[] = [];
  const importadosPorOrganizacion = new Map<string, number>();

  for (const mov of movimientos) {
    try {
      const existente = await prisma.paymentTransaction.findUnique({
        where: { externalId: mov.externalId },
        select: { id: true },
      });
      if (existente) {
        duplicados++;
        continue;
      }

      const resultado = await prisma.$transaction(async (tx) => {
        const reconciliacion = await reconcilePayment(mov.payerIdentifier, tx);
        await exigirOrganizacionAutorizada(reconciliacion.status === "MATCHED" ? reconciliacion.organizationId : null);
        const creado = await tx.paymentTransaction.create({
          data: {
            externalId: mov.externalId,
            provider,
            amount: mov.amount,
            currency: "ARS",
            payerIdentifier: mov.payerIdentifier,
            concept: mov.concept,
            // Fase 3.2 — fecha real del movimiento (no `createdAt`, que sigue
            // siendo cuándo ConcilIA creó el registro) y número de
            // comprobante, cuando el extracto los trae. `mov.fecha` ya viene
            // validada como YYYY-MM-DD (ver el filtro en
            // convertirATransaccionesPipeline / normalizarFecha).
            transactionDate: new Date(mov.fecha),
            referenceNumber: mov.referenceNumber,
            rawPayload: {
              source: PROVIDER,
              fileName,
              lineaOriginal: mov.lineaOriginal,
            } as Prisma.InputJsonValue,
            status: reconciliacion.status,
            organizationId: reconciliacion.organizationId,
            matchedAt: reconciliacion.status === "MATCHED" ? new Date() : null,
            matchMethod: reconciliacion.status === "MATCHED" ? "AUTO" : null,
          },
        });
        return { creado, reconciliacion };
      });

      creados++;
      if (resultado.reconciliacion.status === "MATCHED") matched++;
      else unmatched++;
      paraNotificar.push({ id: resultado.creado.id, status: resultado.reconciliacion.status });
      if (resultado.reconciliacion.organizationId) {
        importadosPorOrganizacion.set(resultado.reconciliacion.organizationId, (importadosPorOrganizacion.get(resultado.reconciliacion.organizationId) ?? 0) + 1);
      }
    } catch (e) {
      if (e instanceof MovimientoNoAtribuibleError) {
        noAtribuibles++;
        errores.push({ externalId: mov.externalId, mensaje: e.message });
        continue;
      }
      if (esErrorDeConstraintUnico(e)) {
        // Carrera con otra ingesta del mismo movimiento — el constraint
        // único de externalId es la red de seguridad final (mismo patrón
        // que el webhook de pagos).
        duplicados++;
        continue;
      }
      errores.push({
        externalId: mov.externalId,
        mensaje: e instanceof Error ? e.message : "Error desconocido al crear el movimiento.",
      });
    }
  }

  revalidatePath("/conciliacion");

  // Recibo (MATCHED) o alerta de sin-vincular (UNMATCHED) por email +
  // WhatsApp, igual que el resto del pipeline de pagos — se dispara después
  // de responder.
  after(() => {
    Promise.all(
      paraNotificar.map(({ id, status }) =>
        (status === "MATCHED" ? notificarPagoMatched(id) : notificarPagoUnmatched(id)).catch((e) =>
          console.error("[conciliacion:ingesta-pdf] Error inesperado notificando:", e)
        )
      )
    ).catch(() => {});
  });

  // Fase 3.4/5.9 — motor de matching + evidence-score en MODO SOMBRA,
  // siempre DESPUÉS de que el pago ya está confirmado y de responder (mismo
  // patrón `after()` que las notificaciones arriba).
  // `ejecutarEvaluacionSombraCompleta` nunca lanza — un error acá jamás
  // puede tirar abajo la importación, que ya terminó. Corre para TODO pago
  // creado, esté MATCHED o UNMATCHED a nivel organización — el motor de
  // unidad decide solo con lo que encuentre. Fase 5.9 — reemplaza a
  // ejecutarMatchingEnSombra (shadow-runner.ts, sin tocar): mismo efecto
  // sobre ShadowMatchLog, más la persistencia nueva de evidence-score.ts.
  after(() => {
    Promise.all(paraNotificar.map(({ id }) => ejecutarEvaluacionSombraCompleta(id))).catch(() => {});
  });

  // Sólo después de una importación completa y exitosa. El append es auxiliar.
  if (errores.length === 0) {
    await Promise.all([...importadosPorOrganizacion].map(([organizationId, createdCount]) =>
      appendProductEventSafely({ administratorId: administrator.id, organizationId, type: "STATEMENT_IMPORT_CONFIRMED", metadata: { createdCount, duplicateCount: 0, unattributableCount: 0 } })
    ));
  }

  return { ok: errores.length === 0, creados, duplicados, matched, unmatched, noAtribuibles, errores };
}

function esErrorDeConstraintUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === "P2002";
}
