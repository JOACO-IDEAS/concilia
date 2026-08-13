import { Resend } from "resend";

// Dirección remitente por defecto: "onboarding@resend.dev" es la dirección
// de prueba que Resend habilita para cualquier cuenta sin necesidad de
// verificar un dominio propio — sirve para desarrollo y para no romper el
// envío mientras no se configure `NOTIFICATIONS_FROM_EMAIL` con un dominio
// verificado real.
export const REMITENTE_EMAIL = process.env.NOTIFICATIONS_FROM_EMAIL ?? "ConcilIA <onboarding@resend.dev>";

let clienteMemo: Resend | null | undefined;

/**
 * Cliente de Resend, o `null` si `RESEND_API_KEY` no está configurada.
 * Nunca lanza — a diferencia de `src/lib/prisma.ts` (que necesita una
 * instancia siempre válida para no explotar al importarse), acá cada
 * llamador decide cómo degradar: loguear y no enviar, sin romper el webhook
 * que dispara la notificación (ver src/lib/notifications/send-payment-notifications.ts).
 */
export function obtenerClienteResend(env: NodeJS.ProcessEnv = process.env): Resend | null {
  const create = () => {
    const apiKey = env.RESEND_API_KEY?.trim();
    if (!apiKey) return null;
    try { return new Resend(apiKey); } catch { return null; }
  };
  if (env !== process.env) return create();
  if (clienteMemo !== undefined) return clienteMemo;
  clienteMemo = create();
  return clienteMemo;
}

/** Sólo comprueba presencia local del secreto; nunca contacta al proveedor. */
export function resendApiKeyIsPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.RESEND_API_KEY === "string" && env.RESEND_API_KEY.trim().length > 0;
}
