import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accessRequestMessage, INVALID_LINK_MESSAGE } from "./PilotAccessRequestForm";

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

  it("el mensaje de enlace inválido nunca distingue causa (anti-enumeración)", () => {
    expect(INVALID_LINK_MESSAGE).not.toMatch(/vencid|revocad|usad|inexistent|expir/i);
    expect(INVALID_LINK_MESSAGE.length).toBeGreaterThan(0);
  });

  it("declara la alerta de enlace inválido condicionada al prop, con el formulario siempre disponible", () => {
    const source = readFileSync(new URL("./PilotAccessRequestForm.tsx", import.meta.url), "utf8");
    expect(source).toContain('invalidLink = false');
    expect(source).toContain('role="alert"');
    expect(source).toContain('{invalidLink ? (');
    expect(source).toContain('INVALID_LINK_MESSAGE');
    // El <form> (y por lo tanto el input) no está condicionado por invalidLink.
    expect(source).toMatch(/<form[^>]*onSubmit=\{submit\}/);
  });

  it("declara instrucciones de expiración y spam sin prometer entrega", () => {
    const source = readFileSync(new URL("./PilotAccessRequestForm.tsx", import.meta.url), "utf8");
    expect(source).toContain("15 minutos");
    expect(source).toContain("spam");
    expect(source).not.toMatch(/vas a recibir|te enviamos|email enviado/i);
  });
});
