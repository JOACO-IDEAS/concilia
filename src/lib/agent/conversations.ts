import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { executeAgentCapability, type AgentResponse } from "./executor";
import { loadTodayAttention } from "./today-attention-tool";
import { loadReconciliationReview } from "./reconciliation-review-tool";
import { loadDebtOverview } from "./debt-overview-tool";
import { loadReconciliationLookup } from "./reconciliation-lookup-tool";
import { loadOrganizationLookup } from "./organization-lookup-tool";
import { AGENT_MESSAGE_MAX_LENGTH, AGENT_TITLE_MAX_LENGTH } from "./contracts";
import { createOpenAIAgentProvider } from "./model-provider";
import { boundedConversationContext, orchestrateAgentTurn } from "./orchestration";

export class AgentAccessError extends Error {
  constructor() { super("Recurso no disponible."); this.name = "AgentAccessError"; }
}

export class AgentMessageValidationError extends Error {
  constructor() { super("El mensaje no es válido."); this.name = "AgentMessageValidationError"; }
}

export type AgentMessageDTO = { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: string };
export type AgentConversationDTO = {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  messages: AgentMessageDTO[];
};

function validatedMessage(content: string) {
  const value = content.normalize("NFKC").trim();
  if (!value || value.length > AGENT_MESSAGE_MAX_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || /<\/?[a-z][^>]*>/i.test(value)) throw new AgentMessageValidationError();
  return value;
}

async function requireActiveAccess(tx: Prisma.TransactionClient, administratorId: string, organizationId: string) {
  const membership = await tx.organizationAdministrator.findUnique({
    where: { administratorId_organizationId: { administratorId, organizationId } },
    select: { administrator: { select: { deletedAt: true } }, organization: { select: { status: true, deletedAt: true } } },
  });
  if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") throw new AgentAccessError();
}

function dto(row: {
  id: string; organizationId: string; title: string | null; status: "ACTIVE" | "ARCHIVED"; createdAt: Date; updatedAt: Date;
  organization: { name: string }; messages: Array<{ id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: Date }>;
}): AgentConversationDTO {
  return { id: row.id, organizationId: row.organizationId, organizationName: row.organization.name, title: row.title, status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), messages: row.messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })) };
}

const conversationSelect = {
  id: true, organizationId: true, title: true, status: true, createdAt: true, updatedAt: true,
  organization: { select: { name: true } },
  messages: { select: { id: true, role: true, content: true, createdAt: true }, orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
};

export async function createAgentConversation(administratorId: string, organizationId: string) {
  return prisma.$transaction(async (tx) => {
    await requireActiveAccess(tx, administratorId, organizationId);
    return dto(await tx.agentConversation.create({ data: { administratorId, organizationId }, select: conversationSelect }));
  });
}

export async function listAgentConversations(administratorId: string) {
  const rows = await prisma.agentConversation.findMany({
    where: { administratorId, status: "ACTIVE", administrator: { deletedAt: null }, organization: { status: "ACTIVE", deletedAt: null, administrators: { some: { administratorId } } } },
    select: conversationSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 50,
  });
  return rows.map(dto);
}

export async function listAgentOrganizations(administratorId: string) {
  const memberships = await prisma.organizationAdministrator.findMany({
    where: { administratorId, organization: { status: "ACTIVE", deletedAt: null } },
    select: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map(({ organization }) => organization);
}

export async function getAgentConversation(administratorId: string, conversationId: string) {
  const row = await prisma.agentConversation.findFirst({
    where: { id: conversationId, administratorId, administrator: { deletedAt: null }, organization: { status: "ACTIVE", deletedAt: null, administrators: { some: { administratorId } } } },
    select: conversationSelect,
  });
  if (!row) throw new AgentAccessError();
  return dto(row);
}

async function executeOperationalCapability(capability: Parameters<typeof executeAgentCapability>[0], input: Parameters<typeof executeAgentCapability>[1], administratorId: string, organizationId: string): Promise<AgentResponse> {
  return prisma.$transaction((tx) => executeAgentCapability(capability, input, {
      todayAttention: () => loadTodayAttention(tx, administratorId, organizationId),
      reconciliationReview: () => loadReconciliationReview(tx, administratorId, organizationId),
      debtOverview: () => loadDebtOverview(tx, administratorId),
      reconciliationLookup: (input) => loadReconciliationLookup(tx, administratorId, organizationId, input),
      organizationLookup: (query) => loadOrganizationLookup(tx, administratorId, query),
  }));
}

export async function sendAgentMessage(administratorId: string, conversationId: string, content: string) {
  const message = validatedMessage(content);
  const prepared = await prisma.$transaction(async (tx) => {
    const conversation = await tx.agentConversation.findFirst({
      where: { id: conversationId, administratorId, status: "ACTIVE", administrator: { deletedAt: null }, organization: { status: "ACTIVE", deletedAt: null, administrators: { some: { administratorId } } } },
      select: { id: true, organizationId: true, title: true, messages: { select: { role: true, content: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 8 } },
    });
    if (!conversation) throw new AgentAccessError();
    await tx.agentMessage.create({ data: { conversationId, organizationId: conversation.organizationId, role: "USER", content: message } });
    return { organizationId: conversation.organizationId, title: conversation.title, history: boundedConversationContext([...(conversation.messages ?? [])].reverse()) };
  });
  const response = await orchestrateAgentTurn(
    { message, history: prepared.history },
    createOpenAIAgentProvider(),
    (capability, input) => executeOperationalCapability(capability, input, administratorId, prepared.organizationId),
  );
  return prisma.$transaction(async (tx) => {
    await tx.agentMessage.create({ data: { conversationId, organizationId: prepared.organizationId, role: "ASSISTANT", content: response.message } });
    await tx.agentConversation.update({ where: { id: conversationId }, data: { title: prepared.title ?? message.slice(0, AGENT_TITLE_MAX_LENGTH), updatedAt: new Date() } });
    const updated = await tx.agentConversation.findFirst({ where: { id: conversationId, administratorId }, select: conversationSelect });
    if (!updated) throw new AgentAccessError();
    return { conversation: dto(updated), response };
  });
}
