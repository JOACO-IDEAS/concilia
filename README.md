# ConciliIA — "AI Employee" de cobranza para administradores de consorcios

SaaS de conciliación bancaria y cobranza inteligente para administradores de consorcios en Argentina. Además del MVP original (mock data, para demos rápidas sin backend), corre un backend real (Next.js + Prisma + Postgres) que ya opera de punta a punta: recibe pagos, los concilia solo, ingiere extractos en PDF, sugiere coincidencias con IA heurística, detecta morosidad y manda recordatorios por WhatsApp — todo verificado contra una base de producción real (Neon), documentado con detalle en [`PROGRESS.md`](../PROGRESS.md).

**Producción**: https://conciliia-app.vercel.app

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript
- Tailwind CSS v4 · lucide-react
- Prisma 7 (driver adapter `@prisma/adapter-pg`) + PostgreSQL (Neon)
- Resend (email) · WhatsApp Cloud API / Meta (WhatsApp) · `pdf-parse` (extractos bancarios)
- Estado del MVP mock: React Context + `useReducer`, sin dependencias ni backend

## Cómo correrlo

```bash
cd ConcilliaIA/app
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). Sin `DATABASE_URL` configurada, las páginas con backend real (`/conciliacion`, `/dashboard`, `/morosidad`) muestran un estado vacío claro en vez de romper — el resto de la app (mock) funciona igual.

## El "AI Employee" — capacidades reales (Postgres, no mock)

Cada pestaña "real" convive con el flujo mock original de la misma página, sin reemplazarlo — ver `PROGRESS.md` para el detalle completo de cada iteración, decisiones de diseño y verificación contra producción.

### 1. Webhooks de pagos y reconciliación automática

`POST /api/v1/webhooks/payments` recibe notificaciones de cobro (Belvo, Prometeo, Pluggy, pasarelas, etc.) y las concilia contra las `Organization` existentes por CUIT o CBU/Alias. Autenticación HMAC-SHA256 fail-closed — ver sección de Webhooks más abajo. UI: pestaña "Webhooks (Open Banking)" en `/conciliacion`.

### 2. Ingesta de extractos bancarios en PDF

Pestaña "Extractos PDF" en `/conciliacion`: drag & drop de un PDF de extracto → se extrae el texto (`pdf-parse`) → un parser heurístico reconstruye fecha/monto/concepto/CUIT-CBU por movimiento → previsualización editable → confirmar carga cada movimiento al mismo pipeline de `PaymentTransaction` que un webhook (reconciliación automática incluida). Solo funciona con PDFs de texto embebido real (no escaneados).

### 3. Smart Match — sugerencias de vínculo con IA heurística

Para cada pago `UNMATCHED`, un botón "Sugerencias" abre un Top 3 de organizaciones candidatas con % de confianza, calculado con Levenshtein sobre CUIT/CBU + coincidencia de conceptos + historial de montos (sin LLM ni servicio externo — heurística propia, explicable). "Aprobar Coincidencia" vincula el pago en 1 clic.

### 4. Notificaciones por Email + WhatsApp

Cada pago conciliado, sin vincular, o recordatorio de morosidad dispara Email (Resend) y WhatsApp (Meta Cloud API) en paralelo, en segundo plano con `after()` de Next.js — nunca bloquean ni hacen fallar el flujo que los dispara. Sin credenciales configuradas, cada envío queda en modo simulación (loguea a quién y qué le hubiera mandado) — comportamiento seguro por defecto, no un error.

### 5. Detección de Morosidad y Reclamador Automático

Pestaña "Cobranza Automática (IA)" en `/morosidad`: detecta organizaciones en mora (heurística sobre `BillingProfile.paymentTerms` + último pago conciliado — no hay modelo de expensas real todavía, ver `PROGRESS.md`), muestra días de atraso y monto estimado, y permite mandar un recordatorio de pago por WhatsApp (con CBU/Alias adjunto) por fila o en lote con "Ejecutar Reclamador Automático". Guarda de anti-spam: no se re-notifica a la misma organización antes de 3 días (`PaymentReminder`).

### 6. Dashboard de Analítica

`/dashboard`: KPIs de recaudación/conciliación del mes, tasa de reconciliación automática, pendientes/unmatched, tendencia diaria y top organizaciones — todo calculado en Postgres (SUM/COUNT/groupBy), nunca trayendo la tabla completa a memoria.

### 7. Importación Asistida

`/importar`: wizard de 4 pasos para dar de alta consorcios masivamente desde Excel/CSV (parseo 100% client-side, upsert transaccional por CUIT).

## Rutas

| Ruta | Mock (demo) | Backend real |
|---|---|---|
| `/` | Dashboard con métricas mock | — |
| `/dashboard` | — | Analítica sobre Postgres real |
| `/consorcios`, `/unidades`, `/reportes` | Sí, sin cambios | — |
| `/conciliacion` | Pestaña "Conciliación manual" | Pestañas "Webhooks (Open Banking)" y "Extractos PDF" + Smart Match |
| `/morosidad` | Pestaña "Vista clásica (demo)" | Pestaña "Cobranza Automática (IA)" |
| `/importar` | — | Wizard de alta masiva de consorcios |

## Variables de entorno

Ver [`.env.example`](.env.example) para la lista completa con comentarios. Todas son opcionales excepto `DATABASE_URL`/`DIRECT_URL` (sin ellas, el backend real muestra estado vacío en vez de romper) y `PAYMENTS_WEBHOOK_SECRET` (sin ella, el webhook rechaza todo — fail closed, no inseguro por defecto).

| Variable | Para qué | Sin configurar |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Conexión a Postgres (pooled / directa para migraciones) | Backend real muestra estado vacío |
| `PAYMENTS_WEBHOOK_SECRET` | Firma HMAC del webhook de pagos | Rechaza todos los webhooks (401) |
| `HEALTH_CHECK_SECRET` | Detalle de `/api/health` | Solo status, sin detalle |
| `RESEND_API_KEY` | Envío real de emails | Modo log — no envía, no rompe |
| `NOTIFICATIONS_FROM_EMAIL` | Remitente de los emails | `onboarding@resend.dev` (Resend) |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` | Envío real por WhatsApp Cloud API | Modo log — no envía, no rompe |
| `WHATSAPP_API_VERSION` | Versión de la Graph API de Meta | `v21.0` |
| `WHATSAPP_ADMIN_PHONE` | Destino de la alerta de pago sin vincular por WhatsApp | Esa alerta puntual se omite |
| `NEXT_PUBLIC_APP_URL` | Link en emails/WhatsApp de alerta | `https://conciliia-app.vercel.app` |

