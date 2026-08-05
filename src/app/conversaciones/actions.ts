"use server";

import { prisma } from "@/lib/prisma";

export interface RecordatorioEnviadoDTO {
  id: string;
  organizationName: string;
  channel: string;
  amountDue: number;
  sentAt: string;
}

export interface ConversacionesResultado {
  ok: boolean;
  recordatorios: RecordatorioEnviadoDTO[];
  error?: string;
}

/**
 * "Conversaciones" — historial real de mensajes salientes. Hoy solo hay un
 * registro auditable en la base (`PaymentReminder`, del Reclamador
 * Automático de morosidad); los recibos/alertas de pago se logean pero no
 * se persisten todavía. Placeholder inteligente honesto: muestra lo que
 * hay, no inventa un inbox completo de WhatsApp.
 */
export async function obtenerConversacionesRecientes(): Promise<ConversacionesResultado> {
  try {
    const recordatorios = await prisma.paymentReminder.findMany({
      orderBy: { sentAt: "desc" },
      take: 20,
      include: { organization: { select: { name: true } } },
    });

    return {
      ok: true,
      recordatorios: recordatorios.map((r) => ({
        id: r.id,
        organizationName: r.organization.name,
        channel: r.channel,
        amountDue: r.amountDue.toNumber(),
        sentAt: r.sentAt.toISOString(),
      })),
    };
  } catch (e) {
    return {
      ok: false,
      recordatorios: [],
      error: e instanceof Error ? e.message : "No se pudo consultar el historial.",
    };
  }
}
