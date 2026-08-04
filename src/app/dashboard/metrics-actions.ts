"use server";

import { prisma } from "@/lib/prisma";

export interface KpisDashboard {
  totalReconciliadoMes: number;
  tasaReconciliacionAutomatica: number | null; // null = sin pagos conciliados este mes todavía
  pagosPendientesCount: number;
  pagosPendientesMonto: number;
  organizacionesActivas: number;
}

export interface PuntoTendencia {
  fecha: string; // ISO yyyy-mm-dd
  total: number;
}

export interface TopOrganizacion {
  id: string;
  name: string;
  totalCobrado: number;
  cantidadPagos: number;
  porcentajeAutomatico: number; // 0-100
}

export interface MetricasDashboardResultado {
  ok: boolean;
  kpis?: KpisDashboard;
  tendencia?: PuntoTendencia[];
  topOrganizaciones?: TopOrganizacion[];
  error?: string;
}

function inicioDeMesUTC(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
}

/**
 * Trae todas las métricas del dashboard de analítica en un único round-trip
 * lógico (varias queries en paralelo). Todas las agregaciones (SUM/COUNT/
 * groupBy, y el bucketing diario vía date_trunc) corren en Postgres — nunca
 * se trae la tabla completa de payment_transactions a memoria del server.
 *
 * Igual que el resto de los server actions de Fase 3 (ver payments-actions.ts):
 * si todavía no hay una base de datos conectada, devuelve `ok:false` en vez
 * de tirar, para que la UI lo muestre como un estado vacío claro.
 */
export async function obtenerMetricasDashboard(): Promise<MetricasDashboardResultado> {
  try {
    const inicioMes = inicioDeMesUTC();

    const [
      sumaReconciliadaMes,
      conteoPorMetodoMes,
      pendientes,
      organizacionesActivas,
      tendenciaDiaria,
      porOrganizacion,
    ] = await Promise.all([
      prisma.paymentTransaction.aggregate({
        where: { status: "MATCHED", matchedAt: { gte: inicioMes } },
        _sum: { amount: true },
      }),
      prisma.paymentTransaction.groupBy({
        by: ["matchMethod"],
        where: { status: "MATCHED", matchedAt: { gte: inicioMes } },
        _count: { _all: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { status: { in: ["PENDING", "UNMATCHED"] } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.organization.count({ where: { status: "ACTIVE", deletedAt: null } }),
      prisma.$queryRaw<{ dia: Date; total: string | null }[]>`
        SELECT date_trunc('day', "matchedAt") AS dia, COALESCE(SUM(amount), 0)::text AS total
        FROM payment_transactions
        WHERE status = 'MATCHED' AND "matchedAt" >= ${inicioMes}
        GROUP BY dia
        ORDER BY dia ASC
      `,
      prisma.paymentTransaction.groupBy({
        by: ["organizationId"],
        where: { status: "MATCHED", organizationId: { not: null } },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 5,
      }),
    ]);

    const orgIds = porOrganizacion
      .map((o) => o.organizationId)
      .filter((id): id is string => id !== null);

    const [organizaciones, conteoPorMetodoYOrg] = await Promise.all([
      prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      }),
      orgIds.length > 0
        ? prisma.paymentTransaction.groupBy({
            by: ["organizationId", "matchMethod"],
            where: { status: "MATCHED", organizationId: { in: orgIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const nombrePorOrgId = new Map(organizaciones.map((o) => [o.id, o.name]));

    const topOrganizaciones: TopOrganizacion[] = porOrganizacion.map((fila) => {
      const orgId = fila.organizationId as string;
      const gruposDeEstaOrg = conteoPorMetodoYOrg.filter((g) => g.organizationId === orgId);
      const totalOrg = gruposDeEstaOrg.reduce((sum, g) => sum + g._count._all, 0);
      const autoOrg = gruposDeEstaOrg
        .filter((g) => g.matchMethod === "AUTO")
        .reduce((sum, g) => sum + g._count._all, 0);

      return {
        id: orgId,
        name: nombrePorOrgId.get(orgId) ?? "Organización eliminada",
        totalCobrado: fila._sum.amount?.toNumber() ?? 0,
        cantidadPagos: fila._count._all,
        porcentajeAutomatico: totalOrg > 0 ? Math.round((autoOrg / totalOrg) * 100) : 0,
      };
    });

    const autoMes = conteoPorMetodoMes.find((g) => g.matchMethod === "AUTO")?._count._all ?? 0;
    const manualMes = conteoPorMetodoMes.find((g) => g.matchMethod === "MANUAL")?._count._all ?? 0;
    const totalConciliadoMes = autoMes + manualMes;

    const kpis: KpisDashboard = {
      totalReconciliadoMes: sumaReconciliadaMes._sum.amount?.toNumber() ?? 0,
      tasaReconciliacionAutomatica:
        totalConciliadoMes > 0 ? Math.round((autoMes / totalConciliadoMes) * 100) : null,
      pagosPendientesCount: pendientes._count._all,
      pagosPendientesMonto: pendientes._sum.amount?.toNumber() ?? 0,
      organizacionesActivas,
    };

    const tendencia: PuntoTendencia[] = tendenciaDiaria.map((fila) => ({
      fecha: fila.dia.toISOString().slice(0, 10),
      total: Number(fila.total ?? 0),
    }));

    return { ok: true, kpis, tendencia, topOrganizaciones };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "No se pudo conectar con la base de datos para leer las métricas.",
    };
  }
}
