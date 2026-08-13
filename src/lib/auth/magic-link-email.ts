import "server-only";

import { obtenerClienteResend, resendApiKeyIsPresent } from "@/lib/notifications/resend-client";
import { MAGIC_LINK_TTL_MS } from "./magic-link";

export const PILOT_EMAIL_SAFE_CODES = [
  "API_KEY_MISSING",
  "FROM_ADDRESS_MISSING",
  "FROM_ADDRESS_INVALID",
  "APP_ORIGIN_MISSING",
  "APP_ORIGIN_INVALID",
  "CLIENT_UNAVAILABLE",
  "CONTENT_BUILD_FAILED",
  "INVALID_API_KEY",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "SENDER_NOT_ALLOWED",
  "RECIPIENT_NOT_ALLOWED",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "NETWORK_ERROR",
  "UNKNOWN_PROVIDER_ERROR",
] as const;

export type PilotEmailSafeCode = (typeof PILOT_EMAIL_SAFE_CODES)[number];
export type PilotMagicLinkDeliveryResult =
  | { accepted: true }
  | { accepted: false; safeCode: PilotEmailSafeCode };

export type PilotEmailConfigurationStatus =
  | { ready: true }
  | {
      ready: false;
      safeCode:
        | "API_KEY_MISSING"
        | "FROM_ADDRESS_MISSING"
        | "FROM_ADDRESS_INVALID"
        | "APP_ORIGIN_MISSING"
        | "APP_ORIGIN_INVALID"
        | "CLIENT_UNAVAILABLE";
    };

export class MagicLinkOriginError extends Error {
  constructor() { super("El origen público para acceso no es válido."); this.name = "MagicLinkOriginError"; }
}

function isValidFromAddress(value: string): boolean {
  const trimmed = value.trim();
  const email = "[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+";
  return new RegExp(`^(?:${email}|[^<>\\r\\n]+ <${email}>)$`).test(trimmed);
}

function magicLinkOriginStatus(env: NodeJS.ProcessEnv): Extract<PilotEmailConfigurationStatus, { ready: false }> | null {
  const raw = env.CONCILIA_APP_ORIGIN;
  if (!raw || raw.trim().length === 0) return { ready: false, safeCode: "APP_ORIGIN_MISSING" };
  try {
    resolveMagicLinkOrigin(env);
    return null;
  } catch {
    return { ready: false, safeCode: "APP_ORIGIN_INVALID" };
  }
}

/** Diagnóstico puro y server-only: no envía, no consulta Prisma y no escribe. */
export function pilotEmailConfigurationStatus(env: NodeJS.ProcessEnv = process.env): PilotEmailConfigurationStatus {
  if (!resendApiKeyIsPresent(env)) return { ready: false, safeCode: "API_KEY_MISSING" };

  const from = env.NOTIFICATIONS_FROM_EMAIL;
  if (!from || from.trim().length === 0) return { ready: false, safeCode: "FROM_ADDRESS_MISSING" };
  if (!isValidFromAddress(from)) return { ready: false, safeCode: "FROM_ADDRESS_INVALID" };

  const originStatus = magicLinkOriginStatus(env);
  if (originStatus) return originStatus;

  try {
    return obtenerClienteResend(env) ? { ready: true } : { ready: false, safeCode: "CLIENT_UNAVAILABLE" };
  } catch {
    return { ready: false, safeCode: "CLIENT_UNAVAILABLE" };
  }
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

/** Convierte únicamente metadatos conocidos del proveedor a una allowlist.
 * Nunca propaga mensaje, destinatario, token ni respuesta cruda del SDK. */
function safeProviderCode(error: unknown): PilotEmailSafeCode {
  const candidate = error as { statusCode?: unknown; name?: unknown } | null;
  const statusCode = candidate?.statusCode;
  if (statusCode === 401) return "INVALID_API_KEY";
  if (statusCode === 403) return "UNAUTHORIZED";
  if (statusCode === 422) return "VALIDATION_ERROR";
  if (statusCode === 429) return "RATE_LIMITED";
  if (typeof statusCode === "number" && statusCode >= 500) return "PROVIDER_UNAVAILABLE";
  if (candidate?.name === "validation_error") return "VALIDATION_ERROR";
  return "UNKNOWN_PROVIDER_ERROR";
}

/** Adaptador mínimo de Resend. Nunca registra destinatario, token ni URL. */
export async function sendPilotMagicLink(email: string, token: string, env: NodeJS.ProcessEnv = process.env): Promise<PilotMagicLinkDeliveryResult> {
  const configuration = pilotEmailConfigurationStatus(env);
  if (!configuration.ready) return { accepted: false, safeCode: configuration.safeCode };

  const resend = obtenerClienteResend(env);
  if (!resend) return { accepted: false, safeCode: "CLIENT_UNAVAILABLE" };
  let content: ReturnType<typeof buildPilotMagicLinkEmail>;
  try { content = buildPilotMagicLinkEmail(token, env); } catch (error) {
    if (error instanceof MagicLinkOriginError) return { accepted: false, safeCode: "APP_ORIGIN_INVALID" };
    return { accepted: false, safeCode: "CONTENT_BUILD_FAILED" };
  }
  try {
    const { error } = await resend.emails.send({ from: env.NOTIFICATIONS_FROM_EMAIL!.trim(), to: email, subject: content.subject, text: content.text, html: content.html });
    return error ? { accepted: false, safeCode: safeProviderCode(error) } : { accepted: true };
  } catch { return { accepted: false, safeCode: "NETWORK_ERROR" }; }
}
