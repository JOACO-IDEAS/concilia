import { beforeEach, describe, expect, it, vi } from "vitest";

type TokenRow = { administratorId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null; revokedAt: Date | null; administrator: { email: string; deletedAt: Date | null } };
const { rows, administrators } = vi.hoisted(() => ({ rows: [] as TokenRow[], administrators: new Map<string, { id: string; email: string; deletedAt: Date | null }>() }));

vi.mock("@/lib/prisma", () => ({ prisma: {
  administrator: { findFirst: vi.fn(async ({ where }: { where: { email: string; deletedAt: null } }) => [...administrators.values()].find((a) => a.email === where.email && a.deletedAt === null) ?? null) },
  pilotAccessToken: {
    create: vi.fn(async ({ data }: { data: Omit<TokenRow, "usedAt" | "revokedAt" | "administrator"> & { revokedAt?: Date | null } }) => { const admin = administrators.get(data.administratorId)!; rows.push({ ...data, usedAt: null, revokedAt: data.revokedAt ?? null, administrator: { email: admin.email, deletedAt: admin.deletedAt } }); }),
    updateMany: vi.fn(async ({ where, data }: { where: { tokenHash: string; usedAt: null; revokedAt: null | { not: null }; expiresAt: { gt: Date }; administrator?: { deletedAt: null } }; data: { usedAt?: Date; revokedAt?: null } }) => {
      const row = rows.find((candidate) => candidate.tokenHash === where.tokenHash && candidate.usedAt === null && (where.revokedAt === null ? candidate.revokedAt === null : candidate.revokedAt !== null) && candidate.expiresAt > where.expiresAt.gt && (!where.administrator || candidate.administrator.deletedAt === null));
      if (!row) return { count: 0 }; if (data.usedAt) row.usedAt = data.usedAt; if ("revokedAt" in data) row.revokedAt = data.revokedAt ?? null; return { count: 1 };
    }),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => { const row = rows.find((candidate) => candidate.tokenHash === where.tokenHash); return row ? { administrator: row.administrator } : null; }),
  },
} }));

import { MAGIC_LINK_TTL_MS, activatePilotMagicLink, consumePilotMagicLink, createRawMagicToken, hashMagicToken, issuePilotMagicLink, normalizeEmail } from "./magic-link";

beforeEach(() => { rows.length = 0; administrators.clear(); administrators.set("admin-a", { id: "admin-a", email: "pilot@concilia.test", deletedAt: null }); });

describe("magic links", () => {
  it("emite un secreto CSPRNG y persiste sólo su hash con TTL de 15 minutos", async () => {
    const before = Date.now(); const issued = await issuePilotMagicLink(" PILOT@CONCILIA.TEST "); const after = Date.now();
    expect(issued?.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(issued?.token).not.toBe(rows[0].tokenHash);
    expect(rows[0]).toMatchObject({ administratorId: "admin-a", tokenHash: hashMagicToken(issued!.token), usedAt: null, revokedAt: null });
    expect(rows[0].expiresAt.getTime()).toBeGreaterThanOrEqual(before + MAGIC_LINK_TTL_MS);
    expect(rows[0].expiresAt.getTime()).toBeLessThanOrEqual(after + MAGIC_LINK_TTL_MS);
  });

  it("no emite token para email desconocido ni administrador eliminado", async () => {
    await expect(issuePilotMagicLink("unknown@concilia.test")).resolves.toBeNull();
    administrators.get("admin-a")!.deletedAt = new Date();
    await expect(issuePilotMagicLink("pilot@concilia.test")).resolves.toBeNull();
    expect(rows).toEqual([]);
  });

  it("consume un token válido una sola vez", async () => {
    const issued = await issuePilotMagicLink("pilot@concilia.test");
    await expect(consumePilotMagicLink(issued!.token)).resolves.toBe("pilot@concilia.test");
    expect(rows[0].usedAt).toBeInstanceOf(Date);
    await expect(consumePilotMagicLink(issued!.token)).resolves.toBeNull();
  });

  it("deniega token vencido, revocado o manipulado sin marcarlo usado", async () => {
    const issued = await issuePilotMagicLink("pilot@concilia.test");
    rows[0].expiresAt = new Date(Date.now() - 1);
    await expect(consumePilotMagicLink(issued!.token)).resolves.toBeNull();
    expect(rows[0].usedAt).toBeNull();
    rows[0].expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS); rows[0].revokedAt = new Date();
    await expect(consumePilotMagicLink(issued!.token)).resolves.toBeNull();
    await expect(consumePilotMagicLink(`${issued!.token}x`)).resolves.toBeNull();
  });

  it("dos consumos concurrentes del mismo token producen exactamente un éxito", async () => {
    const issued = await issuePilotMagicLink("pilot@concilia.test");
    const results = await Promise.all([consumePilotMagicLink(issued!.token), consumePilotMagicLink(issued!.token)]);
    expect(results.filter(Boolean)).toEqual(["pilot@concilia.test"]);
  });

  it("token resuelve sólo la identidad a la que fue emitido y normaliza email", async () => {
    administrators.set("admin-b", { id: "admin-b", email: "other@concilia.test", deletedAt: null });
    const issued = await issuePilotMagicLink("other@concilia.test");
    await expect(consumePilotMagicLink(issued!.token)).resolves.toBe("other@concilia.test");
    expect(normalizeEmail(" Other@Concilia.Test ")).toBe("other@concilia.test");
    expect(createRawMagicToken()).not.toBe(createRawMagicToken());
  });

  it("permite emitir revocado y sólo activarlo explícitamente después de aceptar el envío", async () => {
    const issued = await issuePilotMagicLink("pilot@concilia.test", { initiallyRevoked: true });
    expect(rows[0].revokedAt).toBeInstanceOf(Date);
    await expect(consumePilotMagicLink(issued!.token)).resolves.toBeNull();
    await expect(activatePilotMagicLink(issued!.token)).resolves.toBe(true);
    await expect(consumePilotMagicLink(issued!.token)).resolves.toBe("pilot@concilia.test");
  });
});
