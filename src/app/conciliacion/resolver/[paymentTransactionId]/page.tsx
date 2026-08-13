import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { ResolutionWorkspace } from "@/components/conciliacion/ResolutionWorkspace";
import { AuthenticationError, requireCurrentAdministrator } from "@/lib/auth/session";
import { getResolutionWorkspaceData } from "../resolution-workspace-data";

export const dynamic = "force-dynamic";

export default async function ResolutionWorkspacePage({ params }: { params: Promise<{ paymentTransactionId: string }> }) {
  try { await requireCurrentAdministrator(); } catch (error) { if (error instanceof AuthenticationError) redirect("/acceso"); throw error; }
  const { paymentTransactionId } = await params;
  const data = await getResolutionWorkspaceData(paymentTransactionId);
  return <><Topbar title="Resolver conciliación" subtitle="Entendé el caso antes de registrar una decisión." /><ResolutionWorkspace data={data} /></>;
}
