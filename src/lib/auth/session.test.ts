import { describe, expect, it } from "vitest";
import { bootstrapCredentialsAreValid, createSessionToken, parseSessionToken } from "./session";

const env = {
  CONCILIA_SESSION_SECRET: "12345678901234567890123456789012",
  CONCILIA_BOOTSTRAP_ADMIN_EMAIL: "admin@concilia.test",
  CONCILIA_BOOTSTRAP_ADMIN_PASSWORD: "correcta",
} as unknown as NodeJS.ProcessEnv;

describe("sesión firmada", () => {
  it("acepta sólo credenciales bootstrap configuradas", () => {
    expect(bootstrapCredentialsAreValid("admin@concilia.test", "correcta", env)).toBe(true);
    expect(bootstrapCredentialsAreValid("otro@concilia.test", "correcta", env)).toBe(false);
  });

  it("no acepta una sesión alterada o expirada", () => {
    const now = Date.UTC(2026, 0, 1);
    const token = createSessionToken("admin@concilia.test", now, env);
    expect(parseSessionToken(token, now, env)?.email).toBe("admin@concilia.test");
    expect(parseSessionToken(`${token}x`, now, env)).toBeNull();
    expect(parseSessionToken(token, now + 9 * 60 * 60 * 1000, env)).toBeNull();
  });
});
