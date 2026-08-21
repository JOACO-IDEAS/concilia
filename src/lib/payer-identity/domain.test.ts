/* eslint-disable @typescript-eslint/no-explicit-any -- delegate-shaped in-memory Prisma double */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, mockPrisma } = vi.hoisted(() => {
  const state = {
    memberships: new Set<string>(),
    payers: [] as any[],
    signals: [] as any[],
  };
  const tx = {
    organizationAdministrator: {
      async findUnique({ where }: any) {
        const key = where.administratorId_organizationId;
        return state.memberships.has(`${key.administratorId}:${key.organizationId}`)
          ? { administrator: { deletedAt: null }, organization: { deletedAt: null, status: "ACTIVE" } }
          : null;
      },
    },
    payer: {
      async create({ data }: any) {
        const row = { id: `payer-${state.payers.length + 1}`, status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(), ...data };
        state.payers.push(row);
        return row;
      },
      async findUnique({ where }: any) { return state.payers.find((row) => row.id === where.id) ?? null; },
    },
    payerIdentitySignal: {
      async findUnique({ where }: any) {
        const key = where.organizationId_type_normalizedFingerprint;
        return state.signals.find((row) => row.organizationId === key.organizationId && row.type === key.type && row.normalizedFingerprint === key.normalizedFingerprint) ?? null;
      },
      async create({ data }: any) {
        const row = { id: `signal-${state.signals.length + 1}`, createdAt: new Date(), ...data };
        state.signals.push(row);
        return row;
      },
    },
  };
  return { state, mockPrisma: { ...tx, async $transaction(callback: any) { return callback(tx); } } };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { PayerIdentityAccessError, PayerIdentityConflictError, createPayer, getPayer, registerPayerIdentitySignal } = await import("./domain");

const provenance = { source: "HUMAN_REVIEW" as const, reason: "Identidad registrada por revisión explícita." };

beforeEach(() => {
  state.memberships.clear();
  state.payers.length = 0;
  state.signals.length = 0;
  state.memberships.add("admin-1:org-1");
});

describe("payer identity domain", () => {
  it("crea un pagador independiente de owners, occupants y units", async () => {
    const payer = await createPayer({ administratorId: "admin-1", organizationId: "org-1", displayName: "Pagador tercero", ...provenance });
    expect(payer).toMatchObject({ organizationId: "org-1", displayName: "Pagador tercero", status: "ACTIVE", createdBy: "admin-1" });
    expect(payer).not.toHaveProperty("unitId");
    expect(payer).not.toHaveProperty("unitOwnerId");
  });

  it("representa identidad desconocida con una señal nullable, sin crear payer ficticio", async () => {
    const signal = await registerPayerIdentitySignal({ administratorId: "admin-1", organizationId: "org-1", payerId: null, type: "PHONE", value: "+54 9 11 5555-1234", ...provenance });
    expect(signal.payerId).toBeNull();
    expect(state.payers).toHaveLength(0);
    expect(signal.maskedValue).toBe("••••1234");
    expect(JSON.stringify(signal)).not.toContain("5491155551234");
  });

  it("normaliza e idempotentiza una señal sin conservar PII raw", async () => {
    const payer = await createPayer({ administratorId: "admin-1", organizationId: "org-1", ...provenance });
    const first = await registerPayerIdentitySignal({ administratorId: "admin-1", organizationId: "org-1", payerId: payer.id, type: "TAX_ID", value: "20-12345678-9", ...provenance });
    const second = await registerPayerIdentitySignal({ administratorId: "admin-1", organizationId: "org-1", payerId: payer.id, type: "TAX_ID", value: "20123456789", ...provenance });
    expect(second.id).toBe(first.id);
    expect(state.signals).toHaveLength(1);
    expect(first).not.toHaveProperty("value");
  });

  it("impide asociar un payer o una señal entre tenants", async () => {
    const foreign = { id: "payer-foreign", organizationId: "org-2", status: "ACTIVE" };
    state.payers.push(foreign);
    await expect(registerPayerIdentitySignal({ administratorId: "admin-1", organizationId: "org-1", payerId: foreign.id, type: "BANK_ALIAS", value: "alias.seguro", ...provenance })).rejects.toBeInstanceOf(PayerIdentityAccessError);
  });

  it("no permite leer un payer sin membership y usa un error opaco", async () => {
    const payer = await createPayer({ administratorId: "admin-1", organizationId: "org-1", ...provenance });
    state.memberships.clear();
    const attempt = getPayer("admin-2", payer.id);
    await expect(attempt).rejects.toBeInstanceOf(PayerIdentityAccessError);
    await expect(attempt).rejects.toThrow("Recurso no disponible.");
  });

  it("no reasigna silenciosamente una señal registrada a otra identidad", async () => {
    const one = await createPayer({ administratorId: "admin-1", organizationId: "org-1", ...provenance });
    const two = await createPayer({ administratorId: "admin-1", organizationId: "org-1", ...provenance });
    await registerPayerIdentitySignal({ administratorId: "admin-1", organizationId: "org-1", payerId: one.id, type: "EMAIL", value: "persona@example.com", ...provenance });
    await expect(registerPayerIdentitySignal({ administratorId: "admin-1", organizationId: "org-1", payerId: two.id, type: "EMAIL", value: "PERSONA@example.com", ...provenance })).rejects.toBeInstanceOf(PayerIdentityConflictError);
  });
});
