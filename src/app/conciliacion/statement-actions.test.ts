import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 3.2 — confirma que confirmarExtractoPDF persiste transactionDate y
// referenceNumber en PaymentTransaction.create, sin tocar Neon: Prisma y sus
// vecinos (notificaciones, revalidatePath, after) van mockeados.
const { mockPaymentTransaction, mockTransaction, mockPaymentFindMany, mockOrganizationFindUnique } = vi.hoisted(() => {
  const mockPaymentTransaction = {
    findUnique: vi.fn(),
    create: vi.fn(),
  };
  type Tx = { paymentTransaction: typeof mockPaymentTransaction };
  const tx: Tx = { paymentTransaction: mockPaymentTransaction };
  const mockTransaction = vi.fn((cb: (tx: Tx) => unknown) => cb(tx));
  return { mockPaymentTransaction, mockTransaction, mockPaymentFindMany: vi.fn(), mockOrganizationFindUnique: vi.fn() };
});
const { mockRequireCurrentAdministrator } = vi.hoisted(() => ({
  mockRequireCurrentAdministrator: vi.fn(),
}));
const { mockRequireOrganizationAccess, mockReconcilePayment } = vi.hoisted(() => ({
  mockRequireOrganizationAccess: vi.fn(),
  mockReconcilePayment: vi.fn(),
}));
const { mockParseStatementWithAI, mockConvertirATransaccionesPipeline, mockDetectarTipoArchivo, mockLimiteBytesPara } = vi.hoisted(() => ({
  mockParseStatementWithAI: vi.fn(),
  mockConvertirATransaccionesPipeline: vi.fn(),
  mockDetectarTipoArchivo: vi.fn(),
  mockLimiteBytesPara: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    paymentTransaction: { ...mockPaymentTransaction, findMany: mockPaymentFindMany },
    organization: { findUnique: mockOrganizationFindUnique },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: mockRequireCurrentAdministrator }));
