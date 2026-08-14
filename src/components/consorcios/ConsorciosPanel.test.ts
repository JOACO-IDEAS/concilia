import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/lib/store";
import { ConsorciosPanel } from "./ConsorciosPanel";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const source = readFileSync(new URL("./ConsorciosPanel.tsx", import.meta.url), "utf8");

describe("ConsorciosPanel — procedencia e empty state", () => {
  it("muestra un estado honesto si no hay datos operativos", () => {
    expect(source).toContain("Todavía no hay datos operativos para mostrar");
    expect(source).toContain("Gestionar unidades");
  });

  it("renderiza HTML sin edificios, titulares ni métricas cuando el tenant sintético está vacío", () => {
    const html = renderToStaticMarkup(
      createElement(AppStoreProvider, null, createElement(ConsorciosPanel))
    );

    expect(html).toContain("Todavía no hay datos operativos para mostrar");
    expect(html).not.toMatch(/Cabildo 2450|Torres del Yacht|CUIT|Recaudación esperada/);
  });

  it("no importa fixtures directamente", () => {
    expect(source).not.toContain("mock-data");
  });
});
