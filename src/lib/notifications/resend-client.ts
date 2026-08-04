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
export function obtenerClienteResend(): Resend | null {
  if (clienteMemo !== undefined) return clienteMemo;
  const apiKey = process.env.RESEND_API_KEY;
  clienteMemo = apiKey ? new Resend(apiKey) : null;
  return clienteMemo;
}
