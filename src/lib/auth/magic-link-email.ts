import "server-only";

import { obtenerClienteResend, REMITENTE_EMAIL } from "@/lib/notifications/resend-client";
import { MAGIC_LINK_TTL_MS } from "./magic-link";

export type PilotMagicLinkDeliveryResult =
  | { accepted: true }
  | { accepted: false; category: "configuration" | "rejected" | "transient" | "invalid_origin" };

export class MagicLinkOriginError extends Error {
  constructor() { super("El origen público para acceso no es válido."); this.name = "MagicLinkOriginError"; }
}

/** Origen explícito, server-only. Nunca deriva host/origin de la request. */
export function resolveMagicLinkOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CONCILIA_APP_ORIGIN;
  if (!raw) throw new MagicLinkOriginError();
  let url: URL;
  try { url = new URL(raw); } catch { throw new MagicLinkOriginError(); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.origin !== raw || url.username || url.password || url.hash || url.search || (!local && url.protocol !== "https:") || (env.NODE_ENV === "production" && url.protocol !== "https:")) throw new MagicLinkOriginError();
  return url.origin;
}

export function buildPilotMagicLink(token: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${resolveMagicLinkOrigin(env)}/acceso/magic?token=${encodeURIComponent(token)}`;
}

export function buildPilotMagicLinkEmail(token: string, env: NodeJS.ProcessEnv = process.env) {
  const url = buildPilotMagicLink(token, env);
  const minutes = Math.ceil(MAGIC_LINK_TTL_MS / 60_000);
  return {
    subject: "Acceso a ConcilIA",
    text: `Solicitaste acceso a ConcilIA. Usá este enlace para ingresar:\n\n${url}\n\nEste enlace vence en ${minutes} minutos. Si no solicitaste acceso, podés ignorar este mensaje.`,
    html: `<p>Solicitaste acceso a <strong>ConcilIA</strong>.</p><p><a href="${url}">Ingresar a ConcilIA</a></p><p>Este enlace vence en ${minutes} minutos.</p><p>Si no solicitaste acceso, podés ignorar este mensaje.</p><p>Si el botón no funciona, copiá este enlace:</p><p><a href="${url}">${url}</a></p>`,
  };
}

/** Adaptador mínimo de Resend. Nunca registra destinatario, token ni URL. */
export async function sendPilotMagicLink(email: string, token: string, env: NodeJS.ProcessEnv = process.env): Promise<PilotMagicLinkDeliveryResult> {
  const resend = obtenerClienteResend();
  if (!resend || !env.NOTIFICATIONS_FROM_EMAIL) return { accepted: false, category: "configuration" };
  let content: ReturnType<typeof buildPilotMagicLinkEmail>;
  try { content = buildPilotMagicLinkEmail(token, env); } catch (error) {
    if (error instanceof MagicLinkOriginError) return { accepted: false, category: "invalid_origin" };
    return { accepted: false, category: "configuration" };
  }
  try {
    const { error } = await resend.emails.send({ from: REMITENTE_EMAIL, to: email, subject: content.subject, text: content.text, html: content.html });
    return error ? { accepted: false, category: "rejected" } : { accepted: true };
  } catch { return { accepted: false, category: "transient" }; }
}
