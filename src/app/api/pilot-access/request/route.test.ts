import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enforce: vi.fn(), ip: vi.fn(), issue: vi.fn(), send: vi.fn(), activate: vi.fn() }));
vi.mock("@/lib/auth/pilot-rate-limit", () => ({ enforcePilotRateLimit: mocks.enforce, trustedVercelClientIp: mocks.ip, PilotRateLimitUnavailableError: class PilotRateLimitUnavailableError extends Error {} }));
vi.mock("@/lib/auth/magic-link", () => ({ normalizeEmail: (value: string) => value.trim().toLowerCase(), issuePilotMagicLink: mocks.issue, activatePilotMagicLink: mocks.activate }));
vi.mock("@/lib/auth/magic-link-email", () => ({ sendPilotMagicLink: mocks.send }));

import { POST } from "./route";

beforeEach(() => { vi.clearAllMocks(); mocks.ip.mockReturnValue("203.0.113.10"); });

describe("POST /api/pilot-access/request", () => {
  it("devuelve 429 genérico con Retry-After y no crea token cuando está bloqueado", async () => {
    mocks.enforce.mockResolvedValue({ allowed: false, retryAfterSeconds: 123 });
    const form = new FormData(); form.set("email", "known@concilia.test");
    const response = await POST(new Request("https://concilia.test/api/pilot-access/request", { method: "POST", body: form }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("123");
    expect(await response.json()).toEqual({ error: "access_temporarily_unavailable" });
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("mantiene una respuesta de éxito idéntica para una cuenta desconocida", async () => {
    mocks.enforce.mockResolvedValue({ allowed: true }); mocks.issue.mockResolvedValue(null);
    const form = new FormData(); form.set("email", "unknown@concilia.test");
    const response = await POST(new Request("https://concilia.test/api/pilot-access/request", { method: "POST", body: form }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://concilia.test/acceso?requested=1");
  });

  it("activa sólo el token cuya entrega fue aceptada", async () => {
    mocks.enforce.mockResolvedValue({ allowed: true }); mocks.issue.mockResolvedValue({ token: "secret-token", administratorId: "admin-a" }); mocks.send.mockResolvedValue({ accepted: true }); mocks.activate.mockResolvedValue(true);
    const form = new FormData(); form.set("email", "known@concilia.test");
    await POST(new Request("https://concilia.test/api/pilot-access/request", { method: "POST", body: form }));
    expect(mocks.issue).toHaveBeenCalledWith("known@concilia.test", { initiallyRevoked: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.activate).toHaveBeenCalledWith("secret-token");
  });

  it("no activa el token si el proveedor falla y nunca devuelve el enlace al navegador", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.enforce.mockResolvedValue({ allowed: true }); mocks.issue.mockResolvedValue({ token: "secret-token", administratorId: "admin-a" }); mocks.send.mockResolvedValue({ accepted: false, category: "transient" });
    const form = new FormData(); form.set("email", "known@concilia.test");
    const response = await POST(new Request("https://concilia.test/api/pilot-access/request", { method: "POST", body: form }));
    expect(response.headers.get("location")).toBe("https://concilia.test/acceso?requested=1");
    expect(response.headers.get("location")).not.toContain("secret-token");
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[pilot-access] magic-link delivery failed category=transient");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("secret-token");
    warn.mockRestore();
  });
});
