import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { AuthenticationError, requireCurrentAdministrator } from "@/lib/auth/session";
import { AgentAccessError, getAgentConversation, listAgentConversations, listAgentOrganizations } from "@/lib/agent/conversations";
import { AgentWorkspace } from "./AgentWorkspace";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  let administrator;
  try { administrator = await requireCurrentAdministrator(); }
  catch (error) { if (error instanceof AuthenticationError) redirect("/acceso"); throw error; }
  const params = await searchParams;
  const [organizations, conversations] = await Promise.all([
    listAgentOrganizations(administrator.id),
    listAgentConversations(administrator.id),
  ]);
  let active = conversations[0] ?? null;
  if (params.conversation) {
    try { active = await getAgentConversation(administrator.id, params.conversation); }
    catch (error) { if (!(error instanceof AgentAccessError)) throw error; }
  }
  return <><Topbar title="ConcilIA Agent" subtitle="Consultas operativas seguras" /><AgentWorkspace organizations={organizations} initialConversations={conversations} initialActive={active} /></>;
}
