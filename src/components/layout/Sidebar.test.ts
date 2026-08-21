import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { focusTrapTarget } from "./Sidebar";

const source = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");

describe("focusTrapTarget — trampa de foco del drawer móvil (sin DOM, lógica pura)", () => {
  it("Tab en el último elemento vuelve al primero", () => {
    expect(focusTrapTarget({ key: "Tab", shiftKey: false, isFirst: false, isLast: true, hasFocusable: true })).toBe("first");
  });

  it("Shift+Tab en el primer elemento vuelve al último", () => {
    expect(focusTrapTarget({ key: "Tab", shiftKey: true, isFirst: true, isLast: false, hasFocusable: true })).toBe("last");
  });

  it("Tab en un elemento intermedio no interviene — deja el comportamiento normal del navegador", () => {
    expect(focusTrapTarget({ key: "Tab", shiftKey: false, isFirst: false, isLast: false, hasFocusable: true })).toBeNull();
  });

  it("Shift+Tab en el último elemento no interviene (no es el primero)", () => {
    expect(focusTrapTarget({ key: "Tab", shiftKey: true, isFirst: false, isLast: true, hasFocusable: true })).toBeNull();
  });

  it("ninguna tecla que no sea Tab activa la trampa", () => {
    expect(focusTrapTarget({ key: "Enter", shiftKey: false, isFirst: true, isLast: true, hasFocusable: true })).toBeNull();
  });

  it("sin elementos enfocables, nunca intenta enfocar nada", () => {
    expect(focusTrapTarget({ key: "Tab", shiftKey: false, isFirst: false, isLast: true, hasFocusable: false })).toBeNull();
  });
});

describe("Sidebar — navegación canónica del piloto", () => {
  it("contiene los 5 destinos canónicos, incluido Agente", () => {
    expect(source).toContain('{ href: "/", label: "Inicio"');
    expect(source).toContain('{ href: "/agente", label: "Agente"');
    expect(source).toContain('{ href: "/conciliacion", label: "Conciliación"');
    expect(source).toContain('{ href: "/consorcios", label: "Consorcios"');
    expect(source).toContain('{ href: "/configuracion", label: "Configuración"');
  });

  it("no expone módulos experimentales, incompletos, huérfanos o de diagnóstico", () => {
    const prohibited = [
      "/ia",
      "/conversaciones",
      "/dashboard",
      "/morosidad",
      "/reportes",
      "/panel-operativo",
      "/bandeja-de-trabajo",
      "/unidades-config",
      "/unidades",
      "/obligaciones",
      "/importar",
      "/actividad",
      "shadow-matching",
    ];
    for (const path of prohibited) {
      expect(source).not.toContain(`href: "${path}"`);
    }
  });

  it("usa íconos vectoriales de lucide-react, sin ningún emoji en la navegación (UX.3.1)", () => {
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiPattern.test(source)).toBe(false);
    expect(source).toContain('from "lucide-react"');
    expect(source).toMatch(/icon: (Home|Bot|InboxIcon|Building2|Settings)/);
  });

  it("el drawer móvil respeta el ancho máximo min(320px, 86vw)", () => {
    expect(source).toContain("w-[min(320px,86vw)]");
  });

  it("gestiona foco: inicial en el cierre, trampa de Tab y retorno al activador", () => {
    expect(source).toContain("closeButtonRef.current?.focus()");
    expect(source).toContain("previouslyFocused.current?.focus()");
    expect(source).toMatch(/e\.key !== "Tab"/);
  });

  it("Escape cierra el drawer, el backdrop es clickeable, y el scroll de fondo queda bloqueado mientras está abierto", () => {
    expect(source).toMatch(/e\.key === "Escape"/);
    expect(source).toContain("onClick={close}");
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain('document.body.style.overflow = ""');
  });

  it("el drawer se anuncia como diálogo modal para lectores de pantalla", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });
});