vi.mock("@/lib/auth/organization-access", () => ({ requireOrganizationAccess: mockRequireOrganizationAccess }));
vi.mock("@/lib/payments/reconcile-payment", () => ({
  reconcilePayment: mockReconcilePayment,
}));
vi.mock("@/lib/statements/ai-parser", () => ({
  parseStatementWithAI: mockParseStatementWithAI,
  convertirATransaccionesPipeline: mockConvertirATransaccionesPipeline,
  detectarTipoArchivo: mockDetectarTipoArchivo,
  limiteBytesPara: mockLimiteBytesPara,
}));
vi.mock("@/lib/notifications/send-payment-notifications", () => ({
  notificarPagoMatched: vi.fn().mockResolvedValue(undefined),
  notificarPagoUnmatched: vi.fn().mockResolvedValue(undefined),
}));
// Fase 5.9 — reemplaza a ejecutarMatchingEnSombra en este call site real
// (ver FASE_5_9_IMPLEMENTACION_FINAL.md).
const { mockEjecutarEvaluacionSombraCompleta } = vi.hoisted(() => ({ mockEjecutarEvaluacionSombraCompleta: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/payment-evidence/evidence-score-runner", () => ({ ejecutarEvaluacionSombraCompleta: mockEjecutarEvaluacionSombraCompleta }));
const { mockAppendProductEventSafely } = vi.hoisted(() => ({ mockAppendProductEventSafely: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/product-observability/runtime", () => ({ appendProductEventSafely: mockAppendProductEventSafely }));

const { confirmarExtractoPDF, previsualizarExtractoPDF } = await import("./statement-actions");

function movimiento(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fecha: "2026-08-05",
    amount: 145000,
    concept: "Transferencia recibida",
    payerIdentifier: "20289900113",
    referenceNumber: "REF-998877",
    externalId: "ai:ref:ref-998877",
    lineaOriginal: "Transferencia recibida (ref: REF-998877)",
    ...overrides,
  };
}

function formConExtracto(): FormData {
  const form = new FormData();
  form.set("file", new File(["fecha,monto\n2026-08-05,145000"], "extracto.csv", { type: "text/csv" }));
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentAdministrator.mockResolvedValue({ id: "admin-a" });
  mockRequireOrganizationAccess.mockResolvedValue({ organizationId: "org-a" });
  mockReconcilePayment.mockResolvedValue({ status: "MATCHED", organizationId: "org-a", motivo: "" });
  mockPaymentTransaction.findUnique.mockResolvedValue(null);
  mockPaymentTransaction.create.mockResolvedValue({ id: "pt-1" });
  mockPaymentFindMany.mockResolvedValue([]);
  mockOrganizationFindUnique.mockResolvedValue({ id: "org-a", name: "Consorcio A" });
  mockDetectarTipoArchivo.mockReturnValue("csv");
  mockLimiteBytesPara.mockReturnValue(1024 * 1024);
  mockParseStatementWithAI.mockResolvedValue({ ok: true, bankName: "Banco Test", accountIdentifier: null, usedAI: false, transactions: [{}] });
  mockConvertirATransaccionesPipeline.mockReturnValue([{ ...movimiento(), esEgreso: false }]);
});

describe("acciones de extracto — autenticación", () => {
  it("rechaza una previsualización sin sesión antes de procesar el archivo", async () => {
    mockRequireCurrentAdministrator.mockRejectedValue(new Error("Autenticación requerida."));

    await expect(previsualizarExtractoPDF(new FormData())).rejects.toThrow("Autenticación requerida.");

    expect(mockPaymentTransaction.findUnique).not.toHaveBeenCalled();
    expect(mockParseStatementWithAI).not.toHaveBeenCalled();
  });

  it("rechaza una importación sin sesión antes de escribir movimientos", async () => {
    mockRequireCurrentAdministrator.mockRejectedValue(new Error("Autenticación requerida."));

    await expect(confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test")).rejects.toThrow("Autenticación requerida.");

    expect(mockPaymentTransaction.create).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe("previsualizarExtractoPDF — frontera de organización", () => {
  it("muestra una propuesta propia y permite continuar con el movimiento", async () => {
    const result = await previsualizarExtractoPDF(formConExtracto());

    expect(mockRequireOrganizationAccess).toHaveBeenCalledWith("org-a");
    expect(mockOrganizationFindUnique).toHaveBeenCalledWith({ where: { id: "org-a" }, select: { id: true, name: true } });
    expect(result.movimientos?.[0]).toMatchObject({ puedeImportarse: true, organizationPropuesta: { id: "org-a", name: "Consorcio A" } });
  });

  it("no revela la identidad de una organización ajena", async () => {
    mockReconcilePayment.mockResolvedValue({ status: "MATCHED", organizationId: "org-b", motivo: "" });
    mockRequireOrganizationAccess.mockRejectedValue(new Error("No tenés acceso a esta organización."));

    const result = await previsualizarExtractoPDF(formConExtracto());

    expect(mockOrganizationFindUnique).not.toHaveBeenCalled();
    expect(result.movimientos?.[0]).toMatchObject({ puedeImportarse: false, organizationPropuesta: null });
  });

  it("mantiene honesto el preview cuando no hay organización atribuible", async () => {
    mockReconcilePayment.mockResolvedValue({ status: "UNMATCHED", organizationId: null, motivo: "" });

    const result = await previsualizarExtractoPDF(formConExtracto());

    expect(mockRequireOrganizationAccess).not.toHaveBeenCalled();
    expect(result.movimientos?.[0]).toMatchObject({ puedeImportarse: false, organizationPropuesta: null });
  });
});

describe("confirmarExtractoPDF — preserva transactionDate y referenceNumber", () => {
  it("persiste transactionDate como Date real derivada de mov.fecha, sin reemplazar createdAt", async () => {
    await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");

    expect(mockPaymentTransaction.create).toHaveBeenCalledTimes(1);
    const data = mockPaymentTransaction.create.mock.calls[0][0].data;
    expect(data.transactionDate).toBeInstanceOf(Date);
    expect(data.transactionDate.toISOString().slice(0, 10)).toBe("2026-08-05");
    expect(data).not.toHaveProperty("createdAt"); // createdAt lo sigue poniendo Prisma (@default(now())), no esta acción
  });

  it("persiste referenceNumber tal cual viene del movimiento", async () => {
    await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");

    const data = mockPaymentTransaction.create.mock.calls[0][0].data;
    expect(data.referenceNumber).toBe("REF-998877");
  });

  it("un movimiento sin referencia persiste referenceNumber=null sin romper la importación", async () => {
    await confirmarExtractoPDF("extracto.pdf", [movimiento({ referenceNumber: null })], "Banco Test");

    expect(mockPaymentTransaction.create).toHaveBeenCalledTimes(1);
    const data = mockPaymentTransaction.create.mock.calls[0][0].data;
    expect(data.referenceNumber).toBeNull();
  });

  it("no rompe ni cambia los campos existentes del pipeline (amount, concept, payerIdentifier, rawPayload)", async () => {
    await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");

    const data = mockPaymentTransaction.create.mock.calls[0][0].data;
    expect(data.amount).toBe(145000);
    expect(data.concept).toBe("Transferencia recibida");
    expect(data.payerIdentifier).toBe("20289900113");
    expect(data.rawPayload).toEqual({
      source: "pdf_statement",
      fileName: "extracto.pdf",
      lineaOriginal: "Transferencia recibida (ref: REF-998877)",
    });
  });
});

describe("confirmarExtractoPDF — organización autorizada", () => {
  it("incorpora un movimiento cuando el motor lo atribuye a una organización propia", async () => {
    const result = await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");

    expect(mockRequireOrganizationAccess).toHaveBeenCalledWith("org-a");
    expect(mockPaymentTransaction.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, creados: 1, noAtribuibles: 0 });
  });

  it("no crea ni expone un movimiento atribuido a una organización ajena", async () => {
    mockReconcilePayment.mockResolvedValue({ status: "MATCHED", organizationId: "org-b", motivo: "" });
    mockRequireOrganizationAccess.mockRejectedValue(new Error("No tenés acceso a esta organización."));

    const result = await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");

    expect(mockRequireOrganizationAccess).toHaveBeenCalledWith("org-b");
    expect(mockPaymentTransaction.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, creados: 0, noAtribuibles: 1 });
    expect(result.errores[0]?.mensaje).toBe("El movimiento no se pudo atribuir a una organización disponible.");
  });

  it("mantiene fuera del flujo un movimiento sin organización atribuible", async () => {
    mockReconcilePayment.mockResolvedValue({ status: "UNMATCHED", organizationId: null, motivo: "" });

    const result = await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");

    expect(mockRequireOrganizationAccess).not.toHaveBeenCalled();
    expect(mockPaymentTransaction.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, creados: 0, noAtribuibles: 1 });
  });

  it("nunca crea recursos fuera del alcance aunque la importación reciba varias filas", async () => {
    mockReconcilePayment
      .mockResolvedValueOnce({ status: "MATCHED", organizationId: "org-a", motivo: "" })
      .mockResolvedValueOnce({ status: "MATCHED", organizationId: "org-b", motivo: "" });
    mockRequireOrganizationAccess.mockImplementation(async (organizationId: string) => {
      if (organizationId === "org-b") throw new Error("No tenés acceso a esta organización.");
      return { organizationId };
    });

    const result = await confirmarExtractoPDF("extracto.pdf", [movimiento(), movimiento({ externalId: "ai:ref:foreign" })], "Banco Test");

    expect(mockPaymentTransaction.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ creados: 1, noAtribuibles: 1 });
  });
});

describe("confirmarExtractoPDF — observabilidad de producto", () => {
  it("emite un único evento sólo después de una importación exitosa", async () => {
    await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");

    expect(mockAppendProductEventSafely).toHaveBeenCalledTimes(1);
    expect(mockAppendProductEventSafely).toHaveBeenCalledWith({
      administratorId: "admin-a",
      organizationId: "org-a",
      type: "STATEMENT_IMPORT_CONFIRMED",
      metadata: { createdCount: 1, duplicateCount: 0, unattributableCount: 0 },
    });
  });

  it("no emite un evento de éxito cuando la importación falla", async () => {
    mockReconcilePayment.mockResolvedValue({ status: "UNMATCHED", organizationId: null, motivo: "" });

    await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");

    expect(mockAppendProductEventSafely).not.toHaveBeenCalled();
  });
});

// Caso #16 (Fase 3.4): la importación bancaria también dispara el matching sombra.
describe("confirmarExtractoPDF — dispara el matching en modo sombra (#16, Fase 3.4/5.9)", () => {
  it("llama a ejecutarEvaluacionSombraCompleta por cada PaymentTransaction creada", async () => {
    await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");

    expect(mockEjecutarEvaluacionSombraCompleta).toHaveBeenCalledTimes(1);
    expect(mockEjecutarEvaluacionSombraCompleta).toHaveBeenCalledWith("pt-1");
  });

  it("un pago duplicado (ya existente) NO dispara una segunda evaluación", async () => {
    mockPaymentTransaction.findUnique.mockResolvedValue({ id: "pt-1" }); // ya existe
    const result = await confirmarExtractoPDF("extracto.pdf", [movimiento()], "Banco Test");
    expect(mockEjecutarEvaluacionSombraCompleta).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, creados: 0, duplicados: 1, noAtribuibles: 0 });
  });
});
