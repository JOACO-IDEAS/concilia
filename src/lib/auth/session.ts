import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "concilia_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export class AuthenticationError extends Error {
  constructor(message = "Autenticación requerida.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

type SessionPayload = { email: string; exp: number };

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function sessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.CONCILIA_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new AuthenticationError("La sesión no está configurada de forma segura.");
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Función pura para tests y para verificar una cookie sin confiar en el cliente. */
export function createSessionToken(email: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env): string {
  const payload = base64url(JSON.stringify({ email: email.trim().toLowerCase(), exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS }));
  return `${payload}.${sign(payload, sessionSecret(env))}`;
}

export function parseSessionToken(token: string | undefined, now = Date.now(), env: NodeJS.ProcessEnv = process.env): SessionPayload | null {
  if (!token) return null;
  const [encoded, receivedSignature, ...rest] = token.split(".");
  if (!encoded || !receivedSignature || rest.length > 0) return null;
  const expectedSignature = sign(encoded, sessionSecret(env));
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  const raw = decodeBase64url(encoded);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as SessionPayload;
    if (!payload.email || typeof payload.email !== "string" || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return { email: payload.email, exp: payload.exp };
  } catch {
    return null;
  }
}

/** Primer mecanismo de acceso: credencial bootstrap de entorno, nunca un id enviado por el cliente. */
export function bootstrapCredentialsAreValid(email: string, password: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const expectedEmail = env.CONCILIA_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const expectedPassword = env.CONCILIA_BOOTSTRAP_ADMIN_PASSWORD;
  if (!expectedEmail || !expectedPassword) return false;
  const providedEmail = email.trim().toLowerCase();
  const a = Buffer.from(`${providedEmail}\u0000${password}`);
  const b = Buffer.from(`${expectedEmail}\u0000${expectedPassword}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function establishSessionForEmail(email: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, createSessionToken(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function requireCurrentAdministrator() {
  const store = await cookies();
  const session = parseSessionToken(store.get(SESSION_COOKIE_NAME)?.value);
  if (!session) throw new AuthenticationError();
  const administrator = await prisma.administrator.findFirst({
    where: { email: session.email, deletedAt: null },
    select: { id: true, email: true, name: true },
  });
  if (!administrator) throw new AuthenticationError("La identidad de la sesión ya no es válida.");
  return administrator;
}
