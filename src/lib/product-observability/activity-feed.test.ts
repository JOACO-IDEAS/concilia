import { describe, expect, it } from "vitest";
import { createDevelopmentProductEventStore } from "./development-store";
import { createProductEvent } from "./events";
import { loadOperationalActivity } from "./activity-feed";

const event = (id: string, type: "STATEMENT_IMPORT_CONFIRMED" | "CASE_APPROVED", organizationId: string, timestamp: string) => createProductEvent(
  type === "STATEMENT_IMPORT_CONFIRMED"
    ? { id, timestamp, administratorId: "admin-a", organizationId, type, metadata: { createdCount: 1, duplicateCount: 0, unattributableCount: 0 } }
    : { id, timestamp, administratorId: "admin-a", organizationId, type, metadata: { paymentTransactionId: "payment-a" } },
);

describe("loadOperationalActivity", () => {
  it("devuelve vacío cuando el store no contiene actividad", async () => {
    await expect(loadOperationalActivity(createDevelopmentProductEventStore(), ["org-a"])).resolves.toEqual([]);
  });

  it("traduce eventos de producto a mensajes operativos sin metadata", async () => {
    const store = createDevelopmentProductEventStore();
    await store.append(event("import", "STATEMENT_IMPORT_CONFIRMED", "org-a", "2026-08-12T10:00:00.000Z"));
    await store.append(event("approved", "CASE_APPROVED", "org-a", "2026-08-12T11:00:00.000Z"));

    await expect(loadOperationalActivity(store, ["org-a"])).resolves.toEqual([
      { id: "approved", occurredAt: "2026-08-12T11:00:00.000Z", message: "Aprobaste una conciliación." },
      { id: "import", occurredAt: "2026-08-12T10:00:00.000Z", message: "Importaste un extracto." },
    ]);
  });

  it("ordena cronológicamente de lo más reciente a lo más antiguo y desempata por id", async () => {
    const store = createDevelopmentProductEventStore();
    await store.append(event("a", "CASE_APPROVED", "org-a", "2026-08-12T10:00:00.000Z"));
    await store.append(event("b", "CASE_APPROVED", "org-a", "2026-08-12T10:00:00.000Z"));
    await store.append(event("old", "CASE_APPROVED", "org-a", "2026-08-11T10:00:00.000Z"));

    await expect(loadOperationalActivity(store, ["org-a"])).resolves.toMatchObject([{ id: "b" }, { id: "a" }, { id: "old" }]);
  });

  it("no incorpora eventos de organizaciones fuera del scope autorizado", async () => {
    const store = createDevelopmentProductEventStore();
    await store.append(event("own", "CASE_APPROVED", "org-a", "2026-08-12T10:00:00.000Z"));
    await store.append(event("foreign", "CASE_APPROVED", "org-b", "2026-08-12T11:00:00.000Z"));

    await expect(loadOperationalActivity(store, ["org-a"])).resolves.toEqual([expect.objectContaining({ id: "own" })]);
  });
});
