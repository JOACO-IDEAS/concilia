import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import RevisionHumanaPage from "./page";

describe("RevisionHumanaPage — ruta histórica", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("redirige a la lista real de Conciliación, no a Inicio", () => {
    RevisionHumanaPage();
    expect(mocks.redirect).toHaveBeenCalledWith("/conciliacion");
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
  });
});
