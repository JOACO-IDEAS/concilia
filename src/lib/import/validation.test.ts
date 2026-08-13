import { describe, expect, it } from "vitest";
import {
  normalizarRelacionUnidad,
  sugerirMapeo,
  sugerirMapeoUnidades,
  tieneErroresBloqueantes,
  validarFila,
  validarFilaUnidad,
} from "./validation";

describe("normalizarRelacionUnidad", () => {
  it("reconoce variantes de Propietario e Inquilino sin importar mayúsculas/espacios", () => {
    expect(normalizarRelacionUnidad("Propietario")).toBe("OWNER");
    expect(normalizarRelacionUnidad(" owner ")).toBe("OWNER");
    expect(normalizarRelacionUnidad("Dueño")).toBe("OWNER");
    expect(normalizarRelacionUnidad("Inquilino")).toBe("TENANT");
    expect(normalizarRelacionUnidad("locatario")).toBe("TENANT");
  });

  it("devuelve null para texto no reconocido", () => {
    expect(normalizarRelacionUnidad("")).toBeNull();
    expect(normalizarRelacionUnidad("comodatario")).toBeNull();
  });
});

describe("validarFilaUnidad", () => {
  function fila(overrides: Partial<Record<string, string>> = {}) {
    return {
      unit_code: "3A",
      owner_full_name: "Juan Perez",
      owner_tax_id: "20123456786",
      owner_relationship: "Propietario",
      owner_email: "juan@example.com",
      owner_phone: "",
      coefficient: "2.5",
      ...overrides,
    };
  }

  it("no reporta errores para una fila completa y válida", () => {
    const problemas = validarFilaUnidad(fila());
    expect(tieneErroresBloqueantes(problemas)).toBe(false);
  });

  it("bloquea si falta el código de unidad", () => {
    const problemas = validarFilaUnidad(fila({ unit_code: "" }));
    expect(tieneErroresBloqueantes(problemas)).toBe(true);
    expect(problemas.some((p) => p.campo === "unit_code" && p.severidad === "error")).toBe(true);
  });

  it("bloquea si falta el nombre del titular", () => {
    const problemas = validarFilaUnidad(fila({ owner_full_name: "" }));
    expect(tieneErroresBloqueantes(problemas)).toBe(true);
    expect(problemas.some((p) => p.campo === "owner_full_name" && p.severidad === "error")).toBe(
      true
    );
  });

  it("permite importar sin CUIT, pero como advertencia no bloqueante", () => {
    const problemas = validarFilaUnidad(fila({ owner_tax_id: "" }));
    expect(tieneErroresBloqueantes(problemas)).toBe(false);
    const advertencia = problemas.find((p) => p.campo === "owner_tax_id" && p.severidad === "warning");
    expect(advertencia).toBeDefined();
    // Riesgo #1 (Fase 2.1): el warning debe advertir explícitamente el
    // riesgo de duplicado al reimportar, no solo la pérdida de precisión.
    expect(advertencia?.mensaje).toMatch(/duplicad/i);
  });

  it("bloquea un CUIT de 11 dígitos con dígito verificador inválido", () => {
    const problemas = validarFilaUnidad(fila({ owner_tax_id: "20345678900" }));
    expect(tieneErroresBloqueantes(problemas)).toBe(true);
  });

  it("bloquea un email de titular con formato inválido", () => {
    const problemas = validarFilaUnidad(fila({ owner_email: "no-es-un-email" }));
    expect(tieneErroresBloqueantes(problemas)).toBe(true);
  });

  it("advierte, sin bloquear, cuando el tipo de ocupante no se reconoce", () => {
    const problemas = validarFilaUnidad(fila({ owner_relationship: "familiar a cargo" }));
    expect(tieneErroresBloqueantes(problemas)).toBe(false);
    expect(
      problemas.some((p) => p.campo === "owner_relationship" && p.severidad === "warning")
    ).toBe(true);
  });

  it("advierte, sin bloquear, cuando el coeficiente no es numérico", () => {
    const problemas = validarFilaUnidad(fila({ coefficient: "abc" }));
    expect(tieneErroresBloqueantes(problemas)).toBe(false);
    expect(problemas.some((p) => p.campo === "coefficient" && p.severidad === "warning")).toBe(
      true
    );
  });
});

describe("sugerirMapeoUnidades", () => {
  it("mapea headers en español a los campos de destino de Unidades", () => {
    const mapeo = sugerirMapeoUnidades([
      "Unidad Funcional",
      "Titular",
      "CUIT",
      "Email",
      "Teléfono",
      "Tipo de Ocupante",
      "Coeficiente",
    ]);

    expect(mapeo.unit_code).toBe("Unidad Funcional");
    expect(mapeo.owner_full_name).toBe("Titular");
    expect(mapeo.owner_tax_id).toBe("CUIT");
    expect(mapeo.owner_email).toBe("Email");
    expect(mapeo.owner_phone).toBe("Teléfono");
    expect(mapeo.owner_relationship).toBe("Tipo de Ocupante");
    expect(mapeo.coefficient).toBe("Coeficiente");
  });

  it("no reutiliza la misma columna para dos campos distintos", () => {
    const mapeo = sugerirMapeoUnidades(["CUIT", "Nombre"]);
    const columnasUsadas = Object.values(mapeo);
    expect(new Set(columnasUsadas).size).toBe(columnasUsadas.length);
  });

  it("no confunde el mapeo de Unidades con el de Organizaciones (sabores independientes)", () => {
    const headers = ["Nombre", "CUIT", "Email", "Teléfono"];
    const mapeoOrg = sugerirMapeo(headers);
    const mapeoUnidades = sugerirMapeoUnidades(headers);

    expect(mapeoOrg.name).toBe("Nombre");
    expect(mapeoUnidades.unit_code).toBeUndefined();
    expect(mapeoUnidades.owner_full_name).toBe("Nombre");
  });
});

// Guardrail de regresión: la validación de Organizaciones (comportamiento
// aprobado en Fase 1) no debía cambiar al generalizar el motor compartido.
describe("validarFila (Organizaciones) — no debe cambiar de comportamiento", () => {
  it("sigue exigiendo nombre y CUIT/RUT/RFC como bloqueantes", () => {
    const problemas = validarFila({
      name: "",
      tax_id: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      billing_email: "",
      cbu_alias: "",
    });
    expect(tieneErroresBloqueantes(problemas)).toBe(true);
    expect(problemas.some((p) => p.campo === "name")).toBe(true);
    expect(problemas.some((p) => p.campo === "tax_id")).toBe(true);
  });

  it("no bloquea por falta de email de facturación (solo advierte)", () => {
    const problemas = validarFila({
      name: "Consorcio Test",
      tax_id: "20123456786",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      billing_email: "",
      cbu_alias: "",
    });
    expect(tieneErroresBloqueantes(problemas)).toBe(false);
  });
});
