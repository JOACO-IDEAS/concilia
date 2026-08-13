import { createProductEvent, type ProductEvent, type ProductEventStore } from "./events";

function cloneEvent(event: ProductEvent): ProductEvent {
  return { ...event, metadata: { ...event.metadata } } as ProductEvent;
}

function compareEvents(a: ProductEvent, b: ProductEvent): number {
  const timestampOrder = a.timestamp.localeCompare(b.timestamp);
  return timestampOrder !== 0 ? timestampOrder : a.id.localeCompare(b.id);
}

/**
 * Adapter exclusivamente de desarrollo: vive sólo en memoria del proceso.
 * No se instancia globalmente ni se conecta a pantallas; al recrearlo o al
 * reiniciar el proceso, todos sus eventos desaparecen deliberadamente.
 */
export class DevelopmentProductEventStore implements ProductEventStore {
  private readonly events: ProductEvent[] = [];

  async append(event: ProductEvent): Promise<void> {
    // Revalida en el límite del storage para que un consumidor JS no pueda
    // saltearse las reglas de metadata mínima definidas por el contrato.
    const validated = createProductEvent(event, new Date(event.timestamp), () => event.id);
    this.events.push(cloneEvent(validated));
  }

  async list(scope: { organizationId: string }): Promise<ProductEvent[]> {
    if (!scope.organizationId.trim()) throw new Error("organizationId es obligatorio para leer eventos.");
    return this.events
      .filter((event) => event.organizationId === scope.organizationId)
      .sort(compareEvents)
      .map(cloneEvent);
  }
}

/** Factory para inyección explícita; nunca retorna una persistencia durable. */
export function createDevelopmentProductEventStore(): ProductEventStore {
  return new DevelopmentProductEventStore();
}
