/* eslint-disable @typescript-eslint/no-explicit-any -- stateful Prisma test double mirrors delegate-shaped inputs */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, mockPrisma } = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string; paymentNoticeId: string; paymentTransactionId: string; status: string };
  const state = {
    notices: new Map<string, { id: string; organizationId: string | null; linkedPaymentTransactionId: string | null; status: string }>(),
    transactions: new Map<string, { id: string; organizationId: string | null }>(),
    memberships: new Set<string>(),
    assessments: new Map<string, { paymentTransactionId: string }>(),
    rows: [] as Row[],
  };
  const correlation = {
    async findUnique({ where }: any) {
      const key = where.paymentNoticeId_paymentTransactionId_status;
      return state.rows.find((row) => row.paymentNoticeId === key.paymentNoticeId && row.paymentTransactionId === key.paymentTransactionId && row.status === key.status) ?? null;
    },
    async findFirst({ where }: any) {
      return state.rows.find((row) => row.paymentNoticeId === where.paymentNoticeId && row.status === where.status) ?? null;
    },
    async findMany({ where }: any) {
      return state.rows.filter((row) => row.paymentNoticeId === where.paymentNoticeId && row.organizationId === where.organizationId);
    },
    async create({ data }: any) {
      const row = { id: `cor-${state.rows.length + 1}`, createdAt: new Date(), ...data } as Row;
      state.rows.push(row);
      return row;
    },
  };
  const tx = {
    paymentNotice: {
      async findUnique({ where }: any) { return state.notices.get(where.id) ?? null; },
      async update({ where, data }: any) {
        const notice = state.notices.get(where.id)!;
        Object.assign(notice, data);
        return notice;
      },
    },
    paymentTransaction: { async findUnique({ where }: any) { return state.transactions.get(where.id) ?? null; } },
    organizationAdministrator: {
      async findUnique({ where }: any) {
        const key = where.administratorId_organizationId;
        return state.memberships.has(`${key.administratorId}:${key.organizationId}`)
          ? { id: "membership", administrator: { deletedAt: null }, organization: { deletedAt: null, status: "ACTIVE" } }
          : null;
      },
    },
    paymentEvidenceAssessmentLog: { async findUnique({ where }: any) { return state.assessments.get(where.id) ?? null; } },
    paymentEvidenceCorrelation: correlation,
  };
  return { state, mockPrisma: { ...tx, async $transaction(callback: any) { return callback(tx); } } };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const {
  PaymentEvidenceCorrelationAccessError,
  PaymentEvidenceCorrelationConflictError,
  confirmPaymentEvidenceCorrelation,
  proposePaymentEvidenceCorrelation,
  rejectPaymentEvidenceCorrelation,
} = await import("./correlation");

const baseInput = {
  administratorId: "admin-1",
  paymentNoticeId: "notice-1",
  paymentTransactionId: "payment-1",
  reason: "Referencia y monto revisados.",
  source: "HUMAN_REVIEW" as const,
  confidence: 87,
  evidenceAssessmentLogId: "assessment-1",
};

beforeEach(() => {
  state.notices.clear();
  state.transactions.clear();
  state.memberships.clear();
  state.assessments.clear();
  state.rows.length = 0;
  state.notices.set("notice-1", { id: "notice-1", organizationId: "org-1", linkedPaymentTransactionId: null, status: "RECEIVED" });
  state.transactions.set("payment-1", { id: "payment-1", organizationId: "org-1" });
  state.transactions.set("payment-2", { id: "payment-2", organizationId: "org-1" });
  state.memberships.add("admin-1:org-1");
  state.assessments.set("assessment-1", { paymentTransactionId: "payment-1" });
});

describe("durable payment evidence correlation", () => {
  it("confirma en el mismo tenant y actualiza la proyección del aviso", async () => {
    const result = await confirmPaymentEvidenceCorrelation(baseInput);
    expect(result).toMatchObject({ organizationId: "org-1", status: "CONFIRMED", source: "HUMAN_REVIEW", confidence: 87, decidedBy: "admin-1", evidenceAssessmentLogId: "assessment-1" });
    expect(state.notices.get("notice-1")).toMatchObject({ linkedPaymentTransactionId: "payment-1", status: "LINKED" });
  });

  it("es idempotente al repetir exactamente la misma confirmación", async () => {
    const first = await confirmPaymentEvidenceCorrelation(baseInput);
    const second = await confirmPaymentEvidenceCorrelation(baseInput);
    expect(second.id).toBe(first.id);
    expect(state.rows).toHaveLength(1);
  });

  it("no permite reemplazar una confirmación existente", async () => {
    await confirmPaymentEvidenceCorrelation(baseInput);
    await expect(confirmPaymentEvidenceCorrelation({ ...baseInput, paymentTransactionId: "payment-2", evidenceAssessmentLogId: null })).rejects.toBeInstanceOf(PaymentEvidenceCorrelationConflictError);
    expect(state.notices.get("notice-1")?.linkedPaymentTransactionId).toBe("payment-1");
  });

  it("admite múltiples candidatos propuestos y conserva rechazos", async () => {
    await proposePaymentEvidenceCorrelation(baseInput);
    await proposePaymentEvidenceCorrelation({ ...baseInput, paymentTransactionId: "payment-2", evidenceAssessmentLogId: null });
    await rejectPaymentEvidenceCorrelation(baseInput);
    expect(state.rows.map((row) => row.status)).toEqual(["PROPOSED", "PROPOSED", "REJECTED"]);
  });

  it("deniega sin filtrar existencia cuando falta recurso, tenant o membership", async () => {
    state.transactions.set("payment-1", { id: "payment-1", organizationId: "org-2" });
    await expect(confirmPaymentEvidenceCorrelation(baseInput)).rejects.toEqual(new PaymentEvidenceCorrelationAccessError());
    state.transactions.delete("payment-1");
    await expect(confirmPaymentEvidenceCorrelation(baseInput)).rejects.toEqual(new PaymentEvidenceCorrelationAccessError());
    state.transactions.set("payment-1", { id: "payment-1", organizationId: "org-1" });
    state.memberships.clear();
    await expect(confirmPaymentEvidenceCorrelation(baseInput)).rejects.toEqual(new PaymentEvidenceCorrelationAccessError());
  });

  it("rechaza provenance de una evaluación perteneciente a otro pago", async () => {
    state.assessments.set("assessment-1", { paymentTransactionId: "payment-2" });
    await expect(confirmPaymentEvidenceCorrelation(baseInput)).rejects.toBeInstanceOf(PaymentEvidenceCorrelationAccessError);
  });
});
