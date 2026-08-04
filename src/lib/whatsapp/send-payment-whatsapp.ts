import { prisma } from "@/lib/prisma";
import { enviarMensajeWhatsApp } from "./whatsapp-client";
import { plantillaAlertaSinReconciliarWhatsApp, plantillaReciboPagoWhatsApp } from "./templates";

const LOG = "[whatsapp:payments]";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://conciliia-app.vercel.app";

function obtenerTelefonosAdminDesdeEnv(): string[] {
  // Administrator no tiene un campo de teléfono en el schema (solo `email`,
  // ver prisma/schema.prisma) — agregarlo requeriría una migración, y este
  // módulo se mantuvo deliberadamente sin cambios de schema. Mientras tanto,
  // el/los número(s) de operaciones se configuran acá, separados por coma.
  const raw = process.env.WHATSAPP_ADMIN_PHONE;
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Recibo de pago por WhatsApp — mismo criterio de destinatarios que
 * `sendPaymentReceiptEmail`, pero sobre los `ContactChannel` de tipo
 * WHATSAPP (billing/general) de la organización en vez de EMAIL.
 */
export async function sendWhatsAppReceipt(paymentTransactionId: string): Promise<void> {
  const pago = await prisma.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
    include: {
      organization: {
        include: {
          channels: { where: { type: "WHATSAPP", purpose: { in: ["BILLING", "GENERAL"] } } },
        },
      },
    },
  });

  if (!pago || !pago.organization) {
    console.warn(
      `${LOG} sendWhatsAppReceipt: transacción ${paymentTransactionId} no existe o no tiene organización vinculada — no se envía nada.`
    );
    return;
  }

  const destinatarios = [...new Set(pago.organization.channels.map((c) => c.value))];
  if (destinatarios.length === 0) {
    console.warn(
      `${LOG} "${pago.organization.name}" no tiene ningún ContactChannel de WhatsApp (billing/general) — no hay a quién mandarle el recibo de la transacción ${pago.externalId}.`
    );
    return;
  }

  const mensaje = plantillaReciboPagoWhatsApp({
    organizationName: pago.organization.name,
    amount: pago.amount.toNumber(),
    currency: pago.currency,
    transactionId: pago.externalId,
    provider: pago.provider,
    fecha: pago.matchedAt ?? pago.createdAt,
  });

  await Promise.all(
    destinatarios.map(async (telefono) => {
      const resultado = await enviarMensajeWhatsApp(telefono, mensaje);
      if (resultado.ok) console.log(`${LOG} Enviado a ${telefono} (recibo de pago ${pago.externalId}).`);
    })
  );
}

/**
 * Alerta de pago sin reconciliar por WhatsApp — mismo criterio que
 * `sendUnmatchedPaymentAlert`, pero a los números de `WHATSAPP_ADMIN_PHONE`
 * en vez de a los `Administrator.email`.
 */
export async function sendWhatsAppUnmatchedAlert(paymentTransactionId: string): Promise<void> {
  const pago = await prisma.paymentTransaction.findUnique({ where: { id: paymentTransactionId } });
  if (!pago) {
    console.warn(
      `${LOG} sendWhatsAppUnmatchedAlert: transacción ${paymentTransactionId} no existe — no se envía nada.`
    );
    return;
  }

  const destinatarios = obtenerTelefonosAdminDesdeEnv();
  if (destinatarios.length === 0) {
    console.warn(
      `${LOG} WHATSAPP_ADMIN_PHONE no está configurada — no hay a quién alertar por WhatsApp del pago sin vincular ${pago.externalId}.`
    );
    return;
  }

  const mensaje = plantillaAlertaSinReconciliarWhatsApp({
    transactionId: pago.externalId,
    amount: pago.amount.toNumber(),
    currency: pago.currency,
    payerIdentifier: pago.payerIdentifier,
    provider: pago.provider,
    fecha: pago.createdAt,
    panelUrl: `${APP_URL}/conciliacion`,
  });

  await Promise.all(
    destinatarios.map(async (telefono) => {
      const resultado = await enviarMensajeWhatsApp(telefono, mensaje);
      if (resultado.ok)
        console.log(`${LOG} Enviado a ${telefono} (alerta sin reconciliar ${pago.externalId}).`);
    })
  );
}
