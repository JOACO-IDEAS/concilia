import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { scope: string; subjectKey: string; createdAt: Date };
const state = vi.hoisted(() => ({ rows: [] as Row[], fail: false, chain: Promise.resolve() as Promise<unknown>, transactionOptions: [] as Array<{ maxWait?: number }> }));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: vi.fn(async () => [{ acquired: true }]),
    pilotAccessRateLimitEvent: {
      count: vi.fn(async ({ where }: { where: { scope: string; subjectKey: string; createdAt: { gte: Date } } }) => state.rows.filter((row) => row.scope === where.scope && row.subjectKey === where.subjectKey && row.createdAt >= where.createdAt.gte).length),
      findFirst: vi.fn(async ({ where }: { where: { scope: string; subjectKey: string; createdAt: { gte: Date } } }) => state.rows.filter((row) => row.scope === where.scope && row.subjectKey === where.subjectKey && row.createdAt >= where.createdAt.gte).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => { state.rows.push(...data); return { count: data.length }; }),
    },
  };
  return { prisma: { $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>, options?: { maxWait?: number }) => {
    state.transactionOptions.push(options ?? {});
    const previous = state.chain;
    let release!: () => void;
    state.chain = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { if (state.fail) throw new Error("store unavailable"); return await fn(tx); } finally { release(); }
  }) } };
});

import { enforcePilotRateLimit, opaquePilotRateLimitKey, PILOT_RATE_LIMIT_TRANSACTION_MAX_WAIT_MS, PILOT_RATE_LIMIT_WINDOW_MS, trustedVercelClientIp } from "./pilot-rate-limit";

const env = { CONCILIA_SESSION_SECRET: "s".repeat(32), VERCEL: "1" } as unknown as NodeJS.ProcessEnv;
const now = new Date("2026-08-13T12:00:00.000Z");

beforeEach(() => { state.rows.length = 0; state.fail = false; state.chain = Promise.resolve(); state.transactionOptions.length = 0; vi.clearAllMocks(); });

describe("pilot durable rate limit", () => {
  it("permite solicitudes legítimas y bloquea el cuarto email normalizado con Retry-After determinista", async () => {
    for (let index = 0; index < 3; index++) expect(await enforcePilotRateLimit({ action: "issue", email: " Pilot@Concilia.Test ", ip: "203.0.113.10" }, now, env)).toEqual({ allowed: true });
    await expect(enforcePilotRateLimit({ action: "issue", email: "pilot@concilia.test", ip: "203.0.113.11" }, now, env)).resolves.toEqual({ allowed: false, retryAfterSeconds: PILOT_RATE_LIMIT_WINDOW_MS / 1000 });
    expect(state.rows).toHaveLength(6);
  });

  it("bloquea por IP aunque se roten emails y mantiene claves opacas separadas", async () => {
    for (let index = 0; index < 10; index++) await enforcePilotRateLimit({ action: "issue", email: `pilot${index}@concilia.test`, ip: "203.0.113.10" }, now, env);
    await expect(enforcePilotRateLimit({ action: "issue", email: "other@concilia.test", ip: "203.0.113.10" }, now, env)).resolves.toMatchObject({ allowed: false });
    expect(opaquePilotRateLimitKey("email", "pilot@concilia.test", env)).not.toBe(opaquePilotRateLimitKey("ip", "pilot@concilia.test", env));
    expect(opaquePilotRateLimitKey("token", "pilot@concilia.test", env)).not.toBe(opaquePilotRateLimitKey("email", "pilot@concilia.test", env));
    expect(state.rows.every((row) => !row.subjectKey.includes("pilot") && !row.subjectKey.includes("203.0.113.10"))).toBe(true);
  });

  it("protege intentos de token inválido sin tocar un token válido y no permite exceder el máximo bajo concurrencia", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => enforcePilotRateLimit({ action: "consume", token: "invalid-token", ip: "203.0.113.30" }, now, env)));
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(state.rows).toHaveLength(10);
    expect(state.transactionOptions).toHaveLength(8);
    expect(state.transactionOptions.every(({ maxWait }) => maxWait === PILOT_RATE_LIMIT_TRANSACTION_MAX_WAIT_MS)).toBe(true);
    expect(state.rows.every((row) => row.subjectKey !== "invalid-token")).toBe(true);
  });

  it("falla cerrado cuando Postgres no puede verificar el límite", async () => {
    state.fail = true;
    await expect(enforcePilotRateLimit({ action: "consume", token: "x", ip: "203.0.113.20" }, now, env)).rejects.toMatchObject({ name: "PilotRateLimitUnavailableError" });
  });

  it("acepta únicamente la IP entregada por Vercel y rechaza headers del cliente fuera de Vercel", () => {
    expect(trustedVercelClientIp(new Headers({ "x-vercel-forwarded-for": "2001:db8::1" }), env)).toBe("2001:db8::1");
    expect(() => trustedVercelClientIp(new Headers({ "x-vercel-forwarded-for": "203.0.113.1" }), { ...env, VERCEL: "0" })).toThrow(/protección/);
    expect(() => trustedVercelClientIp(new Headers({ "x-vercel-forwarded-for": "203.0.113.1, 203.0.113.2" }), env)).toThrow(/protección/);
  });
});
