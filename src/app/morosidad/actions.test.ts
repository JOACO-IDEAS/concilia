import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  revalidatePath: vi.fn(),
  detectar: vi.fn(),
  sendReminder: vi.fn(),
  administrator: vi.fn(),
  access: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/delinquency/detect-overdue", () => ({ detectarOrganizacionesEnMora: mocks.detectar }));
vi.mock("@/lib/whatsapp/send-reminder-whatsapp", () => ({ sendWhatsAppPaymentReminder: mocks.sendReminder }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: mocks.administrator }));
vi.mock("@/lib/auth/organization-access", () => ({ requireOrganizationAccess: mocks.access }));

const { enviarRecordatorioIndividual, getOverdueOrganizations } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.administrator.mockResolvedValue({ id: "admin-a" });
  mocks.detectar.mockResolvedValue([]);
  mocks.access.mockResolvedValue({ organizationId: "org-a" });
  mocks.sendReminder.mockResolvedValue({ ok: true, omitido: false });
});

describe("acciones de morosidad — aislamiento tenant", () => {
  it("consulta únicamente las organizaciones del administrador autenticado", async () => {
    await expect(getOverdueOrganizations()).resolves.toEqual({ ok: true, organizaciones: [] });
    expect(mocks.detectar).toHaveBeenCalledWith("admin-a");
  });

  it("deniega un recordatorio individual ajeno antes de enviar", async () => {
    mocks.access.mockRejectedValue(new Error("No tenés acceso a esta organización."));

    await expect(enviarRecordatorioIndividual("org-b")).rejects.toThrow("No tenés acceso");
    expect(mocks.sendReminder).not.toHaveBeenCalled();
  });

  it("vincula el envío individual autorizado con la identidad server-side", async () => {
    await expect(enviarRecordatorioIndividual("org-a")).resolves.toMatchObject({ ok: true });
    expect(mocks.access).toHaveBeenCalledWith("org-a");
    expect(mocks.sendReminder).toHaveBeenCalledWith("org-a", "admin-a");
  });
});
