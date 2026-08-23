import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("./AgentWorkspace.tsx", import.meta.url), "utf8");

describe("ConcilIA Agent route and UX contract", () => {
  it("protects the route server-side with the existing session authority", () => {
    expect(page).toContain("requireCurrentAdministrator()");
    expect(page).toContain('redirect("/acceso")');
  });

  it("has truthful empty state suggestions for real capabilities", () => {
    expect(workspace).toContain("¿Qué necesitás resolver?");
    expect(workspace).toContain("Preguntá con tus propias palabras");
    expect(workspace).toContain("¿Qué pagos necesitan revisión?");
    expect(workspace).toContain("¿Dónde tengo mayor mora?");
  });

  it("TASK 5.3D.1 — DOCUMENT_LOOKUP ya es una capability AVAILABLE real: el empty state puede sugerirla honestamente", () => {
    expect(workspace).toContain("Buscame una factura o comprobante.");
  });

  it("renders bounded structured cards with safe product links", () => {
    expect(workspace).toContain("AgentStructuredResult");
    expect(workspace).toContain("Revisar caso");
    expect(workspace).toContain("Ver movimiento");
    expect(workspace).toContain("Ver consorcio");
    expect(workspace).not.toMatch(/payerIdentifier|bankAccount|phone|email|fingerprint/);
  });

  it("supports accessible keyboard composer behavior and safe limits", () => {
    expect(workspace).toContain('event.key === "Enter" && !event.shiftKey');
    expect(workspace).toContain('placeholder="Preguntale a ConcilIA..."');
    expect(workspace).toContain('aria-label="Enviar mensaje"');
    expect(workspace).toContain("maxLength={AGENT_MESSAGE_MAX_LENGTH}");
    expect(workspace).toContain("Consultando ConcilIA...");
  });

  it("has responsive history and 44px touch targets without horizontal overflow", () => {
    expect(workspace).toContain("min-w-0");
    expect(workspace).toContain("overflow-hidden");
    expect(workspace).toContain("lg:hidden");
    expect(workspace).toContain("lg:flex");
    expect(workspace).toContain("min-h-11");
    expect(workspace).toContain("h-11 w-11");
  });

  it("TASK 5.3D.1 — marca la conversación activa con aria-current, igual que el Sidebar marca la ruta activa", () => {
    expect(workspace).toContain('aria-current={activeId === conversation.id ? "true" : undefined}');
  });

  it("renders message content as escaped React text, not HTML", () => {
    expect(workspace).toContain("{message.content}");
    expect(workspace).not.toContain("dangerouslySetInnerHTML");
  });
});
