import type { CampoDestino, MapeoColumnas, ProblemaValidacion } from "./types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarEmail(valor: string): boolean {
  return EMAIL_REGEX.test(valor.trim());
}

// Valida el dígito verificador de un CUIT/CUIL argentino (algoritmo módulo 11).
export function validarChecksumCuit(cuit11Digitos: string): boolean {
  const digitos = cuit11Digitos.split("").map(Number);
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = multiplicadores.reduce((acc, m, i) => acc + m * digitos[i], 0);
  const resto = suma % 11;
  const verificadorEsperado = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificadorEsperado === digitos[10];
}

/**
 * Valida una fila ya mapeada a los 7 campos del sistema.
 * `name` y `tax_id` son los únicos campos bloqueantes (error) — el resto son
 * advertencias no bloqueantes, para que el import sea tolerante con
 * planillas incompletas (se puede completar el resto después a mano).
 */
export function validarFila(valores: Record<CampoDestino, string>): ProblemaValidacion[] {
  const problemas: ProblemaValidacion[] = [];

  if (!valores.name?.trim()) {
    problemas.push({
      campo: "name",
      severidad: "error",
      mensaje: "El nombre del consorcio es obligatorio.",
    });
  }

  const taxId = valores.tax_id?.trim() ?? "";
  if (!taxId) {
    problemas.push({
      campo: "tax_id",
      severidad: "error",
      mensaje: "El CUIT/RUT/RFC es obligatorio.",
    });
  } else {
    const sinSeparadores = taxId.replace(/[-\s]/g, "");
    const esNumerico11 = /^\d{11}$/.test(sinSeparadores);
    if (esNumerico11) {
      if (!validarChecksumCuit(sinSeparadores)) {
        problemas.push({
          campo: "tax_id",
          severidad: "error",
          mensaje: "El CUIT no pasa la validación del dígito verificador.",
        });
      }
    } else {
      problemas.push({
        campo: "tax_id",
        severidad: "warning",
        mensaje: "No tiene formato de CUIT argentino (11 dígitos) — se importa igual, conviene verificar.",
      });
    }
  }

  if (valores.contact_email?.trim() && !validarEmail(valores.contact_email)) {
    problemas.push({
      campo: "contact_email",
      severidad: "error",
      mensaje: "Email de contacto con formato inválido.",
    });
  }

  if (valores.billing_email?.trim()) {
    if (!validarEmail(valores.billing_email)) {
      problemas.push({
        campo: "billing_email",
        severidad: "error",
        mensaje: "Email de facturación con formato inválido.",
      });
    }
  } else {
    problemas.push({
      campo: "billing_email",
      severidad: "warning",
      mensaje: "Sin email de facturación — se puede completar después.",
    });
  }

  if (!valores.contact_name?.trim()) {
    problemas.push({
      campo: "contact_name",
      severidad: "warning",
      mensaje: "Sin contacto de referencia.",
    });
  }

  return problemas;
}

export function tieneErroresBloqueantes(problemas: ProblemaValidacion[]): boolean {
  return problemas.some((p) => p.severidad === "error");
}

// Palabras clave para sugerir automáticamente el mapeo de columnas, en orden
// de especificidad (de más a menos específico) para minimizar ambigüedades:
// por ejemplo una columna "Email de Facturación" no debe terminar mapeada
// como "Email del contacto" solo porque contiene la palabra "email".
const DETECCION: { campo: CampoDestino; keywords: string[] }[] = [
  { campo: "tax_id", keywords: ["cuit", "cuil", "rut", "rfc"] },
  { campo: "billing_email", keywords: ["facturacion", "facturación", "billing", "cobranza"] },
  { campo: "contact_email", keywords: ["email", "mail", "correo"] },
  { campo: "contact_phone", keywords: ["telefono", "teléfono", "celular", "whatsapp", "phone", " tel"] },
  { campo: "contact_name", keywords: ["contacto", "referente"] },
  { campo: "cbu_alias", keywords: ["cbu", "alias", "cuenta bancaria", "iban"] },
  { campo: "name", keywords: ["nombre", "consorcio", "edificio", "razon social", "razón social"] },
];

/**
 * Sugiere automáticamente a qué campo del sistema corresponde cada columna
 * detectada en el archivo, en base a coincidencias de palabras clave en el
 * encabezado. Es solo un punto de partida: el usuario confirma o corrige el
 * mapeo en el Paso 2 antes de continuar.
 */
export function sugerirMapeo(headers: string[]): MapeoColumnas {
  const mapeo: MapeoColumnas = {};
  const usados = new Set<string>();

  for (const { campo, keywords } of DETECCION) {
    const header = headers.find((h) => {
      if (usados.has(h)) return false;
      const normalizado = ` ${h.toLowerCase()} `;
      return keywords.some((k) => normalizado.includes(k));
    });
    if (header) {
      mapeo[campo] = header;
      usados.add(header);
    }
  }

  return mapeo;
}
