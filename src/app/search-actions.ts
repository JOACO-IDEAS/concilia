"use server";

import { prisma } from "@/lib/prisma";
import { requireCurrentAdministrator } from "@/lib/auth/session";

export interface OrganizacionBusquedaDTO {
  id: string;
  name: string;
  address: string;
}

/**
 * Búsqueda global de organizaciones (consorcios reales, no el mock de
 * `useAppStore`) para el Command Palette del header — por nombre o CUIT.
 * Sólo busca consorcios, nunca unidades (ver placeholder honesto en
 * `HeaderSearch.tsx`). Sin página de detalle por organización todavía, así
 * que el resultado navega a `/unidades-config` (padrón de unidades) sin
 * preseleccionar el consorcio elegido — no hay a dónde más específico
 * llevarlo hoy.
 */
export async function buscarOrganizaciones(query: string): Promise<OrganizacionBusquedaDTO[]> {
  const texto = query.trim();
  if (texto.length < 2) return [];
  const administrator = await requireCurrentAdministrator();

  const organizaciones = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      administrators: { some: { administratorId: administrator.id } },
      OR: [
        { name: { contains: texto, mode: "insensitive" } },
        { taxId: { contains: texto, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, address: true },
    orderBy: { name: "asc" },
    take: 8,
  });

  return organizaciones;
}
