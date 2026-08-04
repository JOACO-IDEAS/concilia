export interface ConfigWhatsApp {
  token: string;
  phoneId: string;
  apiVersion: string;
}

let configMemo: ConfigWhatsApp | null | undefined;

/**
 * Config de WhatsApp Cloud API (Meta), o `null` si `WHATSAPP_TOKEN` /
 * `WHATSAPP_PHONE_ID` no están configuradas — mismo patrón que
 * `obtenerClienteResend()` en src/lib/notifications/resend-client.ts.
 */
export function obtenerConfigWhatsApp(): ConfigWhatsApp | null {
  if (configMemo !== undefined) return configMemo;
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  configMemo =
    token && phoneId
      ? { token, phoneId, apiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0" }
      : null;
  return configMemo;
}

export interface ResultadoEnvioWhatsApp {
  ok: boolean;
  simulado: boolean; // true = no había config, se logueó nomás en vez de enviar
  error?: string;
}

function normalizarTelefono(telefono: string): string {
  // Meta espera el número en formato E.164 sin "+", espacios ni guiones.
  return telefono.replace(/[^\d]/g, "");
}

/**
 * Envía un mensaje de texto libre por WhatsApp Cloud API. Nunca lanza —
 * igual que el cliente de Resend, cada llamador decide cómo degradar (ver
 * src/lib/whatsapp/send-payment-whatsapp.ts).
 *
 * Nota de producción: Meta solo permite texto libre dentro de una ventana de
 * 24hs desde el último mensaje del usuario ("customer service window").
 * Para notificaciones proactivas fuera de esa ventana (el caso de acá:
 * recibos y alertas que dispara el sistema, no el usuario), Meta exige un
 * Message Template pre-aprobado en Meta Business Manager — este cliente
 * manda texto libre por simplicidad mientras no hay ninguna plantilla
 * configurada; para producción real, reemplazar el payload por uno
 * `type: "template"` una vez que exista una plantilla aprobada.
 */
export async function enviarMensajeWhatsApp(
  telefono: string,
  mensaje: string
): Promise<ResultadoEnvioWhatsApp> {
  const config = obtenerConfigWhatsApp();
  if (!config) {
    console.warn(
      `[whatsapp] WHATSAPP_TOKEN/WHATSAPP_PHONE_ID no configuradas — se omite el envío a ${telefono}. ` +
        `Mensaje que se hubiera enviado: "${mensaje.split("\n")[0]}…"`
    );
    return { ok: false, simulado: true };
  }

  try {
    const respuesta = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizarTelefono(telefono),
          type: "text",
          text: { body: mensaje, preview_url: false },
        }),
      }
    );

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      console.error(
        `[whatsapp] Meta Cloud API rechazó el envío a ${telefono} (HTTP ${respuesta.status}): ${detalle}`
      );
      return { ok: false, simulado: false, error: `HTTP ${respuesta.status}` };
    }

    return { ok: true, simulado: false };
  } catch (e) {
    console.error(`[whatsapp] Error de red enviando a ${telefono}:`, e);
    return { ok: false, simulado: false, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}
