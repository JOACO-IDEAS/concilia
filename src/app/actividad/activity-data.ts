"use server";

import { requireCurrentAdministrator } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { loadOperationalActivity, type OperationalActivityEntry } from "@/lib/product-observability/activity-feed";
import type { ProductEventStore } from "@/lib/product-observability/events";
import { getProductEventStore } from "@/lib/product-observability/runtime";

/**
 * El store recibe únicamente organizations ya autorizadas. El adapter actual
 * es efímero; una implementación durable futura se inyectará sin cambiar la UI.
 */
export async function getOperationalActivity(store: ProductEventStore = getProductEventStore()): Promise<OperationalActivityEntry[]> {
  const administrator = await requireCurrentAdministrator();
  const organizations = await prisma.organization.findMany({
    where: { administrators: { some: { administratorId: administrator.id } } },
    select: { id: true },
  });
  return loadOperationalActivity(store, organizations.map((organization) => organization.id));
}
