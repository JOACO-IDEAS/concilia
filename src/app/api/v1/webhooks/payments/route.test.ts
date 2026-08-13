import { beforeEach, describe, expect, it, vi } from "vitest";

// Caso #15 (Fase 3.4): el webhook de pagos también dispara el matching en
// modo sombra — mismo patrón `after()` no bloqueante que las notificaciones,
// ya probado en statement-actions.test.ts para la vía de extracto bancario.
const { mockPaymentTransaction, mockTransaction } = vi.hoisted(() => {
  const mockPaymentTransaction = {
    findUnique: vi.fn(),
    create: vi.fn(),
  };
  type Tx = { paymentTransaction: typeof mockPaymentTransaction };
  const tx: Tx = { paymentTransaction: mockPaymentTransaction };
  const mockTransaction = vi.fn((cb: (tx: Tx) => unknown) => cb(tx));
  return { mockPaymentTransaction, mockTransaction };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mockTransaction, paymentTransaction: mockPaymentTransaction },
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => void) => fn() };
});

const { mockVerificarFirmaWebhook } = vi.hoisted(() => ({
  mockVerificarFirmaWebhook: vi.fn().mockReturnValue({ ok: true }),
}));
vi.mock("@/lib/payments/verify-signature", () => ({
  verificarFirmaWebhook: mockVerificarFirmaWebhook,
}));

vi.mock("@/lib/payments/reconcile-payment", () => ({
  reconcilePayment: vi.fn().mockResolvedValue({ status: "UNMATCHED", organizationId: null, motivo: "" }),
}));

vi.mock("@/lib/notifications/send-payment-notifications", () => ({
  notificarPagoMatched: vi.fn().mockResolvedValue(undefined),
  notificarPagoUnmatched: vi.fn().mockResolvedValue(undefined),
}));

// Fase 5.9 — el webhook pasó a llamar a ejecutarEvaluacionSombraCompleta
// (evidence-score-runner.ts), que reemplaza a ejecutarMatchingEnSombra en
// este call site real (hace lo mismo + persiste evidence-score.ts, ver
// FASE_5_9_IMPLEMENTACION_FINAL.md).
const { mockEjecutarEvaluacionSombraCompleta } = vi.hoisted(() => ({
  mockEjecutarEvaluacionSombraCompleta: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/payment-evidence/evidence-score-runner", () => ({
  ejecutarEvaluacionSombraCompleta: mockEjecutarEvaluacionSombraCompleta,
}));

const { POST } = await import("./route");

function requestConBody(body: unknown) {
  const rawBody = JSON.stringify(body);
  return {
    text: async () => rawBody,
    headers: { get: () => null },
    nextUrl: { searchParams: { get: () => null } },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerificarFirmaWebhook.mockReturnValue({ ok: true });
  mockPaymentTransaction.findUnique.mockResolvedValue(null);
  mockPaymentTransaction.create.mockResolvedValue({ id: "pt-webhook-1" });
});

describe("POST /api/v1/webhooks/payments — dispara el matching en modo sombra (#15, Fase 3.4/5.9)", () => {
  it("un webhook válido y nuevo llama a ejecutarEvaluacionSombraCompleta con el id creado", async () => {
    const res = await POST(
      requestConBody({ transaction_id: "ext-1", amount: 145000, payer_tax_id: "20289900113" })
    );

    expect(res.status).toBe(200);
    expect(mockPaymentTransaction.create).toHaveBeenCalledTimes(1);
    expect(mockEjecutarEvaluacionSombraCompleta).toHaveBeenCalledTimes(1);
    expect(mockEjecutarEvaluacionSombraCompleta).toHaveBeenCalledWith("pt-webhook-1");
  });

  it("un webhook duplicado (transaction_id ya existente) NO dispara una segunda evaluación", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({ id: "pt-webhook-1", status: "UNMATCHED" });

    const res = await POST(requestConBody({ transaction_id: "ext-1", amount: 145000 }));

    expect(res.status).toBe(200);
    expect(mockPaymentTransaction.create).not.toHaveBeenCalled();
    expect(mockEjecutarEvaluacionSombraCompleta).not.toHaveBeenCalled();
  });

  it("un webhook rechazado por firma inválida NO dispara el matching", async () => {
    mockVerificarFirmaWebhook.mockReturnValue({ ok: false, motivo: "Firma inválida." });

    const res = await POST(requestConBody({ transaction_id: "ext-1", amount: 145000 }));

    expect(res.status).toBe(401);
    expect(mockEjecutarEvaluacionSombraCompleta).not.toHaveBeenCalled();
  });
});
