/* eslint-disable @typescript-eslint/no-explicit-any -- stateful Prisma delegate test double */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, mockPrisma } = vi.hoisted(() => {
  const state = {
    memberships: new Set<string>(),
    units: new Map<string, any>(),
    payers: new Map<string, any>(),
    signals: new Map<string, any>(),
    correlations: new Map<string, any>(),
    decisions: new Map<string, any>(),
    associations: [] as any[],
    events: [] as any[],
  };
  const tx = {
    organizationAdministrator: { async findUnique({ where }: any) { const key = where.administratorId_organizationId; return state.memberships.has(`${key.administratorId}:${key.organizationId}`) ? { administrator: { deletedAt: null }, organization: { deletedAt: null, status: "ACTIVE" } } : null; } },
    unit: { async findUnique({ where }: any) { return state.units.get(where.id) ?? null; } },
    payer: { async findUnique({ where }: any) { return state.payers.get(where.id) ?? null; } },
    payerIdentitySignal: { async findUnique({ where }: any) { return state.signals.get(where.id) ?? null; } },
    paymentEvidenceCorrelation: { async findUnique({ where }: any) { return state.correlations.get(where.id) ?? null; } },
    reconciliationMatch: { async findUnique({ where }: any) { return state.decisions.get(where.id) ?? null; } },
    payerUnitAssociation: {
      async findUnique({ where }: any) { return state.associations.find((row) => row.id === where.id) ?? null; },
      async findFirst({ where }: any) { return state.associations.find((row) => row.organizationId === where.organizationId && row.unitId === where.unitId && row.payerId === where.payerId && row.signalId === where.signalId) ?? null; },
      async findMany({ where }: any) { return state.associations.filter((row) => row.organizationId === where.organizationId && (!where.unitId || row.unitId === where.unitId) && (!where.signalId || row.signalId === where.signalId) && (!where.payerId || (where.payerId.not === null ? row.payerId !== null : row.payerId === where.payerId))); },
      async create({ data }: any) { const row = { id: `assoc-${state.associations.length + 1}`, status: "OBSERVED", observationCount: 0, supportCount: 0, contradictionCount: 0, createdAt: new Date(), updatedAt: new Date(), ...data }; state.associations.push(row); return row; },
      async update({ where, data }: any) { const row = state.associations.find((candidate) => candidate.id === where.id)!; for (const [key, value] of Object.entries(data)) { if (value && typeof value === "object" && "increment" in value) row[key] += (value as any).increment; else if (value !== undefined) row[key] = value; } return row; },
    },
    payerUnitEvidenceEvent: {
      async findUnique({ where }: any) { const key = where.organizationId_evidenceKey; return state.events.find((row) => row.organizationId === key.organizationId && row.evidenceKey === key.evidenceKey) ?? null; },
      async create({ data }: any) { const row = { id: `event-${state.events.length + 1}`, createdAt: new Date(), ...data }; state.events.push(row); return row; },
    },
  };
  return { state, mockPrisma: { ...tx, async $transaction(callback: any) { return callback(tx); } } };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { PayerUnitMemoryAccessError, listPayersForUnit, listUnitsForSignal, recordPayerUnitEvidence } = await import("./unit-memory");

const base = {
  administratorId: "admin-1",
  organizationId: "org-1",
  unitId: "unit-1",
  effect: "SUPPORT" as const,
  source: "SYSTEM_OBSERVATION" as const,
  reason: "Observación explícita para memoria histórica.",
  observedAt: new Date("2026-08-21T12:00:00Z"),
  externalEvidenceKey: "fixture-observation-1",
};

beforeEach(() => {
  state.memberships.clear(); state.units.clear(); state.payers.clear(); state.signals.clear(); state.correlations.clear(); state.decisions.clear(); state.associations.length = 0; state.events.length = 0;
  state.memberships.add("admin-1:org-1");
  state.units.set("unit-1", { id: "unit-1", organizationId: "org-1", deletedAt: null });
  state.units.set("unit-2", { id: "unit-2", organizationId: "org-1", deletedAt: null });
  state.payers.set("payer-1", { id: "payer-1", organizationId: "org-1", status: "ACTIVE" });
  state.payers.set("payer-2", { id: "payer-2", organizationId: "org-1", status: "ACTIVE" });
  state.signals.set("signal-1", { id: "signal-1", organizationId: "org-1", payerId: null, maskedValue: "••••1234" });
});

describe("payer-unit evidence memory", () => {
  it("registra evidencia payer ↔ unit", async () => {
    const result = await recordPayerUnitEvidence({ ...base, payerId: "payer-1" });
    expect(result.association).toMatchObject({ payerId: "payer-1", signalId: null, unitId: "unit-1", supportCount: 1, observationCount: 1 });
  });

  it("registra signal ↔ unit aunque la signal no tenga payer", async () => {
    const result = await recordPayerUnitEvidence({ ...base, signalId: "signal-1" });
    expect(result.association).toMatchObject({ signalId: "signal-1", payerId: null, unitId: "unit-1" });
  });

  it("soporta payer N:M unit y múltiples payers por unit", async () => {
    await recordPayerUnitEvidence({ ...base, payerId: "payer-1" });
    await recordPayerUnitEvidence({ ...base, payerId: "payer-1", unitId: "unit-2", externalEvidenceKey: "obs-2" });
    await recordPayerUnitEvidence({ ...base, payerId: "payer-2", externalEvidenceKey: "obs-3" });
    expect(state.associations).toHaveLength(3);
    expect(await listPayersForUnit("admin-1", "unit-1")).toHaveLength(2);
  });

  it("preserva una signal asociada a varias units como asociaciones separadas", async () => {
    await recordPayerUnitEvidence({ ...base, signalId: "signal-1" });
    await recordPayerUnitEvidence({ ...base, signalId: "signal-1", unitId: "unit-2", externalEvidenceKey: "obs-2" });
    expect(await listUnitsForSignal("admin-1", "signal-1")).toHaveLength(2);
  });

  it("es idempotente y no infla los contadores", async () => {
    const first = await recordPayerUnitEvidence({ ...base, payerId: "payer-1" });
    const duplicate = await recordPayerUnitEvidence({ ...base, payerId: "payer-1" });
    expect(duplicate.idempotent).toBe(true);
    expect(duplicate.event.id).toBe(first.event.id);
    expect(state.events).toHaveLength(1);
    expect(state.associations[0].supportCount).toBe(1);
  });

  it("conserva contradicción y revocación como eventos sin borrar soporte", async () => {
    await recordPayerUnitEvidence({ ...base, signalId: "signal-1" });
    await recordPayerUnitEvidence({ ...base, signalId: "signal-1", effect: "CONTRADICT", externalEvidenceKey: "contradiction-1" });
    await recordPayerUnitEvidence({ ...base, signalId: "signal-1", effect: "REVOKE", externalEvidenceKey: "revocation-1" });
    expect(state.events.map((row) => row.effect)).toEqual(["SUPPORT", "CONTRADICT", "REVOKE"]);
    expect(state.associations[0]).toMatchObject({ supportCount: 1, contradictionCount: 1, status: "REVOKED" });
  });

  it.each([
    ["payer", () => state.payers.set("payer-1", { id: "payer-1", organizationId: "org-2", status: "ACTIVE" }), { payerId: "payer-1" }],
    ["signal", () => state.signals.set("signal-1", { id: "signal-1", organizationId: "org-2" }), { signalId: "signal-1" }],
    ["unit", () => state.units.set("unit-1", { id: "unit-1", organizationId: "org-2", deletedAt: null }), { payerId: "payer-1" }],
  ])("bloquea recurso cross-tenant: %s", async (_label, mutate, subject) => {
    mutate();
    await expect(recordPayerUnitEvidence({ ...base, ...subject } as any)).rejects.toBeInstanceOf(PayerUnitMemoryAccessError);
  });

  it("rechaza provenance confirmada de otro contexto", async () => {
    state.correlations.set("cor-1", { id: "cor-1", organizationId: "org-2", status: "CONFIRMED", paymentTransaction: { organizationId: "org-2", unitId: "unit-1" } });
    await expect(recordPayerUnitEvidence({ ...base, payerId: "payer-1", source: "PAYMENT_CONFIRMED", paymentEvidenceCorrelationId: "cor-1", externalEvidenceKey: null })).rejects.toBeInstanceOf(PayerUnitMemoryAccessError);
  });

  it("conserva provenance exacta de una correlación confirmada válida", async () => {
    state.correlations.set("cor-1", { id: "cor-1", organizationId: "org-1", status: "CONFIRMED", paymentTransactionId: "payment-1", paymentTransaction: { organizationId: "org-1", unitId: "unit-1" } });
    const result = await recordPayerUnitEvidence({ ...base, payerId: "payer-1", source: "PAYMENT_CONFIRMED", paymentEvidenceCorrelationId: "cor-1", externalEvidenceKey: null, confidence: 91 });
    expect(result.event).toMatchObject({ paymentEvidenceCorrelationId: "cor-1", confidence: 91, source: "PAYMENT_CONFIRMED" });
  });

  it("no duplica PII en asociación ni evento", async () => {
    await recordPayerUnitEvidence({ ...base, signalId: "signal-1" });
    expect(JSON.stringify({ associations: state.associations, events: state.events })).not.toContain("1234");
  });
});
