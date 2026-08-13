// Fase 3.7 — Paso A+B+C: siembra el padrón (Organization → Unit → UnitOwner
// → Obligation) reutilizando TAL CUAL los importadores ya existentes
// (importarOrganizaciones/importarUnidades/importarObligaciones) — cero
// lógica de upsert/dedup reinventada acá, solo se invocan.
//
// Idempotente por construcción: los tres importadores ya hacen upsert por
// clave natural (taxId / (organizationId,code) / (unitId,period)) — correr
// este script más de una vez actualiza, nunca duplica.
//
// Nota técnica: `importarUnidades`/`importarObligaciones` llaman a
// `revalidatePath()` (next/cache) al final — fuera de un request real de
// Next.js eso lanza "Invariant: static generation store missing" SIEMPRE
// DESPUÉS de que las filas ya se escribieron (es la última línea de la
// función). Se atrapa específicamente ese error acá — cualquier otro error
// se re-lanza tal cual.

import { cargarEntornoDeFixturesYVerificar } from "./lib/fixtures-env.mts";
import type { FilaUnidadFixture } from "./fixtures-data.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[seed-padron] Escribiendo en dev-fixtures (${info.host}).`);

const { PADRON } = await import("./fixtures-data.mts");
const { importarOrganizaciones } = await import("../../src/app/importar/actions.ts");
const { importarUnidades } = await import("../../src/app/unidades-config/actions.ts");
const { importarObligaciones } = await import("../../src/app/unidades-config/obligaciones-actions.ts");
const { prisma } = await import("../../src/lib/prisma.ts");

/**
 * `importarUnidades` (sin modificar, ver comentario de arriba) deduplica
 * titulares CON CUIT por (unitId, taxId) — pero un titular SIN CUIT no
 * tiene clave natural, así que esa función crea una fila nueva en cada
 * corrida (comportamiento documentado y correcto ahí, no es un bug). Para
 * que ESTE script sea idempotente igual, filtramos acá — antes de llamar al
 * importador — cualquier fila sin CUIT cuyo (unitCode, fullName) ya exista
 * como titular activo de esa unidad.
 */
async function filtrarFilasSinCuitYaCargadas(
  organizationId: string,
  filas: FilaUnidadFixture[]
) {
  const resultado = [];
  for (const f of filas) {
    if (f.ownerTaxId.trim()) {
      resultado.push(f);
      continue;
    }
    const yaExiste = await prisma.unitOwner.findFirst({
      where: {
        fullName: f.ownerFullName,
        deletedAt: null,
        unit: { organizationId, code: f.unitCode, deletedAt: null },
      },
      select: { id: true },
    });
    if (!yaExiste) resultado.push(f);
  }
  return resultado;
}

async function ignorandoRevalidatePath<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Error && e.message.includes("static generation store missing")) {
      // Esperado: revalidatePath() fuera de un request real de Next.js. Las
      // filas ya se escribieron antes de esta línea (ver comentario arriba).
      return undefined;
    }
    throw e;
  }
}

console.log("\n=== Paso A: Organizaciones ===");
const resultadoOrgs = await importarOrganizaciones(PADRON.map((p) => p.org));
console.log(`Creadas: ${resultadoOrgs.creadas}, Actualizadas: ${resultadoOrgs.actualizadas}, Errores: ${resultadoOrgs.errores.length}`);
if (resultadoOrgs.errores.length > 0) {
  console.error(resultadoOrgs.errores);
  throw new Error("Errores importando organizaciones — abortando antes de continuar.");
}

for (const { org, unidades, obligaciones } of PADRON) {
  const organizacion = await prisma.organization.findUnique({ where: { taxId: org.taxId } });
  if (!organizacion) throw new Error(`No se encontró la organización recién creada/actualizada: ${org.name} (${org.taxId})`);

  console.log(`\n=== Paso B: Unidades/Titulares — ${org.name} ===`);
  const filasUnidades = await filtrarFilasSinCuitYaCargadas(organizacion.id, unidades);
  const resultadoUnidades = await ignorandoRevalidatePath(() => importarUnidades(organizacion.id, filasUnidades));
  if (resultadoUnidades) {
    console.log(`Creadas: ${resultadoUnidades.creadas}, Actualizadas: ${resultadoUnidades.actualizadas}, Errores: ${resultadoUnidades.errores.length}`);
    if (resultadoUnidades.errores.length > 0) {
      console.error(resultadoUnidades.errores);
      throw new Error(`Errores importando unidades de ${org.name} — abortando.`);
    }
  } else {
    console.log("(revalidatePath ignorado fuera de contexto Next.js — filas ya escritas antes de esa línea)");
  }

  console.log(`=== Paso C: Obligaciones — ${org.name} ===`);
  const resultadoObligaciones = await ignorandoRevalidatePath(() => importarObligaciones(organizacion.id, obligaciones));
  if (resultadoObligaciones) {
    console.log(`Creadas: ${resultadoObligaciones.creadas}, Actualizadas: ${resultadoObligaciones.actualizadas}, Errores: ${resultadoObligaciones.errores.length}`);
    if (resultadoObligaciones.errores.length > 0) {
      console.error(resultadoObligaciones.errores);
      throw new Error(`Errores importando obligaciones de ${org.name} — abortando.`);
    }
  } else {
    console.log("(revalidatePath ignorado fuera de contexto Next.js — filas ya escritas antes de esa línea)");
  }
}

console.log("\n=== Resumen final (conteo real en la base) ===");
const [org, unit, unitOwner, obligation] = await Promise.all([
  prisma.organization.count({ where: { name: { startsWith: "[FIXTURE]" } } }),
  prisma.unit.count({ where: { organization: { name: { startsWith: "[FIXTURE]" } } } }),
  prisma.unitOwner.count({ where: { unit: { organization: { name: { startsWith: "[FIXTURE]" } } } } }),
  prisma.obligation.count({ where: { unit: { organization: { name: { startsWith: "[FIXTURE]" } } } } }),
]);
console.table({ "Organization [FIXTURE]": org, Unit: unit, UnitOwner: unitOwner, Obligation: obligation });

await prisma.$disconnect();
