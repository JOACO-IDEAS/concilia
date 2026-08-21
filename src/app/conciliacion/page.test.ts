import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Conciliación (page) — copy del Topbar (TASK 5.0I.1)", () => {
  it("el título coincide con el label del Sidebar — misma palabra para el mismo lugar", () => {
    expect(source).toContain('title="Conciliación"');
  });

  it("no usa jerga técnica ('match') ni promete '1 clic' para todos los casos (ambiguos/insuficientes no lo son)", () => {
    expect(source).not.toMatch(/\bmatch\b/i);
    expect(source).not.toMatch(/1 clic/i);
  });
});
