import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Agent document result UI contract", () => {
  it("renders structured responsive cards without inventing a document link", () => {
    const source = readFileSync(new URL("./AgentWorkspace.tsx", import.meta.url), "utf8");
    const branch = source.slice(source.indexOf('presentation.kind === "DOCUMENT_LOOKUP"'), source.indexOf('return <div className="grid gap-3 sm:grid-cols-2">{presentation.organizations'));
    expect(branch).toContain("sm:grid-cols-2");
    expect(branch).toContain("Archivo no disponible");
    expect(branch).toContain("availability");
    expect(branch).not.toContain("ResultLink");
  });
});