## Estructura

```
src/
  app/                  Rutas: /, /consorcios, /unidades, /conciliacion, /morosidad, /reportes, /dashboard, /importar
    api/v1/webhooks/    Endpoint de pagos (route handler)
  components/
    layout/             Sidebar, Topbar
    ui/                 Badge, Card, Toast (primitivas)
    dashboard/          StatCard, ConsorciosOverview, ActivityFeed, ConciliacionDonut, analytics/
    reconciliation/     UploadDropzone, MatchTable, ReconciliationView (mock)
    conciliacion/       ConciliacionTabs, WebhooksPanel, SmartMatchModal, StatementIngestionPanel (real)
    delinquency/        DelinquencyTable, WhatsAppModal (mock) · MorosidadTabs, OverdueOrganizationsPanel (real)
  lib/
    types.ts, mock-data.ts, prng.ts, store.tsx, export.ts, format.ts   Mock (MVP original)
    prisma.ts                                                          Cliente Prisma singleton
    payments/            extract-payload, reconcile-payment, smart-match, verify-signature
    statements/          parse-pdf-statement (ingesta de PDF)
    delinquency/         detect-overdue (heurística de morosidad)
    notifications/       Email (Resend) — cliente, plantillas, dispatchers combinados
    whatsapp/            WhatsApp Cloud API — cliente, plantillas, recibo/alerta/recordatorio
prisma/
  schema.prisma           Administrator, Organization, Contact, ContactChannel, BillingProfile,
                           PaymentTransaction, PaymentReminder
  migrations/, seed.ts
```

