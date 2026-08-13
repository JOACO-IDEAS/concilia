import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 5.6 — primera suite de tests para reconcile-payment.ts (0 tests hasta
// esta fase, hallazgo de FASE_5_5_AUDITORIA_AUTO.md). El fake `tx` expone
// DELIBERADAMENTE solo `organization` y `billingProfile` — ningún otro
// delegate (`reconciliationMatch`, `obligation`, `unit`, `unitOwner`, ...)
// existe en el objeto. Si `reconcilePayment` alguna vez intentara tocar
// cualquiera de esas tablas, el test fallaría en runtime (propiedad
// undefined) — no por una aserción de "no se llamó", sino porque la
// capacidad de llamarlas no existe en absoluto. Es la forma más fuerte de
// probar "RESOLVER ORGANIZATION ≠ RECONCILIAR PAYMENT" a nivel de test.

const { mockOrganization, mockBillingProfile } = vi.hoisted(() => ({
  mockOrganization: { findUnique: vi.fn() },
  mockBillingProfile: { findFirst: vi.fn() },
}));

const { reconcilePayment } = await import("./reconcile-payment");

const tx = {
  organization: mockOrganization,
  billingProfile: mockBillingProfile,
} as unknown as Parameters<typeof reconcilePayment>[1];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcilePayment — resuelve ORGANIZACIÓN, nunca UF/obligación/conciliación contable", () => {
  it("CUIT exacto → organización correcta, corta antes de consultar CBU", async () => {
    mockOrganization.findUnique.mockResolvedValue({ id: "org-1" });

    const r = await reconcilePayment("20-11111111-2", tx);

    expect(r).toEqual({
      status: "MATCHED",
      organizationId: "org-1",
      motivo: expect.stringContaining("CUIT/RUT"),
    });
    expect(mockOrganization.findUnique).toHaveBeenCalledWith({
      where: { taxId: "20-11111111-2" },
      select: { id: true },
    });
    // Ganó CUIT — ni siquiera se consulta BillingProfile.
    expect(mockBillingProfile.findFirst).not.toHaveBeenCalled();
  });

  it("CBU exacto → organización correcta, cuando no hubo match por CUIT", async () => {
    mockOrganization.findUnique.mockResolvedValue(null);
    mockBillingProfile.findFirst.mockResolvedValue({ organizationId: "org-2" });

    const r = await reconcilePayment("0000003100000000000001", tx);

    expect(r).toEqual({
      status: "MATCHED",
      organizationId: "org-2",
      motivo: expect.stringContaining("CBU/Alias"),
    });
    expect(mockBillingProfile.findFirst).toHaveBeenCalledWith({
      where: { bankAccountNumber: "0000003100000000000001" },
      select: { organizationId: true },
    });
  });

  it("CUIT inexistente y sin CBU coincidente → UNMATCHED", async () => {
    mockOrganization.findUnique.mockResolvedValue(null);
    mockBillingProfile.findFirst.mockResolvedValue(null);

    const r = await reconcilePayment("20-99999999-9", tx);

    expect(r.status).toBe("UNMATCHED");
    expect(r.organizationId).toBeNull();
  });

  it("CBU inexistente (mismo camino que 'sin coincidencia') → UNMATCHED con motivo explícito", async () => {
    mockOrganization.findUnique.mockResolvedValue(null);
    mockBillingProfile.findFirst.mockResolvedValue(null);

    const r = await reconcilePayment("cbu-que-no-existe", tx);

    expect(r.status).toBe("UNMATCHED");
    expect(r.motivo).toContain("cbu-que-no-existe");
  });

  it("payerIdentifier null/vacío → UNMATCHED inmediato, nunca consulta la base", async () => {
    const r = await reconcilePayment(null, tx);

    expect(r).toEqual({
      status: "UNMATCHED",
      organizationId: null,
      motivo: expect.any(String),
    });
    expect(mockOrganization.findUnique).not.toHaveBeenCalled();
    expect(mockBillingProfile.findFirst).not.toHaveBeenCalled();
  });

  it("CBU ambiguo/duplicado — findFirst no distingue, devuelve UNA organización sin señalar el conflicto (comportamiento actual, documentado, no corregido esta fase)", async () => {
    // Simula lo que Prisma haría con dos BillingProfile de organizaciones
    // distintas compartiendo bankAccountNumber (posible hoy: sin @@unique
    // en el schema, ver FASE_5_6_INFORME_FINAL.md — auditoría de datos
    // reales). findFirst en Prisma real devolvería una sola fila; acá se
    // fuerza ese mismo contrato en el mock.
    mockOrganization.findUnique.mockResolvedValue(null);
    mockBillingProfile.findFirst.mockResolvedValue({ organizationId: "org-3" });

    const r = await reconcilePayment("cbu-compartido", tx);

    // El resultado es MATCHED "exitoso" — la función NO tiene ninguna forma
    // de saber ni de reportar que ese CBU pertenece a más de una
    // organización. No hay campo de ambigüedad en ResultadoReconciliacion.
    expect(r.status).toBe("MATCHED");
    expect(r.organizationId).toBe("org-3");
    expect(Object.keys(r)).toEqual(["status", "organizationId", "motivo"]);
  });

  it("conflicto CUIT vs. CBU: si el mismo payerIdentifier matchea ambos, gana CUIT por precedencia de código — el CBU nunca llega a evaluarse, no hay detección de conflicto", async () => {
    mockOrganization.findUnique.mockResolvedValue({ id: "org-por-cuit" });
    mockBillingProfile.findFirst.mockResolvedValue({ organizationId: "org-por-cbu-distinta" });

    const r = await reconcilePayment("20-mismo-string-ambos", tx);

    expect(r.organizationId).toBe("org-por-cuit");
    expect(mockBillingProfile.findFirst).not.toHaveBeenCalled();
  });

  it("idempotencia: la misma llamada dos veces devuelve exactamente el mismo resultado (función pura, sin estado ni escritura)", async () => {
    mockOrganization.findUnique.mockResolvedValue({ id: "org-1" });

    const r1 = await reconcilePayment("20-11111111-2", tx);
    const r2 = await reconcilePayment("20-11111111-2", tx);

    expect(r1).toEqual(r2);
    // La idempotencia de la ESCRITURA real (PaymentTransaction.externalId
    // @unique) es responsabilidad del llamador/schema, no de esta función
    // — reconcilePayment nunca escribe nada, así que no puede violarla.
  });

  it("organización resuelta pero SIN NINGUNA información de unidad/obligación en el resultado — RESOLVER ORGANIZATION ≠ RECONCILIAR PAYMENT", async () => {
    mockOrganization.findUnique.mockResolvedValue({ id: "org-1" });

    const r = await reconcilePayment("20-11111111-2", tx);

    // El tipo ResultadoReconciliacion no tiene, y esta aserción lo confirma
    // en runtime, ningún campo de unidad/obligación/conciliación.
    expect(r).not.toHaveProperty("unitId");
    expect(r).not.toHaveProperty("obligationId");
    expect(r).not.toHaveProperty("reconciliationMatchId");
    expect(Object.keys(r).sort()).toEqual(["motivo", "organizationId", "status"]);
  });

  it("nunca toca ReconciliationMatch/Obligation/Unit — el fake tx no expone esos delegates, así que cualquier intento explotaría en runtime", async () => {
    mockOrganization.findUnique.mockResolvedValue({ id: "org-1" });

    // Si reconcilePayment alguna vez llamara tx.reconciliationMatch.create(...)
    // o tx.obligation.update(...), esto lanzaría "Cannot read properties of
    // undefined" ANTES de llegar al expect — la ausencia de esos delegates
    // en el fake es la prueba, no una aserción posterior.
    await expect(reconcilePayment("20-11111111-2", tx)).resolves.toBeDefined();
  });
});
