"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { detectarOrganizacionesEnMora, type OrganizacionEnMora } from "@/lib/delinquency/detect-overdue";
import { sendWhatsAppPaymentReminder } from "@/lib/whatsapp/send-reminder-whatsapp";

const LOG = "[morosidad]";

export type OrganizacionMorosaDTO = OrganizacionEnMora;

export interface ListaMorosidadResultado {
  ok: boolean;
  organizaciones: OrganizacionMorosaDTO[];
  error?: string;
}

/**
 * Módulo de Detección de Morosidad — organizaciones activas con saldos
 * vencidos según la heurística de `detectarOrganizacionesEnMora` (ver
 * src/lib/delinquency/detect-overdue.ts). Si todavía no hay una base de
 * datos conectada, devuelve `ok:false` con lista vacía en vez de tirar,
 * mismo criterio que `obtenerPagosWebhook`.
 */
export async function getOverdueOrganizations(): Promise<ListaMorosidadResultado> {
  try {
    const organizaciones = await detectarOrganizacionesEnMora();
    return { ok: true, organizaciones };
  } catch (e) {
    return {
      ok: false,
      organizaciones: [],
      error: e instanceof Error ? e.message : "No se pudo consultar la morosidad.",
    };
  }
}

/** Botón "Enviar Recordatorio por WhatsApp" de una fila individual. */
export async function enviarRecordatorioIndividual(
  organizationId: string
): Promise<{ ok: boolean; omitido: boolean; motivo?: string }> {
  const resultado = await sendWhatsAppPaymentReminder(organizationId);
  revalidatePath("/morosidad");
  return resultado;
}

export interface ResultadoReclamadorAutomatico {
  ok: boolean;
  encolados: number;
  omitidosPorCooldown: number;
}

/**
 * "Ejecutar Reclamador Automático" — despacha recordatorios a TODAS las
 * organizaciones en mora que no estén en cooldown, en un solo clic. El envío
 * real corre en segundo plano con `after()` (`Promise.allSettled`: una
 * organización que falle no frena a las demás) — la Server Action responde
 * de inmediato con cuántas se encolaron, no con el resultado final de cada
 * envío (eso queda en el log del servidor y en `PaymentReminder`).
 */
export async function ejecutarReclamadorAutomatico(): Promise<ResultadoReclamadorAutomatico> {
  const organizaciones = await detectarOrganizacionesEnMora();
  const paraNotificar = organizaciones.filter((o) => o.puedeNotificar);
  const omitidosPorCooldown = organizaciones.length - paraNotificar.length;

  after(() => {
    Promise.allSettled(paraNotificar.map((o) => sendWhatsAppPaymentReminder(o.organizationId))).then(
      (resultados) => {
        const fallidos = resultados.filter((r) => r.status === "rejected").length;
        console.log(
          `${LOG} Reclamador Automático — lote de ${resultados.length} terminado, ${fallidos} con error inesperado.`
        );
      }
    );
  });

  revalidatePath("/morosidad");
  return { ok: true, encolados: paraNotificar.length, omitidosPorCooldown };
}
