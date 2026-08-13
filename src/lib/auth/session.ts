import "server-only";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
export { createSessionToken, parseSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./session-token";
import { createSessionToken, parseSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./session-token";

export class AuthenticationError extends Error {
  constructor(message = "Autenticación requerida.") {
    super(message);
    this.name = "AuthenticationError";
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
