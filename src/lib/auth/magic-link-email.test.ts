import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/notifications/resend-client", () => ({ obtenerClienteResend: mocks.client, REMITENTE_EMAIL: "ConcilIA <access@concilia.test>" }));
vi.mock("./magic-link", () => ({ MAGIC_LINK_TTL_MS: 15 * 60 * 1000 }));

import { buildPilotMagicLinkEmail, resolveMagicLinkOrigin, sendPilotMagicLink } from "./magic-link-email";

const env = { CONCILIA_APP_ORIGIN: "https://app.concilia.test", NOTIFICATIONS_FROM_EMAIL: "ConcilIA <access@concilia.test>", NODE_ENV: "production" } as NodeJS.ProcessEnv;

beforeEach(() => { vi.clearAllMocks(); mocks.client.mockReturnValue({ emails: { send: mocks.send } }); });

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
    await expect(sendPilotMagicLink("pilot@concilia.test", "token", { ...env, CONCILIA_APP_ORIGIN: "" })).resolves.toEqual({ accepted: false, safeCode: "INVALID_ORIGIN" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("clasifica rechazo, red y configuración sin registrar la URL ni el token", async () => {
    mocks.send.mockResolvedValue({ error: { statusCode: 422, message: "rejected" } });
    await expect(sendPilotMagicLink("pilot@concilia.test", "secret-token", env)).resolves.toEqual({ accepted: false, safeCode: "VALIDATION_ERROR" });
    mocks.send.mockRejectedValue(new Error("network"));
    await expect(sendPilotMagicLink("pilot@concilia.test", "secret-token", env)).resolves.toEqual({ accepted: false, safeCode: "NETWORK_ERROR" });
    mocks.client.mockReturnValue(null);
    await expect(sendPilotMagicLink("pilot@concilia.test", "secret-token", env)).resolves.toEqual({ accepted: false, safeCode: "CONFIGURATION_MISSING" });
  });
});
