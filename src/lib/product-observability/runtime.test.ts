import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOperationalActivity } from "./activity-feed";
import { appendProductEventSafely, getProductEventStore, resetDevelopmentProductEventStoreForTests } from "./runtime";

afterEach(() => resetDevelopmentProductEventStoreForTests());

describe("development product event wiring", () => {
  it("comparte el mismo ProductEventStore durante el lifecycle del proceso", async () => {
    const producer = getProductEventStore();
    const appended = await appendProductEventSafely({ administratorId: "admin-a", organizationId: "org-a", type: "CASE_APPROVED", metadata: { paymentTransactionId: "payment-a" } }, producer);
    const entries = await loadOperationalActivity(getProductEventStore(), ["org-a"]);
    expect(appended).toBe(true);
    expect(entries).toEqual([expect.objectContaining({ message: "Aprobaste una conciliación." })]);
  });

  it("mantiene el ciclo efímero al reiniciar el store", async () => {
    await appendProductEventSafely({ administratorId: "admin-a", organizationId: "org-a", type: "CASE_REJECTED", metadata: { paymentTransactionId: "payment-a" } });
    resetDevelopmentProductEventStoreForTests();
    await expect(loadOperationalActivity(getProductEventStore(), ["org-a"])).resolves.toEqual([]);
  });

  it("absorbe un fallo auxiliar sin propagarlo a la acción principal", async () => {
    const brokenStore = { append: vi.fn().mockRejectedValue(new Error("store unavailable")), list: vi.fn() };
    await expect(appendProductEventSafely({ administratorId: "admin-a", organizationId: "org-a", type: "CASE_REJECTED", metadata: { paymentTransactionId: "payment-a" } }, brokenStore)).resolves.toBe(false);
  });
});
