// Fase 4 Parte D — imprime la bandeja de trabajo tal como la vería un
// administrador, leyendo dev-fixtures. Solo lectura.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[bandeja] Leyendo dev-fixtures (${info.host}) — DATOS DE PRUEBA, no producción.\n`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { obtenerBandejaDeTrabajo } = await import("../../src/lib/agent-os/work-queue.ts");

const bandeja = await prisma.$transaction((tx) => obtenerBandejaDeTrabajo(tx));

const iconoSeveridad = { CRITICAL: "🔴", WARNING: "🟡", INFO: "🟡" } as const;

console.log("┌─────────────────────────────────────────────────┐");
console.log("│ CONCILIA — HOY   [ENTORNO DE PRUEBA — dev-fixtures] │");
console.log("├─────────────────────────────────────────────────┤");
console.log(`│ 🔴 ${bandeja.requierenAtencion} cosa(s) requieren atención`.padEnd(53) + "│");
console.log(`│ 🟡 ${bandeja.enSeguimiento} cosa(s) en seguimiento`.padEnd(53) + "│");
console.log(`│ 🟢 ${bandeja.resueltas} observación(es) resuelta(s)`.padEnd(53) + "│");
console.log("└─────────────────────────────────────────────────┘\n");

for (const obs of bandeja.observacionesAbiertas) {
  console.log(`${iconoSeveridad[obs.severity as keyof typeof iconoSeveridad] ?? "⚪"} [${obs.severity}] ${obs.type}`);
  console.log(`   Proveedor: ${obs.providerName ?? "—"}${obs.organizationName ? `  ·  Organización: ${obs.organizationName}` : ""}`);
  console.log(`   Detectado: ${obs.explanation}`);
  console.log(`   Evidencia: ${JSON.stringify(obs.evidence)}`);
  console.log(`   Recomendación de ConcilIA: ${obs.suggestedAction ?? "—"}`);
  console.log(`   Automático: NO — requiere aprobación humana (esta fase es 100% read-only + proposal)`);
  console.log(`   Estado: ${obs.status}`);
  console.log("");
}

if (bandeja.observacionesAbiertas.length === 0) {
  console.log("(sin observaciones abiertas)");
}

await prisma.$disconnect();
