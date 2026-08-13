import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ valid: vi.fn(), establish: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({
  bootstrapCredentialsAreValid: mocks.valid,
  establishSessionForEmail: mocks.establish,
}));

import { iniciarSesionAction } from "./actions";

describe("iniciarSesionAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("lleva una sesión válida al Operational Inbox", async () => {
    mocks.valid.mockReturnValue(true);
    const form = new FormData();
    form.set("email", "admin@example.com");
    form.set("password", "secret");

    await iniciarSesionAction(form);

    expect(mocks.establish).toHaveBeenCalledWith("admin@example.com");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
