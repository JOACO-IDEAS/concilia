// Auditoría forense, 100% SOLO LECTURA. No importa nada que escriba en
// Prisma (ni migrate, ni db push, ni ninguna acción de escritura) — usa
// exclusivamente $queryRawUnsafe con SELECT.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP_ROOT = resolve(import.meta.dirname, "..");
function cargarArchivoEnv(nombreArchivo: string): void {
  const texto = readFileSync(resolve(APP_ROOT, nombreArchivo), "utf8");
  for (const linea of texto.split("\n")) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
cargarArchivoEnv(".env.local");
const host = new URL(process.env.DATABASE_URL!).host;
console.log("Conectando SOLO LECTURA a:", host);
console.log("=".repeat(80));

const { prisma } = await import("../src/lib/prisma.ts");

console.log("\n### PARTE 3 — TODAS las filas de _prisma_migrations ###");
const migraciones = await prisma.$queryRawUnsafe<
  { migration_name: string; started_at: Date; finished_at: Date | null; rolled_back_at: Date | null; applied_steps_count: number; logs: string | null }[]
>(`SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs FROM _prisma_migrations ORDER BY started_at ASC;`);
console.table(migraciones.map((m) => ({ migration_name: m.migration_name, started_at: m.started_at, finished_at: m.finished_at, rolled_back_at: m.rolled_back_at, applied_steps_count: m.applied_steps_count })));

console.log("\n### PARTE 4 — Columnas reales de agent_observations ###");
const columnas = await prisma.$queryRawUnsafe<
  { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]
>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'agent_observations' ORDER BY ordinal_position;`);
console.table(columnas);

console.log("\n### PARTE 4 — Índices reales de agent_observations ###");
const indices = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
  `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'agent_observations' ORDER BY indexname;`
);
console.table(indices);

console.log("\n### PARTE 4 — Foreign keys reales de agent_observations ###");
const fks = await prisma.$queryRawUnsafe<{ constraint_name: string; column_name: string; foreign_table: string; delete_rule: string }[]>(`
  SELECT
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
  WHERE tc.table_name = 'agent_observations' AND tc.constraint_type = 'FOREIGN KEY';
`);
console.table(fks);

console.log("\n### PARTE 4 — Valores reales del enum AgentObservationType ###");
const enumVals = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
  `SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AgentObservationType') ORDER BY enumsortorder;`
);
console.log(enumVals.map((e) => e.enumlabel).join(", "));

console.log("\n### PARTE 4 — Valores reales del enum AgentType ###");
const enumVals2 = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
  `SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AgentType') ORDER BY enumsortorder;`
);
console.log(enumVals2.map((e) => e.enumlabel).join(", "));

console.log("\n### PARTE 5 — Conteos de todas las tablas relevantes ###");
const [
  paymentTransaction, shadowMatchLog, organization, unit, unitOwner, obligation, paymentNotice, reconciliationMatch, agentObservation,
  provider, providerDocument, providerOrganization, regulatoryRequirement, billingProfile,
] = await Promise.all([
  prisma.paymentTransaction.count(),
  prisma.shadowMatchLog.count(),
  prisma.organization.count(),
  prisma.unit.count(),
  prisma.unitOwner.count(),
  prisma.obligation.count(),
  prisma.paymentNotice.count(),
  prisma.reconciliationMatch.count(),
  prisma.agentObservation.count(),
  prisma.provider.count(),
  prisma.providerDocument.count(),
  prisma.providerOrganization.count(),
  prisma.regulatoryRequirement.count(),
  prisma.billingProfile.count(),
]);
console.table({ paymentTransaction, shadowMatchLog, organization, unit, unitOwner, obligation, paymentNotice, reconciliationMatch, agentObservation, provider, providerDocument, providerOrganization, regulatoryRequirement, billingProfile });

console.log("\n### PARTE 6 — updatedAt más reciente de PaymentTransaction y ShadowMatchLog (¿alguna fila tocada cerca del incidente ~00:46 UTC?) ###");
const ptRecientes = await prisma.$queryRawUnsafe<{ id: string; updatedAt: Date }[]>(
  `SELECT id, "updatedAt" FROM payment_transactions ORDER BY "updatedAt" DESC LIMIT 5;`
);
console.table(ptRecientes);
const smlRecientes = await prisma.$queryRawUnsafe<{ id: string; updatedAt: Date }[]>(
  `SELECT id, "updatedAt" FROM shadow_match_logs ORDER BY "updatedAt" DESC LIMIT 5;`
);
console.table(smlRecientes);

console.log("\n### PARTE 4 — ¿existe payment_evidence_assessment_logs? ###");
const tablas = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = 'payment_evidence_assessment_logs';`
);
console.log("Existe:", tablas.length > 0);

await prisma.$disconnect();
console.log("\nFin — 100% solo lectura, cero escrituras.");
