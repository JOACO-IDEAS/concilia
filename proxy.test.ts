import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE_NAME } from "./src/lib/auth/session";
import { proxy } from "./proxy";

const env = { CONCILIA_SESSION_SECRET: "12345678901234567890123456789012" } as unknown as NodeJS.ProcessEnv;
const originalSecret = process.env.CONCILIA_SESSION_SECRET;

beforeEach(() => { process.env.CONCILIA_SESSION_SECRET = env.CONCILIA_SESSION_SECRET; });
afterEach(() => {
  if (originalSecret === undefined) delete process.env.CONCILIA_SESSION_SECRET;
  else process.env.CONCILIA_SESSION_SECRET = originalSecret;
});

describe("proxy de rutas privadas", () => {
  it("mantiene acceso y health públicos", () => {
    expect(proxy(new NextRequest("https://concilia.test/acceso")).status).toBe(200);
    expect(proxy(new NextRequest("https://concilia.test/api/health")).status).toBe(200);
  });
  it("redirige páginas privadas sin sesión, malformada o expirada", () => {
    const expired = createSessionToken("admin@concilia.test", 0, env);
    for (const cookie of [undefined, "falsificada", expired]) {
      const response = proxy(new NextRequest("https://concilia.test/bandeja-de-trabajo", { headers: cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {} }));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://concilia.test/acceso");
    }
  });
  it("responde 401 para APIs privadas anónimas y deja pasar una sesión firmada", () => {
    expect(proxy(new NextRequest("https://concilia.test/api/private")).status).toBe(401);
    const token = createSessionToken("admin@concilia.test", Date.now(), env);
    const response = proxy(new NextRequest("https://concilia.test/conciliacion", { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } }));
    expect(response.status).toBe(200);
  });
});
