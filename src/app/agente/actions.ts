"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentAdministrator } from "@/lib/auth/session";
import { createAgentConversation, sendAgentMessage } from "@/lib/agent/conversations";

export async function createAgentConversationAction(organizationId: string) {
  try {
    const administrator = await requireCurrentAdministrator();
    const conversation = await createAgentConversation(administrator.id, organizationId);
    revalidatePath("/agente");
    return { ok: true as const, conversation };
  } catch {
    return { ok: false as const, error: "No pude crear la conversación." };
  }
}

export async function sendAgentMessageAction(conversationId: string, content: string) {
  try {
    const administrator = await requireCurrentAdministrator();
    const result = await sendAgentMessage(administrator.id, conversationId, content);
    revalidatePath("/agente");
    return { ok: true as const, ...result };
  } catch {
    return { ok: false as const, error: "No pude completar esta consulta." };
  }
}
