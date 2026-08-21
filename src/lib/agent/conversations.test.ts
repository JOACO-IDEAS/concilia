import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), membership: vi.fn(), createConversation: vi.fn(), findConversation: vi.fn(), updateConversation: vi.fn(), listConversations: vi.fn(), createMessage: vi.fn(), decisionCount: vi.fn(), information: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, agentConversation: { findMany: mocks.listConversations, findFirst: mocks.findConversation }, organizationAdministrator: { findMany: vi.fn() } } }));

import { AgentAccessError, AgentMessageValidationError, createAgentConversation, getAgentConversation, listAgentConversations, sendAgentMessage } from "./conversations";

const now = new Date("2026-08-22T02:00:00Z");
function fullConversation(overrides = {}) {
  return { id: "conversation-a", organizationId: "org-a", title: null, status: "ACTIVE", createdAt: now, updatedAt: now, organization: { name: "Consorcio A" }, messages: [], ...overrides };
}

describe("Agent conversation persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membership.mockResolvedValue({ administrator: { deletedAt: null }, organization: { status: "ACTIVE", deletedAt: null } });
    mocks.createConversation.mockResolvedValue(fullConversation());
    mocks.findConversation.mockResolvedValue(fullConversation());
    mocks.updateConversation.mockResolvedValue({});
    mocks.createMessage.mockResolvedValue({});
    mocks.decisionCount.mockResolvedValue(0);
    mocks.information.mockResolvedValue([]);
    mocks.listConversations.mockResolvedValue([fullConversation()]);
    mocks.transaction.mockImplementation((callback) => callback({
      organizationAdministrator: { findUnique: mocks.membership },
      agentConversation: { create: mocks.createConversation, findFirst: mocks.findConversation, update: mocks.updateConversation },
      agentMessage: { create: mocks.createMessage },
      paymentEvidenceAssessmentLog: { count: mocks.decisionCount },
      paymentTransaction: { findMany: mocks.information },
    }));
  });

  it("authorized active membership creates a tenant-scoped conversation", async () => {
    await createAgentConversation("admin-a", "org-a");
    expect(mocks.createConversation).toHaveBeenCalledWith(expect.objectContaining({ data: { administratorId: "admin-a", organizationId: "org-a" } }));
  });

  it.each([
    null,
    { administrator: { deletedAt: new Date() }, organization: { status: "ACTIVE", deletedAt: null } },
    { administrator: { deletedAt: null }, organization: { status: "INACTIVE", deletedAt: null } },
  ])("rejects missing/inactive access", async (membership) => {
    mocks.membership.mockResolvedValueOnce(membership);
    await expect(createAgentConversation("admin-a", "org-a")).rejects.toBeInstanceOf(AgentAccessError);
    expect(mocks.createConversation).not.toHaveBeenCalled();
  });

  it("enumerates only the administrator's active tenant memberships", async () => {
    await listAgentConversations("admin-a");
    expect(mocks.listConversations.mock.calls[0][0].where).toMatchObject({ administratorId: "admin-a", status: "ACTIVE", administrator: { deletedAt: null }, organization: { status: "ACTIVE", deletedAt: null, administrators: { some: { administratorId: "admin-a" } } } });
  });

  it("cross-tenant read fails closed", async () => {
    mocks.findConversation.mockResolvedValueOnce(null);
    await expect(getAgentConversation("admin-a", "conversation-b")).rejects.toBeInstanceOf(AgentAccessError);
    expect(mocks.findConversation.mock.calls[0][0].where).toMatchObject({ id: "conversation-b", administratorId: "admin-a" });
  });

  it("writes user and assistant messages with the organization derived from the authorized conversation", async () => {
    mocks.findConversation.mockResolvedValueOnce({ id: "conversation-a", organizationId: "org-a", title: null }).mockResolvedValueOnce(fullConversation({ title: "¿Qué requiere mi atención hoy?" }));
    await sendAgentMessage("admin-a", "conversation-a", "¿Qué requiere mi atención hoy?");
    expect(mocks.createMessage.mock.calls.map(([arg]) => arg.data)).toEqual([
      expect.objectContaining({ conversationId: "conversation-a", organizationId: "org-a", role: "USER" }),
      expect.objectContaining({ conversationId: "conversation-a", organizationId: "org-a", role: "ASSISTANT" }),
    ]);
  });

  it("cross-tenant send fails closed before writing", async () => {
    mocks.findConversation.mockResolvedValueOnce(null);
    await expect(sendAgentMessage("admin-a", "conversation-b", "qué tengo pendiente")).rejects.toBeInstanceOf(AgentAccessError);
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "x".repeat(2_001), "<script>alert(1)</script>"])("rejects invalid message content", async (content) => {
    await expect(sendAgentMessage("admin-a", "conversation-a", content)).rejects.toBeInstanceOf(AgentMessageValidationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("persists a truthful unavailable response without invoking an operational tool", async () => {
    mocks.findConversation.mockResolvedValueOnce({ id: "conversation-a", organizationId: "org-a", title: null }).mockResolvedValueOnce(fullConversation());
    await sendAgentMessage("admin-a", "conversation-a", "Buscá un comprobante");
    expect(mocks.createMessage.mock.calls[1][0].data.content).toBe("Esta consulta todavía no está disponible en ConcilIA Agent.");
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it("never logs message content", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.findConversation.mockResolvedValueOnce({ id: "conversation-a", organizationId: "org-a", title: null }).mockResolvedValueOnce(fullConversation());
    await sendAgentMessage("admin-a", "conversation-a", "secreto personal");
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    log.mockRestore(); error.mockRestore();
  });
});
