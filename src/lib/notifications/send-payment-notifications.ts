import { prisma } from "@/lib/prisma";
import { obtenerClienteResend, REMITENTE_EMAIL } from "./resend-client";
import { plantillaAlertaSinReconciliar, plantillaReciboPago } from "./templates";
import { sendWhatsAppReceipt, sendWhatsAppUnmatchedAlert } from "@/lib/whatsapp/send-payment-whatsapp";

const LOG = "[notifications:payments]";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://conciliia-app.vercel.app";

/**
 * Envía un email por destinatario (no falla en bloque: si uno de varios
 * destinatarios rechaza el envío, los demás igual se intentan). Nunca
 * lanza — cada llamador de este módulo corre dentro de `after()` en el
 * webhook, sin nadie esperando el resultado.
 */
async function enviarATodos(
  destinatarios: string[],
  email: { subject: string; html: string; text: string },
  contexto: string
): Promise<void> {
  const resend = obtenerClienteResend();
  if (!resend) {
    console.warn(
      `${LOG} RESEND_API_KEY no está configurada — se omite el envío (${contexto}). ` +
        `Destinatarios que se hubieran notificado: ${destinatarios.join(", ")}`
    );
    return;
  }

  await Promise.all(
    destinatarios.map(async (to) => {
      try {
        const { error } = await resend.emails.send({
          from: REMITENTE_EMAIL,
          to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        if (error) {
          console.error(`${LOG} Resend rechazó el envío a ${to} (${contexto}):`, error);
        } else {
          console.log(`${LOG} Enviado a ${to} (${contexto}).`);
        }
      } catch (e) {
        console.error(`${LOG} Error de red/SDK enviando a ${to} (${contexto}):`, e);
      }
    })
  );
}

/**
 * Email 1 — recibo de pago reconciliado. Va a los ContactChannel de tipo
 * EMAIL con propósito BILLING o GENERAL de la Organization a la que quedó
 * vinculado el pago. Vuelve a leer el PaymentTransaction por id en vez de
 * recibir los datos ya armados: este módulo corre dentro de `after()`, así
 * que un round-trip extra a la base no le cuesta nada a la respuesta del
 * webhook, y mantiene el route handler simple.
 */
export async function sendPaymentReceiptEmail(paymentTransactionId: string): Promise<void> {
  const pago = await prisma.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
    include: {
      organization: {
        include: { channels: { where: { type: "EMAIL", purpose: { in: ["BILLING", "GENERAL"] } } } },
      },
    },
  });

  if (!pago || !pago.organization) {
    console.warn(
      `${LOG} sendPaymentReceiptEmail: transacción ${paymentTransactionId} no existe o no tiene organización vinculada — no se envía nada.`
    );
    return;
  }

  const destinatarios = [...new Set(pago.organization.channels.map((c) => c.value))];
  if (destinatarios.length === 0) {
    console.warn(
      `${LOG} "${pago.organization.name}" no tiene ningún ContactChannel de email (billing/general) — no hay a quién mandarle el recibo de la transacción ${pago.externalId}.`
    );
    return;
  }

  const email = plantillaReciboPago({
    organizationName: pago.organization.name,
    amount: pago.amount.toNumber(),
    currency: pago.currency,
    transactionId: pago.externalId,
    provider: pago.provider,
    fecha: pago.matchedAt ?? pago.createdAt,
  });

  await enviarATodos(destinatarios, email, `recibo de pago ${pago.externalId}`);
}

/**
 * Email 2 — alerta de pago UNMATCHED. Va a todos los Administrator activos:
 * como el pago no matcheó a ninguna Organization, no hay forma de acotar el
 * destinatario a "el administrador de esa organización" — este SaaS además
 * opera hoy con un único tenant (ver nota en prisma/schema.prisma sobre
 * Organization.taxId), así que notificar a todos los Administrator activos
 * es el comportamiento correcto.
 */
export async function sendUnmatchedPaymentAlert(paymentTransactionId: string): Promise<void> {
  const [pago, administradores] = await Promise.all([
    prisma.paymentTransaction.findUnique({ where: { id: paymentTransactionId } }),
    prisma.administrator.findMany({ where: { deletedAt: null }, select: { email: true } }),
  ]);

  if (!pago) {
    console.warn(
      `${LOG} sendUnmatchedPaymentAlert: transacción ${paymentTransactionId} no existe — no se envía nada.`
    );
    return;
  }

  const destinatarios = administradores.map((a) => a.email);
  if (destinatarios.length === 0) {
    console.warn(
      `${LOG} No hay ningún Administrator activo a quien alertar del pago sin vincular ${pago.externalId}.`
    );
    return;
  }

  const email = plantillaAlertaSinReconciliar({
    transactionId: pago.externalId,
    amount: pago.amount.toNumber(),
    currency: pago.currency,
    payerIdentifier: pago.payerIdentifier,
    provider: pago.provider,
    fecha: pago.createdAt,
    panelUrl: `${APP_URL}/conciliacion`,
  });

  await enviarATodos(destinatarios, email, `alerta sin reconciliar ${pago.externalId}`);
}

function logearRechazos(contexto: string, resultados: PromiseSettledResult<unknown>[]): void {
  for (const r of resultados) {
    if (r.status === "rejected") console.error(`${LOG} Error inesperado enviando ${contexto}:`, r.reason);
  }
}

/**
 * Dispara el email y el WhatsApp de recibo de pago en paralelo — un canal
 * que falle no frena al otro (`Promise.allSettled`, no `Promise.all`). Punto
 * único que usan los 3 call sites del pipeline de pagos (webhook, vínculo
 * manual/Smart Match, ingesta de extractos PDF) para no repetir en cada uno
 * la lista de canales a notificar.
 */
export async function notificarPagoMatched(paymentTransactionId: string): Promise<void> {
  const resultados = await Promise.allSettled([
    sendPaymentReceiptEmail(paymentTransactionId),
    sendWhatsAppReceipt(paymentTransactionId),
  ]);
  logearRechazos(`recibo de pago (${paymentTransactionId})`, resultados);
}

/** Igual que `notificarPagoMatched`, para la alerta de pago sin reconciliar. */
export async function notificarPagoUnmatched(paymentTransactionId: string): Promise<void> {
  const resultados = await Promise.allSettled([
    sendUnmatchedPaymentAlert(paymentTransactionId),
    sendWhatsAppUnmatchedAlert(paymentTransactionId),
  ]);
  logearRechazos(`alerta sin reconciliar (${paymentTransactionId})`, resultados);
}
