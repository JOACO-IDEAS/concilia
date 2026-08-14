import { prisma } from "@/lib/prisma";
import { enviarMensajeWhatsApp } from "./whatsapp-client";
import { plantillaRecordatorioPagoWhatsApp } from "./templates";
import { calcularMoraDeUnaOrganizacion, REMINDER_COOLDOWN_DAYS } from "@/lib/delinquency/detect-overdue";

const LOG = "[whatsapp:reminder]";

export interface ResultadoRecordatorio {
  ok: boolean;
  omitido: boolean; // true = no se mandó nada (cooldown, sin canal, no está en mora)
  motivo?: string;
}

/**
 * Recordatorio de pago (morosidad) por WhatsApp — adjunta el CBU/Alias del
 * `BillingProfile` por defecto de la organización para facilitar la
 * transferencia. Vuelve a calcular la mora en el momento del envío (no
 * confía en datos que el caller pudo haber leído hace rato — ej. el
 * Reclamador Automático en lote) para que el cooldown anti-spam
 * (`REMINDER_COOLDOWN_DAYS`) sea siempre correcto.
 *
 * Deja registro en `PaymentReminder` tanto si el envío fue real como si
 * quedó en modo simulación (sin `WHATSAPP_TOKEN` configurada) — el cooldown
 * existe para no bombardear a la organización de intentos de contacto, sea
 * cual sea el resultado real de la entrega en Meta.
 */
export async function sendWhatsAppPaymentReminder(
  organizationId: string,
  administratorId: string
): Promise<ResultadoRecordatorio> {
  const mora = await calcularMoraDeUnaOrganizacion(organizationId, administratorId);
  if (!mora) {
    return { ok: false, omitido: false, motivo: "La organización no existe o no está en mora." };
  }
  if (!mora.puedeNotificar) {
    console.log(
      `${LOG} Omitido para ${organizationId} — ya se notificó el ${mora.ultimoRecordatorioEnviado} (cooldown ${REMINDER_COOLDOWN_DAYS} días).`
    );
    return { ok: true, omitido: true, motivo: `Ya se le notificó el ${mora.ultimoRecordatorioEnviado}.` };
  }

  const org = await prisma.organization.findFirst({
    where: { id: organizationId, administrators: { some: { administratorId } } },
    select: {
      name: true,
      channels: {
        where: { type: "WHATSAPP", purpose: { in: ["BILLING", "GENERAL", "NOTIFICATIONS"] } },
      },
    },
  });
  if (!org) return { ok: false, omitido: false, motivo: "La organización no existe." };

  const destinatarios = [...new Set(org.channels.map((c) => c.value))];
  if (destinatarios.length === 0) {
    console.warn(`${LOG} "${org.name}" no tiene ningún ContactChannel de WhatsApp — no hay a quién recordarle.`);
    return { ok: false, omitido: false, motivo: "Sin canal de WhatsApp configurado para esta organización." };
  }

  const mensaje = plantillaRecordatorioPagoWhatsApp({
    organizationName: org.name,
    amountDue: mora.montoEstimado,
    currency: mora.currency,
    daysOverdue: mora.diasAtraso,
    bankAccountType: mora.bankAccountType,
    bankAccountNumber: mora.bankAccountNumber,
  });

  await Promise.all(destinatarios.map((telefono) => enviarMensajeWhatsApp(telefono, mensaje)));

  await prisma.paymentReminder.create({
    data: {
      organizationId,
      channel: "WHATSAPP",
      amountDue: mora.montoEstimado ?? 0,
      daysOverdue: mora.diasAtraso,
    },
  });

  console.log(`${LOG} Recordatorio enviado a "${org.name}" (${destinatarios.length} destinatario(s)).`);
  return { ok: true, omitido: false };
}
