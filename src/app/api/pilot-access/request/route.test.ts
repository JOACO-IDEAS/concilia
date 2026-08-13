import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enforce: vi.fn(), ip: vi.fn(), issue: vi.fn(), send: vi.fn(), activate: vi.fn() }));
vi.mock("@/lib/auth/pilot-rate-limit", () => ({ enforcePilotRateLimit: mocks.enforce, trustedVercelClientIp: mocks.ip, PilotRateLimitUnavailableError: class PilotRateLimitUnavailableError extends Error {} }));
vi.mock("@/lib/auth/magic-link", () => ({ normalizeEmail: (value: string) => value.trim().toLowerCase(), issuePilotMagicLink: mocks.issue, activatePilotMagicLink: mocks.activate }));
vi.mock("@/lib/auth/magic-link-email", () => ({ sendPilotMagicLink: mocks.send }));

import { POST } from "./route";

function request(email = "known@concilia.test") {
  const form = new FormData(); form.set("email", email);
  return new Request("https://concilia.test/api/pilot-access/request", { method: "POST", body: form });
}

type TelemetryLine = { event: string; safeCode?: string; prismaCode?: string; runtime: string };

function telemetry(spy: { mock: { calls: unknown[][] } }): TelemetryLine[] {
  return spy.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])) as TelemetryLine);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ip.mockReturnValue("203.0.113.10");
  mocks.enforce.mockResolvedValue({ allowed: true });
});

describe("POST /api/pilot-access/request", () => {
  it("devuelve 429 genérico con Retry-After y no emite telemetría cuando está bloqueado", async () => {
    mocks.enforce.mockResolvedValue({ allowed: false, retryAfterSeconds: 123 });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("123");
    expect(await response.json()).toEqual({ error: "access_temporarily_unavailable" });
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("mantiene la misma respuesta pública para identidad conocida y desconocida", async () => {
    mocks.issue.mockResolvedValueOnce(null).mockResolvedValueOnce({ token: "secret-token", administratorId: "admin-a" });
    mocks.send.mockResolvedValue({ accepted: false, safeCode: "RECIPIENT_NOT_ALLOWED" });
    const unknown = await POST(request("unknown@concilia.test"));
    const known = await POST(request());
    expect(unknown.status).toBe(known.status);
    expect(unknown.headers.get("location")).toBe(known.headers.get("location"));
  });

  it("registra aceptación y activación exitosa sin filtrar secretos", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.issue.mockResolvedValue({ token: "secret-token", administratorId: "admin-a" }); mocks.send.mockResolvedValue({ accepted: true }); mocks.activate.mockResolvedValue(true);
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(mocks.activate).toHaveBeenCalledWith("secret-token");
    expect(telemetry(info)).toEqual([
      expect.objectContaining({ event: "PILOT_EMAIL_PROVIDER_ACCEPTED" }),
      expect.objectContaining({ event: "PILOT_TOKEN_ACTIVATED" }),
    ]);
    expect(info.mock.calls.flat().join(" ")).not.toMatch(/known@|secret-token|https:|203\.0\.113/);
    info.mockRestore();
  });

  it("registra rechazo del proveedor sin activar ni exponer el mensaje crudo", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.issue.mockResolvedValue({ token: "secret-token", administratorId: "admin-a" }); mocks.send.mockResolvedValue({ accepted: false, safeCode: "VALIDATION_ERROR" });
    const response = await POST(request());
    expect(response.headers.get("location")).toBe("https://concilia.test/acceso?requested=1");
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(telemetry(info)).toEqual([expect.objectContaining({ event: "PILOT_EMAIL_PROVIDER_REJECTED", safeCode: "VALIDATION_ERROR" })]);
    expect(info.mock.calls.flat().join(" ")).not.toMatch(/known@|secret-token|payload/);
    info.mockRestore();
  });

  it("registra rechazo de red con el código seguro y no activa", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.issue.mockResolvedValue({ token: "secret-token", administratorId: "admin-a" }); mocks.send.mockResolvedValue({ accepted: false, safeCode: "NETWORK_ERROR" });
    await POST(request());
    expect(telemetry(info)).toEqual([expect.objectContaining({ event: "PILOT_EMAIL_PROVIDER_REJECTED", safeCode: "NETWORK_ERROR" })]);
    expect(mocks.activate).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("registra aceptación seguida de activación no aplicada, sin marcarla activada", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.issue.mockResolvedValue({ token: "secret-token", administratorId: "admin-a" }); mocks.send.mockResolvedValue({ accepted: true }); mocks.activate.mockResolvedValue(false);
    await POST(request());
    expect(telemetry(info)).toEqual([
      expect.objectContaining({ event: "PILOT_EMAIL_PROVIDER_ACCEPTED" }),
      expect.objectContaining({ event: "PILOT_TOKEN_ACTIVATION_FAILED", safeCode: "ACTIVATION_NOT_APPLIED" }),
    ]);
    expect(telemetry(info).some((line: TelemetryLine) => line.event === "PILOT_TOKEN_ACTIVATED")).toBe(false);
    info.mockRestore();
  });

  it("registra el código Prisma allowlisted si la activación lanza", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.issue.mockResolvedValue({ token: "secret-token", administratorId: "admin-a" }); mocks.send.mockResolvedValue({ accepted: true }); mocks.activate.mockRejectedValue({ code: "P2028", message: "raw database error with secret-token" });
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(telemetry(info)).toEqual([
      expect.objectContaining({ event: "PILOT_EMAIL_PROVIDER_ACCEPTED" }),
      expect.objectContaining({ event: "PILOT_TOKEN_ACTIVATION_FAILED", safeCode: "PRISMA_ERROR", prismaCode: "P2028" }),
    ]);
    expect(info.mock.calls.flat().join(" ")).not.toContain("raw database error");
    info.mockRestore();
  });

  it("no registra telemetría de identidad desconocida", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.issue.mockResolvedValue(null);
    await POST(request("unknown@concilia.test"));
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
