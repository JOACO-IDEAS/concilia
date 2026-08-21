import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("prisma.config logging contract", () => {
  const source = readFileSync(join(process.cwd(), "prisma.config.ts"), "utf8");

  it("usa el formatter seguro y nunca concatena argv crudo en logs", () => {
    expect(source).toContain("describirComandoPrismaSeguro(argv.slice(2))");
    expect(source).not.toContain('argv.slice(2).join(" ")');
  });
});
