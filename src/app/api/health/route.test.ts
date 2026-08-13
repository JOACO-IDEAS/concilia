import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ status: vi.fn(), organizationCount: vi.fn(), paymentCount: vi.fn() }));
vi.mock("@/lib/auth/magic-link-email", () => ({ pilotEmailConfigurationStatus: mocks.status }));
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { count: mocks.organizationCount }, paymentTransaction: { count: mocks.paymentCount } } }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockReturnValue({ ready: false, safeCode: "API_KEY_MISSING" });
  mocks.organizationCount.mockResolvedValue(1);
  mocks.paymentCount.mockResolvedValue(2);
});

describe("GET /api/health", () => {
  it("no expone readiness ni secretos en el body público", async () => {
    const response = await GET(new NextRequest("https://concilia.test/api/health"));
    const body = await response.text();
    expect(body).not.toContain("API_KEY_MISSING");
    expect(body).not.toContain("RESEND_API_KEY");
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("emite un único evento allowlisted sólo para el check explícito", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await GET(new NextRequest("https://concilia.test/api/health?check=pilot-email-readiness"));
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: "PILOT_EMAIL_CONFIG_NOT_READY", safeCode: "API_KEY_MISSING" }));
    expect(info.mock.calls.flat().join(" ")).not.toMatch(/re_test|https:|@/);
    info.mockRestore();
  });

  it("registra readiness lista sin incluir configuración", async () => {
    mocks.status.mockReturnValue({ ready: true });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await GET(new NextRequest("https://concilia.test/api/health?check=pilot-email-readiness"));
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: "PILOT_EMAIL_CONFIG_READY" }));
    info.mockRestore();
  });
});
