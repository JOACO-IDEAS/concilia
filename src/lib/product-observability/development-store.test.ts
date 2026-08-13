import { describe, expect, it } from "vitest";
import { createDevelopmentProductEventStore, DevelopmentProductEventStore } from "./development-store";
import { createProductEvent } from "./events";

const at = (timestamp: string, id: string, organizationId = "org-a") => createProductEvent({
  id,
  timestamp,
  administratorId: "admin-a",
  organizationId,
  type: "CASE_APPROVED",
  metadata: { paymentTransactionId: `payment-${id}` },
});

describe("DevelopmentProductEventStore", () => {
  it("agrega un evento validado y lo hace disponible sólo en su organización", async () => {
    const store = createDevelopmentProductEventStore();
    await store.append(at("2026-08-12T18:00:00.000Z", "event-a"));

    await expect(store.list({ organizationId: "org-a" })).resolves.toEqual([expect.objectContaining({ id: "event-a" })]);
  });

  it("ordena por timestamp y luego por id cuando hay empate", async () => {
    const store = createDevelopmentProductEventStore();
    await store.append(at("2026-08-12T18:01:00.000Z", "event-z"));
    await store.append(at("2026-08-12T18:00:00.000Z", "event-b"));
    await store.append(at("2026-08-12T18:00:00.000Z", "event-a"));

    await expect(store.list({ organizationId: "org-a" })).resolves.toMatchObject([{ id: "event-a" }, { id: "event-b" }, { id: "event-z" }]);
  });

  it("no ofrece lecturas cross-organization", async () => {
    const store = createDevelopmentProductEventStore();
    await store.append(at("2026-08-12T18:00:00.000Z", "event-a", "org-a"));
    await store.append(at("2026-08-12T18:00:01.000Z", "event-b", "org-b"));

    await expect(store.list({ organizationId: "org-a" })).resolves.toEqual([expect.objectContaining({ id: "event-a", organizationId: "org-a" })]);
    await expect(store.list({ organizationId: "org-b" })).resolves.toEqual([expect.objectContaining({ id: "event-b", organizationId: "org-b" })]);
  });

  it("es append-only y no expone update, delete ni replace", () => {
    const store = new DevelopmentProductEventStore();
    expect(store).not.toHaveProperty("update");
    expect(store).not.toHaveProperty("delete");
    expect(store).not.toHaveProperty("replace");
  });

  it("pierde todos los eventos al crear una nueva instancia", async () => {
    const first = createDevelopmentProductEventStore();
    await first.append(at("2026-08-12T18:00:00.000Z", "event-a"));
    const restarted = createDevelopmentProductEventStore();

    await expect(restarted.list({ organizationId: "org-a" })).resolves.toEqual([]);
  });

  it("rechaza eventos inválidos aunque un consumidor evada TypeScript", async () => {
    const store = createDevelopmentProductEventStore();
    const invalid = { ...at("2026-08-12T18:00:00.000Z", "event-a"), metadata: { paymentTransactionId: "payment-a", concept: "dato sensible" } };

    await expect(store.append(invalid as never)).rejects.toThrow("campos no permitidos");
    await expect(store.list({ organizationId: "org-a" })).resolves.toEqual([]);
  });

  it("devuelve copias para que un consumidor no pueda mutar el historial interno", async () => {
    const store = createDevelopmentProductEventStore();
    await store.append(at("2026-08-12T18:00:00.000Z", "event-a"));
    const [event] = await store.list({ organizationId: "org-a" });
    event.organizationId = "org-b";

    await expect(store.list({ organizationId: "org-a" })).resolves.toEqual([expect.objectContaining({ organizationId: "org-a" })]);
  });
});
