import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { OperationalInbox } from "@/components/inbox/OperationalInbox";
import { getFirstReviewableCaseStatus, getOperationalInboxData, getOperationalReviewQueue } from "./operational-inbox-data";
import { AuthenticationError, requireCurrentAdministrator } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    await requireCurrentAdministrator();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/acceso");
    throw error;
  }

  const [data, reviewQueue, firstReviewableStatus] = await Promise.all([
    getOperationalInboxData(),
    getOperationalReviewQueue(),
    getFirstReviewableCaseStatus(),
  ]);

  return <><Topbar title="Inicio" subtitle="Tu trabajo operativo de hoy" /><OperationalInbox data={data} reviewItems={reviewQueue.items} reviewQueueAvailable={reviewQueue.available} firstReviewableStatus={firstReviewableStatus} /></>;
}
