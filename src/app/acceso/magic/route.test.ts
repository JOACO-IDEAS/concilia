import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enforce: vi.fn(), ip: vi.fn(), consume: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/auth/pilot-rate-limit", () => ({ enforcePilotRateLimit: mocks.enforce, trustedVercelClientIp: mocks.ip, PilotRateLimitUnavailableError: class PilotRateLimitUnavailableError extends Error {} }));
vi.mock("@/lib/auth/magic-link", () => ({ consumePilotMagicLink: mocks.consume }));
vi.mock("@/lib/auth/session", () => ({ SESSION_COOKIE_NAME: "concilia_session", SESSION_MAX_AGE_SECONDS: 28800, createSessionToken: mocks.token }));

import { GET } from "./route";

beforeEach(() => { vi.clearAllMocks(); mocks.ip.mockReturnValue("203.0.113.20"); });

describe("GET /acceso/magic", () => {
  it("devuelve 429 seguro y no consume un token válido cuando está bloqueado", async () => {
    mocks.enforce.mockResolvedValue({ allowed: false, retryAfterSeconds: 45 });
    const response = await GET(new Request("https://concilia.test/acceso/magic?token=valid-token"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it("redirige de forma genérica cuando el token no es válido", async () => {
    mocks.enforce.mockResolvedValue({ allowed: true }); mocks.consume.mockResolvedValue(null);
    const response = await GET(new Request("https://concilia.test/acceso/magic?token=invalid"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://concilia.test/acceso?invalid-link=1");
  });
});
