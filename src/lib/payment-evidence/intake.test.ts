import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import {
  PaymentEvidenceIntakeAccessError,
  PaymentEvidenceIntakeValidationError,
  registerPaymentEvidence,
  type RegisterPaymentEvidenceInput,
} from "./intake";

const now = new Date("2026-08-21T18:00:00.000Z");
const base: RegisterPaymentEvidenceInput = {
  administratorId: "admin-a",
  organizationId: "org-a",
  source: "WEB_UPLOAD",
  evidenceType: "PDF",
  receivedAt: now,
  externalReference: "upload-1",
  storageReference: "evidence/org-a/object-1",
  declaredMimeType: "application/pdf",
};

function row(input = base, id = "intake-1") {
  return { id, organizationId: input.organizationId, source: input.source, evidenceType: input.evidenceType, state: "RECEIVED", receivedAt: input.receivedAt };
}

describe("registerPaymentEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membership.mockResolvedValue({ administrator: { deletedAt: null }, organization: { deletedAt: null, status: "ACTIVE" } });
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockImplementation(async ({ data }) => row({ ...base, ...data }));
    mocks.transaction.mockImplementation(async (callback) => callback({
      organizationAdministrator: { findUnique: mocks.membership },
      paymentEvidenceIntake: { findUnique: mocks.findUnique, create: mocks.create },
    }));
  });

  it("registers valid web-upload evidence with receipt-only fields", async () => {
    await expect(registerPaymentEvidence(base)).resolves.toMatchObject({ status: "CREATED", idempotency: "EXTERNAL_REFERENCE", intake: { state: "RECEIVED" } });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ organizationId: "org-a", source: "WEB_UPLOAD", evidenceType: "PDF" }));
    for (const forbidden of ["unitId", "obligationId", "payerId", "paymentTransactionId", "rawEvidence", "extractedText", "autoReconciled"]) expect(data).not.toHaveProperty(forbidden);
  });

  it.each(["WHATSAPP", "EMAIL", "API"] as const)("accepts a %s-shaped adapter through the same core contract", async (source) => {
    await expect(registerPaymentEvidence({ ...base, source, externalReference: `${source}-opaque` })).resolves.toMatchObject({ status: "CREATED", intake: { source } });
  });

  it("returns the existing intake for duplicate tenant/source/external reference", async () => {
    mocks.findUnique.mockResolvedValueOnce(row());
    await expect(registerPaymentEvidence(base)).resolves.toMatchObject({ status: "ALREADY_RECEIVED", intake: { id: "intake-1" } });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("scopes the same external reference independently by organization", async () => {
    await registerPaymentEvidence(base);
    await registerPaymentEvidence({ ...base, organizationId: "org-b" });
    expect(mocks.findUnique.mock.calls.map(([arg]) => arg.where.organizationId_source_externalReference.organizationId)).toEqual(["org-a", "org-b"]);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it.each([
    [null, "missing membership"],
    [{ administrator: { deletedAt: new Date() }, organization: { deletedAt: null, status: "ACTIVE" } }, "inactive administrator"],
    [{ administrator: { deletedAt: null }, organization: { deletedAt: new Date(), status: "ACTIVE" } }, "deleted organization"],
    [{ administrator: { deletedAt: null }, organization: { deletedAt: null, status: "SUSPENDED" } }, "inactive organization"],
  ])("fails closed for %s (%s)", async (membership, _label) => {
    void _label;
    mocks.membership.mockResolvedValueOnce(membership);
    await expect(registerPaymentEvidence(base)).rejects.toBeInstanceOf(PaymentEvidenceIntakeAccessError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("checks the requested tenant membership and accepts no related-resource tenant IDs", async () => {
    await registerPaymentEvidence({ ...base, organizationId: "org-b" });
    expect(mocks.membership).toHaveBeenCalledWith(expect.objectContaining({ where: { administratorId_organizationId: { administratorId: "admin-a", organizationId: "org-b" } } }));
    expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty("relatedResourceId");
  });

  it.each([
    [{ externalReference: null, storageReference: null }, "missing evidence reference"],
    [{ source: "UNKNOWN" }, "unknown source"],
    [{ evidenceType: "VIDEO" }, "unknown evidence type"],
    [{ storageReference: "https://signed.example/item?secret=x" }, "URL"],
    [{ storageReference: "org/../other/item" }, "path traversal"],
    [{ declaredMimeType: "not-a-mime" }, "invalid MIME"],
  ])("rejects unsafe metadata: %s (%s)", async (change, _label) => {
    void _label;
    await expect(registerPaymentEvidence({ ...base, ...change } as RegisterPaymentEvidenceInput)).rejects.toBeInstanceOf(PaymentEvidenceIntakeValidationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("treats storage references as opaque and makes no idempotency promise without an external reference", async () => {
    const input = { ...base, externalReference: null, storageReference: "opaque_storage_key_42" };
    await expect(registerPaymentEvidence(input)).resolves.toMatchObject({ status: "CREATED", idempotency: "NONE" });
    await registerPaymentEvidence(input);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("recovers an idempotency race without leaking provider data", async () => {
    mocks.create.mockRejectedValueOnce(Object.assign(new Error("sentinel-secret"), { code: "P2002" }));
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row());
    await expect(registerPaymentEvidence(base)).resolves.toMatchObject({ status: "ALREADY_RECEIVED" });
  });

  it("does not log PII and exposes only generic validation errors", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "persona@example.com-CUIT-20-12345678-9";
    const promise = registerPaymentEvidence({ ...base, storageReference: `https://example.test/${secret}`, externalReference: secret });
    await expect(promise).rejects.toMatchObject({ message: "La evidencia recibida no es válida." });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore(); error.mockRestore();
  });

  it("touches only access and intake persistence delegates", async () => {
    await registerPaymentEvidence(base);
    expect(mocks.membership).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
