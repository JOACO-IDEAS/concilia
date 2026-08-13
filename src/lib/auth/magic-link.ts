import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const GENERIC_MAGIC_LINK_MESSAGE = "Si el acceso está habilitado, vas a recibir un enlace para ingresar.";

export function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
export function hashMagicToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function createRawMagicToken(): string { return randomBytes(32).toString("base64url"); }

export async function issuePilotMagicLink(email: string, options: { initiallyRevoked?: boolean } = {}): Promise<{ token: string; administratorId: string } | null> {
  const administrator = await prisma.administrator.findFirst({ where: { email: normalizeEmail(email), deletedAt: null }, select: { id: true } });
  if (!administrator) return null;
  const token = createRawMagicToken();
  await prisma.pilotAccessToken.create({ data: { administratorId: administrator.id, tokenHash: hashMagicToken(token), expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS), revokedAt: options.initiallyRevoked ? new Date() : null } });
  return { token, administratorId: administrator.id };
}

/** Un token de email nace revocado; sólo se habilita si Resend aceptó el envío.
 * Si esta activación falla, el token permanece inutilizable (fail-closed). */
export async function activatePilotMagicLink(token: string): Promise<boolean> {
  const activated = await prisma.pilotAccessToken.updateMany({ where: { tokenHash: hashMagicToken(token), usedAt: null, revokedAt: { not: null }, expiresAt: { gt: new Date() } }, data: { revokedAt: null } });
  return activated.count === 1;
}

/** Atomic compare-and-set: una sola request puede marcar usedAt. */
export async function consumePilotMagicLink(token: string): Promise<string | null> {
  const tokenHash = hashMagicToken(token);
  const now = new Date();
  const consumed = await prisma.pilotAccessToken.updateMany({ where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now }, administrator: { deletedAt: null } }, data: { usedAt: now } });
  if (consumed.count !== 1) return null;
  const row = await prisma.pilotAccessToken.findUnique({ where: { tokenHash }, select: { administrator: { select: { email: true, deletedAt: true } } } });
  return row?.administrator && !row.administrator.deletedAt ? row.administrator.email : null;
}
