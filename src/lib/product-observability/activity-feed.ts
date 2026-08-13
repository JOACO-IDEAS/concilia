import type { ProductEvent, ProductEventStore } from "./events";

export type OperationalActivityEntry = {
  id: string;
  occurredAt: string;
  message: string;
};

function messageFor(event: ProductEvent): string {
  switch (event.type) {
    case "STATEMENT_IMPORT_CONFIRMED": return "Importaste un extracto.";
    case "RESOLUTION_WORKSPACE_OPENED": return "Abriste un caso para revisarlo.";
    case "CASE_APPROVED": return "Aprobaste una conciliación.";
    case "CASE_REJECTED": return "Rechazaste una propuesta.";
    case "FIRST_CASE_RESOLVED": return "Resolviste tu primer caso.";
  }
}

/**
 * Lee exclusivamente ProductEventStore para los tenants ya autorizados.
 * No recibe ni consulta entidades operativas, y nunca expone metadata.
 */
export async function loadOperationalActivity(store: ProductEventStore, organizationIds: string[]): Promise<OperationalActivityEntry[]> {
  const uniqueOrganizationIds = [...new Set(organizationIds.filter(Boolean))];
  const events = (await Promise.all(uniqueOrganizationIds.map((organizationId) => store.list({ organizationId })))).flat();
  return events
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id))
    .map((event) => ({ id: event.id, occurredAt: event.timestamp, message: messageFor(event) }));
}
