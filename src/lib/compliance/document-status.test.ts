import { describe, expect, it } from "vitest";
import { calcularEstadoDocumento } from "./document-status";

const AHORA = new Date("2026-08-08T12:00:00.000Z");

describe("calcularEstadoDocumento", () => {
  it("documento sin vencimiento (validTo=null) → SIN_VENCIMIENTO, nunca VALID ni EXPIRED", () => {
    expect(calcularEstadoDocumento({ validTo: null }, { ahora: AHORA })).toBe("SIN_VENCIMIENTO");
  });

  it("vencimiento futuro, fuera de la ventana → VALID", () => {
    const validTo = new Date("2026-12-01T00:00:00.000Z");
    expect(calcularEstadoDocumento({ validTo }, { ahora: AHORA })).toBe("VALID");
  });

  it("vencimiento dentro de la ventana configurada → EXPIRING_SOON", () => {
    const validTo = new Date("2026-08-15T00:00:00.000Z"); // 7 días desde AHORA
    expect(calcularEstadoDocumento({ validTo }, { ahora: AHORA, ventanaDiasProximoAVencer: 30 })).toBe("EXPIRING_SOON");
  });

  it("vencimiento ya pasado → EXPIRED", () => {
    const validTo = new Date("2026-01-01T00:00:00.000Z");
    expect(calcularEstadoDocumento({ validTo }, { ahora: AHORA })).toBe("EXPIRED");
  });

  it("la ventana es configurable — el mismo vencimiento cambia de estado según la ventana pedida", () => {
    const validTo = new Date("2026-08-20T00:00:00.000Z"); // 12 días desde AHORA
    expect(calcularEstadoDocumento({ validTo }, { ahora: AHORA, ventanaDiasProximoAVencer: 5 })).toBe("VALID");
    expect(calcularEstadoDocumento({ validTo }, { ahora: AHORA, ventanaDiasProximoAVencer: 15 })).toBe("EXPIRING_SOON");
  });

  it("no depende de Prisma ni de ninguna normativa — función pura sobre datos planos", () => {
    // Si este archivo importara algo de "@/generated/prisma" o de un módulo
    // con contenido legal, este test seguiría "pasando" en el sentido de
    // vitest, pero el punto es documental: la firma de la función solo pide
    // { validTo: Date | null } — nada más.
    const resultado = calcularEstadoDocumento({ validTo: null });
    expect(typeof resultado).toBe("string");
  });
});
