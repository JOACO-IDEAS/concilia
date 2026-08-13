import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), client: vi.fn(), apiKeyPresent: vi.fn() }));
vi.mock("@/lib/notifications/resend-client", () => ({ obtenerClienteResend: mocks.client, resendApiKeyIsPresent: mocks.apiKeyPresent }));
vi.mock("./magic-link", () => ({ MAGIC_LINK_TTL_MS: 15 * 60 * 1000 }));

import { buildPilotMagicLinkEmail, pilotEmailConfigurationStatus, resolveMagicLinkOrigin, sendPilotMagicLink } from "./magic-link-email";

const env = { RESEND_API_KEY: "re_test", CONCILIA_APP_ORIGIN: "https://app.concilia.test", NOTIFICATIONS_FROM_EMAIL: "ConcilIA <access@concilia.test>", NODE_ENV: "production" } as NodeJS.ProcessEnv;

beforeEach(() => { vi.clearAllMocks(); mocks.apiKeyPresent.mockImplementation((candidate: NodeJS.ProcessEnv) => Boolean(candidate.RESEND_API_KEY?.trim())); mocks.client.mockReturnValue({ emails: { send: mocks.send } }); });

describe("magic link email", () => {
  it("envía texto y HTML con la misma URL y expiración real, sin llamadas reales", async () => {
    mocks.send.mockResolvedValue({ error: null });
    const token = "token_de_prueba";
    const result = await sendPilotMagicLink("pilot@concilia.test", token, env);
    const payload = mocks.send.mock.calls[0][0];
    expect(result).toEqual({ accepted: true });
    expect(payload.text).toContain("https://app.concilia.test/acceso/magic?token=token_de_prueba");
    expect(payload.html).toContain("https://app.concilia.test/acceso/magic?token=token_de_prueba");
    expect(payload.text).toContain("15 minutos");
    expect(payload.html).toContain("15 minutos");
  });

  it("rechaza origen ausente, manipulable o HTTP en producción sin enviar", async () => {
    expect(() => resolveMagicLinkOrigin({ ...env, CONCILIA_APP_ORIGIN: "https://user:pass@app.concilia.test" })).toThrow();
    expect(() => resolveMagicLinkOrigin({ ...env, CONCILIA_APP_ORIGIN: "http://app.concilia.test" })).toThrow();
    expect(() => buildPilotMagicLinkEmail("token", { ...env, CONCILIA_APP_ORIGIN: "https://app.concilia.test/path" })).toThrow();
    await expect(sendPilotMagicLink("pilot@concilia.test", "token", { ...env, CONCILIA_APP_ORIGIN: "" })).resolves.toEqual({ accepted: false, safeCode: "APP_ORIGIN_MISSING" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("clasifica rechazo, red y configuración sin registrar la URL ni el token", async () => {
    mocks.send.mockResolvedValue({ error: { statusCode: 422, message: "rejected" } });
    await expect(sendPilotMagicLink("pilot@concilia.test", "secret-token", env)).resolves.toEqual({ accepted: false, safeCode: "VALIDATION_ERROR" });
    mocks.send.mockRejectedValue(new Error("network"));
    await expect(sendPilotMagicLink("pilot@concilia.test", "secret-token", env)).resolves.toEqual({ accepted: false, safeCode: "NETWORK_ERROR" });
    mocks.client.mockReturnValue(null);
    await expect(sendPilotMagicLink("pilot@concilia.test", "secret-token", env)).resolves.toEqual({ accepted: false, safeCode: "CLIENT_UNAVAILABLE" });
  });

  it("separa causas de configuración sin enviar ni tocar Prisma", () => {
    expect(pilotEmailConfigurationStatus({ ...env, RESEND_API_KEY: undefined })).toEqual({ ready: false, safeCode: "API_KEY_MISSING" });
    expect(pilotEmailConfigurationStatus({ ...env, RESEND_API_KEY: " " })).toEqual({ ready: false, safeCode: "API_KEY_MISSING" });
    expect(pilotEmailConfigurationStatus({ ...env, NOTIFICATIONS_FROM_EMAIL: undefined })).toEqual({ ready: false, safeCode: "FROM_ADDRESS_MISSING" });
    expect(pilotEmailConfigurationStatus({ ...env, NOTIFICATIONS_FROM_EMAIL: " " })).toEqual({ ready: false, safeCode: "FROM_ADDRESS_MISSING" });
    expect(pilotEmailConfigurationStatus({ ...env, NOTIFICATIONS_FROM_EMAIL: "incorrecto" })).toEqual({ ready: false, safeCode: "FROM_ADDRESS_INVALID" });
    expect(pilotEmailConfigurationStatus({ ...env, CONCILIA_APP_ORIGIN: undefined })).toEqual({ ready: false, safeCode: "APP_ORIGIN_MISSING" });
    expect(pilotEmailConfigurationStatus({ ...env, CONCILIA_APP_ORIGIN: "http://app.concilia.test" })).toEqual({ ready: false, safeCode: "APP_ORIGIN_INVALID" });
    expect(pilotEmailConfigurationStatus(env)).toEqual({ ready: true });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
