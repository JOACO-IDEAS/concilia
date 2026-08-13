import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { OperationalActivityCenter } from "@/components/activity/OperationalActivityCenter";
import { AuthenticationError, requireCurrentAdministrator } from "@/lib/auth/session";
import { getOperationalActivity } from "./activity-data";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  try {
    await requireCurrentAdministrator();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/acceso");
    throw error;
  }
  const entries = await getOperationalActivity();
  return <><Topbar title="Actividad" subtitle="Lo que realizaste recientemente" /><main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6"><OperationalActivityCenter entries={entries} /></main></>;
}
