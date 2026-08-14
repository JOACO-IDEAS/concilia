import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./RecentActivity.tsx", import.meta.url), "utf8");

describe("RecentActivity — dentro de Inicio, con estados distinguibles", () => {
  it("distingue 'no disponible' (problema de infraestructura) de 'sin actividad todavía' (esperable) — dos mensajes distintos", () => {
    expect(source).toContain("no está disponible en este entorno todavía");
    expect(source).toContain("Todavía no hay actividad operativa para mostrar");
    expect(source).toMatch(/status === "unavailable"/);
  });

  it("no aparece registrada como ítem del sidebar — es un componente de sección, no una ruta", () => {
    expect(source).not.toMatch(/href=["']\/actividad["']/);
  });
});
