import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const env = { CONCILIA_SESSION_SECRET: "f".repeat(32), VERCEL: "1" } as unknown as NodeJS.ProcessEnv;
let keys: string[] = [];
let rateLimit: typeof import("../../src/lib/auth/pilot-rate-limit");
let fixturePrisma: typeof import("../../src/lib/prisma").prisma;

beforeAll(async () => {
  cargarEntornoDeFixturesYVerificar();
  rateLimit = await import("../../src/lib/auth/pilot-rate-limit");
  fixturePrisma = (await import("../../src/lib/prisma")).prisma;
});

afterAll(async () => {
  if (keys.length > 0) await fixturePrisma.pilotAccessRateLimitEvent.deleteMany({ where: { subjectKey: { in: keys } } });
  await fixturePrisma.$disconnect();
});

describe("pilot rate limit against fixtures Postgres", () => {
  it("no permite superar el máximo bajo ocho solicitudes concurrentes", async () => {
    const email = `fixture-${randomBytes(16).toString("hex")}@concilia.test`;
    const ip = "203.0.113.251";
    keys = [rateLimit.opaquePilotRateLimitKey("email", email, env), rateLimit.opaquePilotRateLimitKey("ip", ip, env)];
    const results = await Promise.all(Array.from({ length: 8 }, () => rateLimit.enforcePilotRateLimit({ action: "issue", email, ip }, new Date(), env)));
    const permitted = results.filter((result) => result.allowed).length;
    expect(permitted).toBeGreaterThan(0);
    expect(permitted).toBeLessThanOrEqual(3);
    await expect(fixturePrisma.pilotAccessRateLimitEvent.count({ where: { subjectKey: { in: keys } } })).resolves.toBe(permitted * 2);
  });
});
