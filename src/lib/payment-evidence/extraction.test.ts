import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), intake: vi.fn(), createRun: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { deduplicateFacts, extractPaymentEvidence, factsFromText, PaymentEvidenceExtractionAccessError } from "./extraction";

const base = {
  administratorId: "admin-a",
  organizationId: "org-a",
  intakeId: "intake-a",
  extractedAt: new Date("2026-08-21T20:00:00Z"),
  payload: { kind: "STRUCTURED" as const, facts: {
    amount: { value: "$210.000", currency: "ARS" },
    date: { value: "21/08/2026", role: "OPERATION" as const },
    operationReference: " op 839271 ",
    bankName: "Banco Galicia",
    payerDisplayName: "Martín García",
    accountIdentifier: { type: "CBU" as const, value: "2850590940090418135201" },
    transferReference: "Expensas agosto",
  } },
};

describe("extractPaymentEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membership.mockResolvedValue({ administrator: { deletedAt: null }, organization: { deletedAt: null, status: "ACTIVE" } });
    mocks.intake.mockResolvedValue({ id: "intake-a", evidenceType: "STRUCTURED_DATA" });
    mocks.createRun.mockResolvedValue({ id: "run-a" });
    mocks.transaction.mockImplementation((callback) => callback({
      organizationAdministrator: { findUnique: mocks.membership },
      paymentEvidenceIntake: { findFirst: mocks.intake },
      paymentEvidenceExtractionRun: { create: mocks.createRun },
    }));
  });

  it("persists normalized structured facts without business inferences", async () => {
    const result = await extractPaymentEvidence(base);
    expect(result).toMatchObject({ status: "SUCCEEDED", runId: "run-a", facts: expect.arrayContaining([
      { type: "AMOUNT", numericValue: 210000, currency: "ARS" },
      { type: "OPERATION_REFERENCE", normalizedValue: "OP 839271" },
      { type: "PAYER_DISPLAY_NAME", normalizedValue: "Martín García" },
    ]) });
    const data = mocks.createRun.mock.calls[0][0].data;
    for (const forbidden of ["unitId", "payerId", "obligationId", "paymentTransactionId", "requiresConfirmation", "decisionScore", "autoReconciled"]) expect(JSON.stringify(data)).not.toContain(forbidden);
  });

  it("never persists a complete sensitive account identifier", async () => {
    await extractPaymentEvidence(base);
    const serialized = JSON.stringify(mocks.createRun.mock.calls[0][0].data);
    expect(serialized).not.toContain("2850590940090418135201");
    expect(serialized).toContain("••••5201");
  });

  it("extracts deterministic facts from safe text", async () => {
    mocks.intake.mockResolvedValue({ id: "intake-a", evidenceType: "TEXT" });
    const text = "Transferencia realizada\nImporte: $210.000\nFecha: 21/08/2026\nOperación: 839271\nBanco Galicia\nOrdenante: Martín García\nReferencia: Expensas agosto";
    const result = await extractPaymentEvidence({ ...base, payload: { kind: "TEXT", text } });
    expect(result.status).toBe("SUCCEEDED");
    expect(result.facts.map((fact) => fact.type)).toEqual(["AMOUNT", "DATE", "OPERATION_REFERENCE", "BANK_NAME", "PAYER_DISPLAY_NAME", "TRANSFER_REFERENCE"]);
  });

  it.each(["PDF", "IMAGE"])("reports %s as unsupported without pretending OCR", async (evidenceType) => {
    mocks.intake.mockResolvedValue({ id: "intake-a", evidenceType });
    await expect(extractPaymentEvidence({ ...base, payload: { kind: "NONE" } })).resolves.toMatchObject({ status: "UNSUPPORTED", facts: [], errorCode: "EXTRACTION_NOT_AVAILABLE" });
  });

  it("records a safe failed run and leaves the intake untouched", async () => {
    const result = await extractPaymentEvidence({ ...base, payload: { kind: "STRUCTURED", facts: { amount: { value: "not-money" } } } });
    expect(result).toMatchObject({ status: "FAILED", facts: [], errorCode: "INVALID_INPUT" });
    expect(mocks.intake).toHaveBeenCalledTimes(1);
    expect(mocks.createRun).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", facts: undefined }) }));
  });

  it("fails safely for provider-controlled enum values", async () => {
    const unsafe = { ...base, payload: { kind: "STRUCTURED" as const, facts: { accountIdentifier: { type: "BANK_PASSWORD", value: "secret" } } } };
    await expect(extractPaymentEvidence(unsafe as typeof base)).resolves.toMatchObject({ status: "FAILED", errorCode: "INVALID_INPUT", facts: [] });
  });

  it.each([
    [null, "missing membership"],
    [{ administrator: { deletedAt: new Date() }, organization: { deletedAt: null, status: "ACTIVE" } }, "inactive administrator"],
    [{ administrator: { deletedAt: null }, organization: { deletedAt: null, status: "SUSPENDED" } }, "inactive organization"],
  ])("fails closed for %s (%s)", async (membership, label) => {
    void label; mocks.membership.mockResolvedValueOnce(membership);
    await expect(extractPaymentEvidence(base)).rejects.toBeInstanceOf(PaymentEvidenceExtractionAccessError);
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("rejects a cross-tenant intake", async () => {
    mocks.intake.mockResolvedValueOnce(null);
    await expect(extractPaymentEvidence(base)).rejects.toBeInstanceOf(PaymentEvidenceExtractionAccessError);
    expect(mocks.intake).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "intake-a", organizationId: "org-a" } }));
  });

  it("uses only access, intake and extraction-run delegates", async () => {
    await extractPaymentEvidence(base);
    expect(mocks.membership).toHaveBeenCalledOnce(); expect(mocks.intake).toHaveBeenCalledOnce(); expect(mocks.createRun).toHaveBeenCalledOnce();
  });

  it("does not log raw PII on failures", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "persona@example.com-CUIT-20-12345678-9";
    const result = await extractPaymentEvidence({ ...base, payload: { kind: "STRUCTURED", facts: { amount: { value: secret } } } });
    expect(result.errorCode).toBe("INVALID_INPUT"); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    log.mockRestore(); error.mockRestore();
  });
});

describe("fact semantics", () => {
  it("deduplicates only identical normalized facts", () => {
    const fact = { type: "BANK_NAME" as const, normalizedValue: "Banco Galicia" };
    expect(deduplicateFacts([fact, fact, { ...fact, normalizedValue: "Banco Nación" }])).toHaveLength(2);
  });

  it("payer display names remain facts and text parsing creates no identity", () => {
    const facts = factsFromText("Ordenante: Martín García\nImporte: 210000");
    expect(facts).toContainEqual({ type: "PAYER_DISPLAY_NAME", normalizedValue: "Martín García" });
    expect(JSON.stringify(facts)).not.toMatch(/payerId|unitId|paymentTransactionId/);
  });
});
