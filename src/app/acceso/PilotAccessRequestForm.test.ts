import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accessRequestMessage } from "./PilotAccessRequestForm";

describe("PilotAccessRequestForm", () => {
  it("mantiene mensajes genéricos y no devuelve JSON técnico", () => {
    expect(accessRequestMessage(303)).toBe("Si la dirección está habilitada, recibirás un enlace de acceso en los próximos minutos.");
    expect(accessRequestMessage(429)).toBe("Se realizaron demasiados intentos. Esperá unos minutos antes de volver a probar.");
    expect(accessRequestMessage(503)).toBe("El acceso no está disponible temporalmente. Intentá nuevamente más tarde.");
  });

  it("declara controles de submit único, accesibilidad y contraste acotado", () => {
    const source = readFileSync(new URL("./PilotAccessRequestForm.tsx", import.meta.url), "utf8");
    expect(source).toContain('event.preventDefault()');
    expect(source).toContain('if (submitting) return');
    expect(source).toContain('disabled={submitting}');
    expect(source).toContain('htmlFor="pilot-access-email"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('text-slate-950');
    expect(source).toContain('focus:ring-2');
    expect(source).not.toContain('action="/api/pilot-access/request"');
  });
});
