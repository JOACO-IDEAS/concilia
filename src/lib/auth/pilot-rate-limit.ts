import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import type { PilotAccessRateLimitScope } from "@/generated/prisma/enums";

export const PILOT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export const PILOT_RATE_LIMITS = {
  issueEmail: 3,
  issueIp: 10,
  consumeToken: 5,
  consumeIp: 20,
} as const;

export class PilotRateLimitUnavailableError extends Error {
  constructor() {
    super("La protección de acceso no está disponible.");
    this.name = "PilotRateLimitUnavailableError";
  }
}

type Subject = { scope: PilotAccessRateLimitScope; subjectKey: string; limit: number };
export type PilotRateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function rateLimitSecret(env: NodeJS.ProcessEnv = process.env): string {
  // El secreto de sesión ya es obligatorio para autenticación y tiene el
  // tamaño requerido. Cada uso se separa criptográficamente por dominio.
  const secret = env.CONCILIA_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new PilotRateLimitUnavailableError();
  return secret;
}

export function opaquePilotRateLimitKey(domain: "email" | "ip" | "token", value: string, env: NodeJS.ProcessEnv = process.env): string {
  return createHmac("sha256", rateLimitSecret(env)).update(`concilia:pilot-rate-limit:v1:${domain}:${value}`).digest("hex");
}

function advisoryLockId(scope: PilotAccessRateLimitScope, subjectKey: string): bigint {
  const hex = createHmac("sha256", "concilia-pilot-rate-limit-advisory-v1").update(`${scope}:${subjectKey}`).digest("hex").slice(0, 16);
  const unsigned = BigInt(`0x${hex}`);
  const signedMax = BigInt("0x7fffffffffffffff");
  const modulus = BigInt("0x10000000000000000");
  return unsigned > signedMax ? unsigned - modulus : unsigned;
}

function subjectsFor(input: { action: "issue"; email: string; ip: string } | { action: "consume"; token: string; ip: string }, env: NodeJS.ProcessEnv): Subject[] {
  if (input.action === "issue") return [
    { scope: "ISSUE_EMAIL", subjectKey: opaquePilotRateLimitKey("email", input.email.trim().toLowerCase(), env), limit: PILOT_RATE_LIMITS.issueEmail },
    { scope: "ISSUE_IP", subjectKey: opaquePilotRateLimitKey("ip", input.ip, env), limit: PILOT_RATE_LIMITS.issueIp },
  ];
  return [
    { scope: "CONSUME_TOKEN", subjectKey: opaquePilotRateLimitKey("token", input.token, env), limit: PILOT_RATE_LIMITS.consumeToken },
    { scope: "CONSUME_IP", subjectKey: opaquePilotRateLimitKey("ip", input.ip, env), limit: PILOT_RATE_LIMITS.consumeIp },
  ];
}

/** Vercel sobrescribe esta cabecera con la IP pública del cliente. Fuera de
 * Vercel no se acepta una cabecera elegida por el cliente: se falla cerrado. */
export function trustedVercelClientIp(headers: Headers, env: NodeJS.ProcessEnv = process.env): string {
  if (env.VERCEL !== "1") throw new PilotRateLimitUnavailableError();
  const ip = headers.get("x-vercel-forwarded-for")?.trim();
  if (!ip || ip.includes(",") || isIP(ip) === 0) throw new PilotRateLimitUnavailableError();
  return ip;
}

/** Cuenta y registra bajo advisory locks ordenados en la misma transacción.
 * Ninguna solicitud concurrente puede atravesar el límite entre el count y
 * el insert; ante contención se rechaza de inmediato (no espera ni llega a
 * P2028). Las filas se mantienen append-only. */
export async function enforcePilotRateLimit(
  input: { action: "issue"; email: string; ip: string } | { action: "consume"; token: string; ip: string },
  now = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<PilotRateLimitResult> {
  const subjects = subjectsFor(input, env);
  const windowStart = new Date(now.getTime() - PILOT_RATE_LIMIT_WINDOW_MS);
  try {
    return await prisma.$transaction(async (tx) => {
      for (const lockId of subjects.map((subject) => advisoryLockId(subject.scope, subject.subjectKey)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
        // No esperamos locks: en serverless, una cola de transacciones puede
        // exceder el timeout de Prisma. El rechazo inmediato es seguro y el
        // cliente recibe un Retry-After corto sin efecto lateral.
        const lock = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(${lockId}) AS acquired`;
        if (!lock[0]?.acquired) return { allowed: false, retryAfterSeconds: 1 };
      }

      const counts = await Promise.all(subjects.map(async (subject) => ({
        subject,
        count: await tx.pilotAccessRateLimitEvent.count({ where: { scope: subject.scope, subjectKey: subject.subjectKey, createdAt: { gte: windowStart } } }),
        earliest: await tx.pilotAccessRateLimitEvent.findFirst({ where: { scope: subject.scope, subjectKey: subject.subjectKey, createdAt: { gte: windowStart } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      })));
      const exceeded = counts.find(({ subject, count }) => count >= subject.limit);
      if (exceeded) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((exceeded.earliest!.createdAt.getTime() + PILOT_RATE_LIMIT_WINDOW_MS - now.getTime()) / 1000)) };

      await tx.pilotAccessRateLimitEvent.createMany({ data: subjects.map(({ scope, subjectKey }) => ({ scope, subjectKey, createdAt: now })) });
      return { allowed: true };
    });
  } catch (error) {
    if (error instanceof PilotRateLimitUnavailableError) throw error;
    throw new PilotRateLimitUnavailableError();
  }
}
