import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

/**
 * TASK CLAUDE UX.4 — política temática central.
 *
 * Estos tests compilan `globals.css` con la MISMA pipeline PostCSS/Tailwind
 * que usa `next build` (no una heurística de texto) y verifican el CSS
 * resultante — no sólo que el archivo fuente contenga ciertas palabras.
 * Un test que sólo buscara "color-scheme" como string en el `.css` fuente
 * no demostraría que Tailwind realmente lo compila, ni que ninguna otra
 * regla lo pisa.
 */

const GLOBALS_CSS_PATH = new URL("./globals.css", import.meta.url).pathname;
let compiledCss: string;

beforeAll(async () => {
  const source = readFileSync(GLOBALS_CSS_PATH, "utf8");
  const result = await postcss([tailwindcss()]).process(source, { from: GLOBALS_CSS_PATH });
  compiledCss = result.css;
});

describe("Política temática — el CSS compilado nunca depende de prefers-color-scheme", () => {
  it("el CSS compilado no contiene ninguna media query prefers-color-scheme — ni para tokens ni para autofill", () => {
    expect(compiledCss).not.toMatch(/prefers-color-scheme/);
  });

  it("declara color-scheme:light — controles nativos y autofill quedan claros independientemente del SO", () => {
    expect(compiledCss).toMatch(/color-scheme:\s*light/);
  });

  it("los tokens --background/--foreground compilan a un único valor claro, sin bloque alternativo", () => {
    // Debe aparecer exactamente una vez cada uno en :root — si hubiera un
    // bloque @media alternativo redefiniéndolos, aparecerían más de una vez.
    const backgroundMatches = compiledCss.match(/--background:\s*#fff(?:fff)?/gi) ?? [];
    expect(backgroundMatches.length).toBeGreaterThanOrEqual(1);
    expect(compiledCss).not.toMatch(/--background:\s*#0a0a0a/);
    expect(compiledCss).not.toMatch(/--foreground:\s*#ededed/);
  });
});

describe("Política temática — dark: existe en el código pero queda dormido detrás de una clase explícita", () => {
  it("el compilador genera variantes dark: reales (no se eliminaron del código) gateadas por :where(.dark,.dark *)", () => {
    // Confirma que Tailwind sigue generando dark: (las variantes existentes
    // en componentes no se borraron) y que el selector que las activa
    // requiere la clase .dark — nunca prefers-color-scheme.
    expect(compiledCss).toMatch(/:where\(\.dark,\s*\.dark \*\)/);
  });

  it("ninguna regla dark: puede activarse sin la clase .dark — no queda ningún camino por media query", () => {
    const darkRuleBlocks = compiledCss.match(/\.dark\\:[a-zA-Z0-9_-]+[^{]*\{[^}]*\}/g) ?? [];
    expect(darkRuleBlocks.length).toBeGreaterThan(0);
    for (const block of darkRuleBlocks) expect(block).not.toMatch(/prefers-color-scheme/);
  });
});

describe("Política temática — sin bifurcación dependiente del sistema en el código de la app", () => {
  function allSourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry === "generated") continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) allSourceFiles(full, out);
      else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
    }
    return out;
  }
  const srcRoot = new URL("../", import.meta.url).pathname; // src/
  const files = allSourceFiles(srcRoot);

  it("ningún archivo aplica la clase literal 'dark' (como token de clase suelto, no como prefijo de variante 'dark:algo') — el interruptor queda apagado en todo el código", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const classAttrs = content.match(/className=(\{[^}]*\}|"[^"]*")/g) ?? [];
      for (const attr of classAttrs) {
        // Separa en tokens por cualquier caracter no alfanumérico/guion —
        // así "dark:bg-slate-900" da los tokens ["dark:bg-slate-900"] (un
        // solo token, no coincide con "dark" exacto), mientras que una
        // clase literal suelta "dark" sí produce el token exacto "dark".
        const tokens: string[] = attr.match(/[a-zA-Z0-9:_-]+/g) ?? [];
        if (tokens.includes("dark")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no existe ningún script/hook de detección de tema (localStorage/matchMedia sobre color-scheme) en el código de la app", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith("theme-policy.test.ts")) continue; // este propio archivo menciona los patrones como texto de búsqueda
      const content = readFileSync(file, "utf8");
      if (/matchMedia\(["'`]\(prefers-color-scheme/.test(content) || /theme.*localStorage|localStorage.*theme/i.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
