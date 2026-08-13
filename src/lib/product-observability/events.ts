/**
 * Contrato interno de observabilidad de producto para el piloto.
 *
 * No usa AgentObservation: aquel modelo representa hallazgos de agentes y
 * tiene semántica de upsert/resolución, incompatibles con un evento de uso
 * append-only. Este módulo tampoco envía datos a terceros ni registra PII.
 */
export const PRODUCT_EVENT_TYPES = [
  "STATEMENT_IMPORT_CONFIRMED",
  "RESOLUTION_WORKSPACE_OPENED",
  "CASE_APPROVED",
  "CASE_REJECTED",
  "FIRST_CASE_RESOLVED",
] as const;

export type ProductEventType = (typeof PRODUCT_EVENT_TYPES)[number];

type StatementImportMetadata = {
  createdCount: number;
  duplicateCount: number;
  unattributableCount: number;
};
type PaymentMetadata = { paymentTransactionId: string };

export type ProductEventMetadata =
  | StatementImportMetadata
  | PaymentMetadata;

export type ProductEvent = {
  id: string;
  timestamp: string;
  administratorId: string;
  organizationId: string;
  type: ProductEventType;
  metadata: ProductEventMetadata;
};

export type CreateProductEventInput = Omit<ProductEvent, "id" | "timestamp"> & {
  id?: string;
  timestamp?: string;
};

function requiredIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} es obligatorio.`);
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${field} debe ser un entero no negativo.`);
  return value as number;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validateMetadata(type: ProductEventType, metadata: unknown): ProductEventMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("metadata debe ser un objeto mínimo permitido.");
  const value = metadata as Record<string, unknown>;
  if (type === "STATEMENT_IMPORT_CONFIRMED") {
    if (!hasOnlyKeys(value, ["createdCount", "duplicateCount", "unattributableCount"])) throw new Error("metadata contiene campos no permitidos para una importación.");
    return {
      createdCount: nonNegativeInteger(value.createdCount, "metadata.createdCount"),
      duplicateCount: nonNegativeInteger(value.duplicateCount, "metadata.duplicateCount"),
      unattributableCount: nonNegativeInteger(value.unattributableCount, "metadata.unattributableCount"),
    };
  }
  if (!hasOnlyKeys(value, ["paymentTransactionId"])) throw new Error("metadata contiene campos no permitidos para este evento.");
  return { paymentTransactionId: requiredIdentifier(value.paymentTransactionId, "metadata.paymentTransactionId") };
}

/** Crea y valida un evento sin persistirlo ni inferir organización alguna. */
export function createProductEvent(input: CreateProductEventInput, now = new Date(), createId = () => crypto.randomUUID()): ProductEvent {
  const timestamp = input.timestamp ?? now.toISOString();
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("timestamp debe ser ISO válido.");
  if (!PRODUCT_EVENT_TYPES.includes(input.type)) throw new Error("type no es un evento de producto permitido.");
  return {
    id: input.id ?? createId(),
    timestamp,
    administratorId: requiredIdentifier(input.administratorId, "administratorId"),
    organizationId: requiredIdentifier(input.organizationId, "organizationId"),
    type: input.type,
    metadata: validateMetadata(input.type, input.metadata),
  };
}

/** La implementación persistente debe ser append-only y recibir un scope ya autorizado. */
export interface ProductEventStore {
  append(event: ProductEvent): Promise<void>;
  list(scope: { organizationId: string }): Promise<ProductEvent[]>;
}
