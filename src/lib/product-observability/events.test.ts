import { describe, expect, it } from "vitest";
import { createProductEvent, type ProductEvent, type ProductEventStore } from "./events";

const fixedNow = new Date("2026-08-12T18:10:00.000Z");
const input = {
  administratorId: "admin-a",
  organizationId: "org-a",
  type: "STATEMENT_IMPORT_CONFIRMED" as const,
  metadata: { createdCount: 2, duplicateCount: 1, unattributableCount: 0 },
};

class InMemoryScopedStore implements ProductEventStore {
  private events: ProductEvent[] = [];

  async append(event: ProductEvent): Promise<void> {
    this.events.push(event);
  }

  async list(scope: { organizationId: string }): Promise<ProductEvent[]> {
    return this.events.filter((event) => event.organizationId === scope.organizationId);
  }
}

describe("product observability contract", () => {
  it("crea un evento con identidad, tiempo, actor, tenant y metadata mínima", () => {
    const event = createProductEvent(input, fixedNow, () => "event-1");

    expect(event).toEqual({ id: "event-1", timestamp: fixedNow.toISOString(), ...input });
  });

  it("mantiene el aislamiento al leer eventos por organización", async () => {
    const store = new InMemoryScopedStore();
    await store.append(createProductEvent(input, fixedNow, () => "event-a"));
    await store.append(createProductEvent({ ...input, organizationId: "org-b" }, fixedNow, () => "event-b"));

    await expect(store.list({ organizationId: "org-a" })).resolves.toEqual([expect.objectContaining({ id: "event-a", organizationId: "org-a" })]);
  });

  it("rechaza metadata sensible o no permitida", () => {
    expect(() => createProductEvent({ ...input, metadata: { createdCount: 1, duplicateCount: 0, unattributableCount: 0, concept: "Expensas de Ana" } as unknown as typeof input.metadata }, fixedNow)).toThrow("campos no permitidos");
  });

  it("rechaza eventos inválidos antes de que alcancen cualquier store", () => {
    expect(() => createProductEvent({ ...input, organizationId: "", metadata: { createdCount: -1, duplicateCount: 0, unattributableCount: 0 } }, fixedNow)).toThrow("organizationId es obligatorio");
    expect(() => createProductEvent({ ...input, type: "UNKNOWN" as never }, fixedNow)).toThrow("type no es un evento");
  });

  it("limita cada evento de caso al identificador interno del pago", () => {
    const event = createProductEvent({ administratorId: "admin-a", organizationId: "org-a", type: "CASE_APPROVED", metadata: { paymentTransactionId: "payment-a" } }, fixedNow, () => "event-case");
    expect(event.metadata).toEqual({ paymentTransactionId: "payment-a" });
  });
});
