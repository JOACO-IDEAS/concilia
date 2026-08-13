import { createDevelopmentProductEventStore } from "./development-store";
import { createProductEvent, type CreateProductEventInput, type ProductEventStore } from "./events";

class DisabledProductEventStore implements ProductEventStore {
  async append(): Promise<void> {}
  async list(): Promise<[]> { return []; }
}

let developmentStore: ProductEventStore | undefined;
const disabledStore: ProductEventStore = new DisabledProductEventStore();

/** Proceso de desarrollo/test solamente. Reiniciar borra los eventos. */
export function getProductEventStore(): ProductEventStore {
  if (process.env.NODE_ENV === "production") return disabledStore;
  developmentStore ??= createDevelopmentProductEventStore();
  return developmentStore;
}

/** La observabilidad auxiliar nunca invalida una acción de dominio ya exitosa. */
export async function appendProductEventSafely(input: CreateProductEventInput, store: ProductEventStore = getProductEventStore()): Promise<boolean> {
  try {
    await store.append(createProductEvent(input));
    return true;
  } catch (error) {
    console.error("[product-observability] No se pudo registrar actividad auxiliar:", error);
    return false;
  }
}

/** Sólo para aislar lifecycle de tests; no es un API de consumidores. */
export function resetDevelopmentProductEventStoreForTests(): void {
  developmentStore = undefined;
}
