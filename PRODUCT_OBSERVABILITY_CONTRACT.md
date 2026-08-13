# Product Observability Contract

La observabilidad de piloto registra acciones operativas de administradores; no es analítica comercial ni telemetría externa.

## Eventos

- `STATEMENT_IMPORT_CONFIRMED`: sólo conteos de creados, duplicados y no atribuibles.
- `RESOLUTION_WORKSPACE_OPENED`: sólo `paymentTransactionId` interno.
- `CASE_APPROVED`, `CASE_REJECTED`, `FIRST_CASE_RESOLVED`: sólo `paymentTransactionId` interno.

Cada evento requiere `id`, `timestamp`, `administratorId`, `organizationId`, `type` y metadata estrictamente permitida. No admite nombres, conceptos, referencias bancarias, importes ni archivos.

## Persistencia propuesta

No se usa `AgentObservation`: expresa hallazgos de agentes y sus filas son idempotentes/resolubles, mientras los eventos de uso requieren historial append-only y actor administrador.

Una futura implementación debe aportar un store append-only con un modelo `ProductEvent` que conserve esos seis campos y permita lecturas filtradas por `organizationId`. La capa de aplicación debe exigir `requireOrganizationAccess(organizationId)` antes de llamar a `list`; el store nunca debe inferir ni aceptar una organización desde el cliente.

## Adapter de desarrollo

`DevelopmentProductEventStore` es una implementación en memoria, construida con `createDevelopmentProductEventStore()`. No persiste archivos ni datos de proceso: una instancia nueva —o un reinicio— comienza vacía. Ordena sus lecturas por `timestamp` ascendente y luego por `id` ascendente.

El runtime de desarrollo usa una instancia compartida sólo durante la vida del proceso y la expone como `ProductEventStore`. Un restart borra sus eventos. En producción usa un store vacío hasta que se apruebe un adapter durable; nunca presenta memoria de proceso como historial persistente.

En desarrollo, las acciones de importación confirmada y decisión humana aprobada/rechazada emiten sus eventos sólo después de la operación principal exitosa. El append es auxiliar: si falla, la importación o decisión ya confirmada conserva su resultado. No hay dashboard, agregación, servicio externo ni persistencia durable.
