import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ valid: vi.fn(), establish: vi.fn(), clear: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({
  bootstrapCredentialsAreValid: mocks.valid,
  establishSessionForEmail: mocks.establish,
  clearSession: mocks.clear,
}));

import { iniciarSesionAction, logoutAction } from "./actions";

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

describe("logoutAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("borra la sesión y redirige siempre al mismo destino fijo", async () => {
    mocks.clear.mockResolvedValue(undefined);
    await logoutAction();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/acceso");
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
  });

  it("es idempotente: repetir el logout no falla aunque ya no exista sesión", async () => {
    mocks.clear.mockResolvedValue(undefined);
    await logoutAction();
    await logoutAction();
    expect(mocks.clear).toHaveBeenCalledTimes(2);
    expect(mocks.redirect).toHaveBeenNthCalledWith(1, "/acceso");
    expect(mocks.redirect).toHaveBeenNthCalledWith(2, "/acceso");
  });
});
