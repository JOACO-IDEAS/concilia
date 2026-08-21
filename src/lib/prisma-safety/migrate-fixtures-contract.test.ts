import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("migrate-fixtures endpoint contract", () => {
  const orchestrator = readFileSync(join(process.cwd(), "scripts/prisma-safety/migrate-fixtures.mts"), "utf8");
  const shell = readFileSync(join(process.cwd(), "scripts/prisma-safety/migrate-fixtures.sh"), "utf8");

  it("entrega el mismo plan.endpoint al preflight y a prisma migrate", () => {
    expect(orchestrator).toContain('ejecutarPreflightReadOnly(plan.endpoint, "fixtures")');
    expect(orchestrator).toContain('["prisma", "migrate", "dev", "--url", plan.endpoint');
  });

  it("el shell no vuelve a resolver DATABASE_URL ni imprime la credencial", () => {
    expect(shell).not.toContain("DATABASE_URL");
    expect(shell).not.toContain("FIXTURES_URL");
    expect(shell).toContain("migrate-fixtures.mts");
  });
});