## Notas sobre el MVP mock

El estado del flujo mock (aprobaciones de matching, recordatorios enviados) vive en memoria del navegador — se resetea al recargar. No tiene conexión a bancos reales; es el prototipo original para validar el flujo de producto con el partner piloto, previo a que existiera el backend real.

## Webhooks / Integraciones — Cobranzas y Open Banking

`POST /api/v1/webhooks/payments` recibe notificaciones de pagos de agregadores (Belvo, Prometeo, Pluggy, pasarelas de pago, etc.) y dispara la conciliación automática contra las transacciones pendientes.

### Autenticación: firma HMAC-SHA256

El endpoint es **fail-closed**: si `PAYMENTS_WEBHOOK_SECRET` no está configurada en el servidor, rechaza todas las peticiones con `401`. Con el secreto configurado, cada request debe autenticarse de una de estas dos formas:

**Opción A — Firma HMAC (recomendada)**

1. Calculá `HMAC-SHA256(body_crudo, PAYMENTS_WEBHOOK_SECRET)` en hexadecimal, sobre el **body crudo exacto** que vas a enviar (antes de cualquier re-serialización).
2. Enviala en el header `x-signature`, como hex plano o con el prefijo `sha256=`:

```
x-signature: 3f1a9c...   (hex plano)
```
o
```
x-signature: sha256=3f1a9c...
```

3. El servidor recalcula el HMAC sobre el body recibido y compara en tiempo constante (`crypto.timingSafeEqual`) — no hay tolerancia a diferencias de formato/whitespace en el JSON, así que no reformatees el body después de firmarlo.

Ejemplo (`openssl`):

```bash
BODY='{"transaction_id":"txn_123","amount":75000,"currency":"ARS","cuit":"30-71234567-8"}'
SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PAYMENTS_WEBHOOK_SECRET" | sed 's/^.* //')

curl -X POST https://conciliia-app.vercel.app/api/v1/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "x-signature: $SIGNATURE" \
  -d "$BODY"
```

**Opción B — Token compartido (fallback)**

Si el proveedor no soporta firmar el body, se acepta enviar el secreto crudo como token, vía header `x-webhook-token: <secreto>` o query string `?token=<secreto>`. Menos seguro que la opción A (no valida integridad del body) — usar solo si el proveedor no ofrece HMAC.

### Idempotencia

Cada notificación debe incluir un `transaction_id` externo único. Reenvíos con el mismo `transaction_id` devuelven `200 {"ok":true,"duplicate":true}` sin reprocesar ni duplicar la conciliación. La ingesta de PDF usa el mismo mecanismo con un `externalId` hash determinístico (fecha+monto+concepto), así que reimportar el mismo extracto tampoco duplica.

### Notificaciones automáticas — Email + WhatsApp

Al procesar cada webhook (y al vincular manualmente o vía Smart Match, y al confirmar una ingesta de PDF), además de conciliar el pago se dispara Email + WhatsApp en paralelo según el resultado:

- **Pago conciliado (`MATCHED`)** → recibo de pago a los `ContactChannel` de tipo `EMAIL`/`WHATSAPP` con propósito `BILLING` o `GENERAL` de la organización vinculada.
- **Pago sin identificar (`UNMATCHED`)** → alerta a todos los `Administrator` activos por email, y a `WHATSAPP_ADMIN_PHONE` por WhatsApp, con link directo a `/conciliacion`.

El envío corre con [`after()`](https://nextjs.org/docs/app/api-reference/functions/after) de Next.js — se programa **después** de que la respuesta ya salió, así que una demora o caída de Resend/Meta nunca hace fallar ni reintentar el request que lo disparó. Ver `src/lib/notifications/` (email) y `src/lib/whatsapp/` (WhatsApp) — variables de entorno relevantes en `.env.example`.
