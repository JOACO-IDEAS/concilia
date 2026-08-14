import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config — / es alcanzable como Inicio canónico", () => {
  it("no declara ningún redirect que saque a / de su propia ruta", async () => {
    const redirects = typeof nextConfig.redirects === "function" ? await nextConfig.redirects() : [];
    const rootRedirect = redirects.find((rule) => rule.source === "/");
    expect(rootRedirect).toBeUndefined();
  });
});
