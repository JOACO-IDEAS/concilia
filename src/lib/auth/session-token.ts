import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "concilia_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type SessionPayload = { email: string; exp: number };

function sessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.CONCILIA_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("La sesión no está configurada de forma segura.");
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(email: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env): string {
  const payload = Buffer.from(JSON.stringify({ email: email.trim().toLowerCase(), exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS }), "utf8").toString("base64url");
  return `${payload}.${sign(payload, sessionSecret(env))}`;
}

export function parseSessionToken(token: string | undefined, now = Date.now(), env: NodeJS.ProcessEnv = process.env): SessionPayload | null {
  if (!token) return null;
  const [encoded, receivedSignature, ...rest] = token.split(".");
  if (!encoded || !receivedSignature || rest.length > 0) return null;
  const expected = Buffer.from(sign(encoded, sessionSecret(env)));
  const received = Buffer.from(receivedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.email || typeof payload.email !== "string" || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return { email: payload.email, exp: payload.exp };
  } catch { return null; }
}
