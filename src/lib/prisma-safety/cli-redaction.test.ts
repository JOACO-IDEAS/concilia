import { afterEach, describe, expect, it, vi } from "vitest";
import { CLI_SECRET_REDACTION, describirComandoPrismaSeguro, sanitizarArgumentosCli } from "./entornos";

const SENTINEL = "secret-with-%40-reserved%3Acharacters";
const URL = `postgresql://user:${SENTINEL}@fixtures.example/neondb?sslmode=require&channel_binding=require`;

afterEach(() => vi.restoreAllMocks());

describe("sanitizarArgumentosCli", () => {
  it("A: redacta por completo el valor separado de --url", () => {
    expect(sanitizarArgumentosCli(["migrate", "--url", URL])).toEqual(["migrate", "--url", CLI_SECRET_REDACTION]);
  });

  it("B: redacta por completo --url=VALUE", () => {
    expect(sanitizarArgumentosCli(["migrate", `--url=${URL}`])).toEqual(["migrate", `--url=${CLI_SECRET_REDACTION}`]);
  });

  it("C: no altera argumentos normales", () => {
    expect(sanitizarArgumentosCli(["migrate", "dev", "--name", "safe_name"])).toEqual(["migrate", "dev", "--name", "safe_name"]);
  });

  it("D/E: password reservado, host, database y query quedan totalmente ausentes", () => {
    const output = describirComandoPrismaSeguro(["migrate", "dev", "--url", URL]);
    expect(output).not.toContain(SENTINEL);
    expect(output).not.toContain("fixtures.example");
    expect(output).not.toContain("neondb");
    expect(output).not.toContain("channel_binding");
    expect(output).toBe(`migrate dev --url ${CLI_SECRET_REDACTION}`);
  });

  it("también redacta URLs sueltas y asignaciones datasource defensivamente", () => {
    expect(sanitizarArgumentosCli([URL, `DATABASE_URL=${URL}`, `DIRECT_URL=${URL}`])).toEqual([
      CLI_SECRET_REDACTION,
      `DATABASE_URL=${CLI_SECRET_REDACTION}`,
      `DIRECT_URL=${CLI_SECRET_REDACTION}`,
    ]);
  });

  it("F: el sentinel no aparece en stdout ni stderr del formato usado por el log", () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const safeCommand = describirComandoPrismaSeguro(["migrate", "dev", "--url", URL]);
    console.log(`[prisma-safety] comando riesgoso detectado ("${safeCommand}")`);
    console.error(`diagnóstico seguro: ${safeCommand}`);
    const captured = [...stdout.mock.calls, ...stderr.mock.calls].flat().join(" ");
    expect(captured).not.toContain(SENTINEL);
    expect(captured).not.toContain("postgresql://");
    expect(captured).toContain(CLI_SECRET_REDACTION);
  });
});
