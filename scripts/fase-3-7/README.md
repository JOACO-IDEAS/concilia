# Fase 3.7 — Data Seed / Primer Padrón Real

Scripts idempotentes y reproducibles para sembrar el dataset de calibración de 4 consorcios + 10 escenarios de pago, y correr el motor shadow sobre ellos. **Nunca corren contra producción** — `lib/fixtures-env.mts` se niega a escribir si `DATABASE_URL` apunta al host de producción conocido.

## Requisito previo

`.env.fixtures.local` (en la raíz de `app/`, nunca commiteado — `.env*` está en `.gitignore`) con `DATABASE_URL`/`DATABASE_URL_UNPOOLED` de la rama Neon `dev-fixtures`. Si ese archivo no existe o apunta a producción, todos los scripts abortan antes de escribir nada.

## Orden de ejecución

```bash
npx tsx scripts/fase-3-7/00-verify-branch.mts       # solo lectura — confirma la rama y el estado actual
npx tsx scripts/fase-3-7/01-seed-padron.mts         # Organization → Unit → UnitOwner → Obligation (importadores existentes)
npx tsx scripts/fase-3-7/02-seed-payments.mts       # 10 PaymentTransaction de escenario (externalId con prefijo seed-fase37:)
npx tsx scripts/fase-3-7/03-run-shadow-matching.mts # corre ejecutarMatchingEnSombra() SOLO sobre esos 10 pagos
npx tsx scripts/fase-3-7/04-report.mts              # informe de validación — solo lectura
```

Los 4 primeros son seguros de correr más de una vez (upsert/idempotentes por diseño — ver comentarios en cada archivo). `04-report.mts` es puramente de lectura.

## Recalibrar / re-correr con una versión nueva del motor

Subir `MATCH_ENGINE_VERSION` en `src/lib/reconciliation/version.ts` y volver a correr `03-run-shadow-matching.mts` — genera una fila `ShadowMatchLog` **independiente** por `engineVersion` (no pisa la anterior), permitiendo comparar ambas versiones lado a lado vía `04-report.mts` o la pantalla `/conciliacion/shadow-matching`.

## Eliminar el dataset completo (reversible — la rama Neon lo hace trivial)

**Opción A — recomendada: eliminar y recrear la rama Neon `dev-fixtures` desde la consola de Neon.** Instantáneo, no requiere ningún script, y no deja ningún rastro parcial. Después de recrearla, volver a correr los 4 scripts en orden.

**Opción B — borrado selectivo dentro de la misma rama** (si se quiere conservar la rama pero limpiar solo estos fixtures), en este orden exacto (respeta FKs):

```sql
-- 1. ShadowMatchLog de los pagos de fixture
DELETE FROM shadow_match_logs
WHERE "paymentTransactionId" IN (
  SELECT id FROM payment_transactions WHERE "externalId" LIKE 'seed-fase37:%'
);

-- 2. Los PaymentTransaction de fixture
DELETE FROM payment_transactions WHERE "externalId" LIKE 'seed-fase37:%';

-- 3. Obligation / UnitOwner / Unit de las organizaciones [FIXTURE]
DELETE FROM obligations WHERE "unitId" IN (
  SELECT u.id FROM units u JOIN organizations o ON o.id = u."organizationId" WHERE o.name LIKE '[FIXTURE]%'
);
DELETE FROM unit_owners WHERE "unitId" IN (
  SELECT u.id FROM units u JOIN organizations o ON o.id = u."organizationId" WHERE o.name LIKE '[FIXTURE]%'
);
DELETE FROM units WHERE "organizationId" IN (SELECT id FROM organizations WHERE name LIKE '[FIXTURE]%');

-- 4. Las Organization de fixture (esto NO toca las 3 organizaciones reales
--    heredadas de producción al crear la rama — el filtro por nombre las excluye)
DELETE FROM organizations WHERE name LIKE '[FIXTURE]%';
```

Verificar después con `00-verify-branch.mts` que "Organizaciones ya marcadas [FIXTURE]" volvió a 0.

## Por qué NO se borra el dataset ahora

Decisión explícita del usuario (Fase 3.7, punto 10): conservarlo en la rama `dev-fixtures` para poder inspeccionarlo, repetir el matching, comparar versiones del motor, y calibrar más adelante — sin volver a sembrar nada.
