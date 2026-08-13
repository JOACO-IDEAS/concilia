import type { CampoDestino, MapeoColumnas, ProblemaValidacion } from "./types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarEmail(valor: string): boolean {
  return EMAIL_REGEX.test(valor.trim());
}

// Valida el dígito verificador de un CUIT/CUIL argentino (algoritmo módulo 11).
// Genérico — lo usa tanto la validación de organizaciones como la de titulares.
export function validarChecksumCuit(cuit11Digitos: string): boolean {
  const digitos = cuit11Digitos.split("").map(Number);
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = multiplicadores.reduce((acc, m, i) => acc + m * digitos[i], 0);
  const resto = suma % 11;
  const verificadorEsperado = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificadorEsperado === digitos[10];
}

/**
 * Valida un CUIT/CUIL en formato libre (con o sin guiones) y devuelve el
 * problema correspondiente si lo hay, o `null` si está bien formado. Extraído
 * como helper compartido porque tanto `validarFila` (organizaciones) como
 * `validarFilaUnidad` (Fase 2) necesitan exactamente esta misma lógica.
 */
function validarCuitLibre(
  valor: string
): { severidad: "error" | "warning"; mensaje: string } | null {
  const sinSeparadores = valor.replace(/[-\s]/g, "");
  const esNumerico11 = /^\d{11}$/.test(sinSeparadores);
  if (esNumerico11) {
    if (!validarChecksumCuit(sinSeparadores)) {
      return { severidad: "error", mensaje: "El CUIT no pasa la validación del dígito verificador." };
    }
    return null;
  }
  return {
    severidad: "warning",
    mensaje: "No tiene formato de CUIT argentino (11 dígitos) — se importa igual, conviene verificar.",
  };
}

/**
 * Valida una fila ya mapeada a los 7 campos del sistema de Organizaciones.
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
    const problema = validarCuitLibre(taxId);
    if (problema) problemas.push({ campo: "tax_id", ...problema });
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

const RELACIONES_RECONOCIDAS: Record<string, "OWNER" | "TENANT"> = {
  propietario: "OWNER",
  owner: "OWNER",
  dueño: "OWNER",
  dueno: "OWNER",
  inquilino: "TENANT",
  tenant: "TENANT",
  locatario: "TENANT",
};

/** Normaliza texto libre ("Propietario", "inquilino ") al enum UnitOccupantType — null si no se reconoce. */
export function normalizarRelacionUnidad(valor: string): "OWNER" | "TENANT" | null {
  const clave = valor.trim().toLowerCase();
  return RELACIONES_RECONOCIDAS[clave] ?? null;
}

/**
 * Valida una fila ya mapeada a los campos de Unidad + Titular (Fase 2 del
 * Motor de Conciliación — ver RECONCILIATION_ENGINE_IMPLEMENTATION.md sección
 * C). `unit_code` y `owner_full_name` son los únicos bloqueantes — sin CUIT
 * la unidad se puede seguir cargando (queda como advertencia, no error), tal
 * como propone el diseño aprobado: el matching futuro pierde precisión sin
 * CUIT, pero no es un impedimento para tener el padrón cargado.
 */
export function validarFilaUnidad(valores: Record<CampoDestino, string>): ProblemaValidacion[] {
  const problemas: ProblemaValidacion[] = [];

  if (!valores.unit_code?.trim()) {
    problemas.push({
      campo: "unit_code",
      severidad: "error",
      mensaje: "El código de unidad (ej. \"3A\") es obligatorio.",
    });
  }

  if (!valores.owner_full_name?.trim()) {
    problemas.push({
      campo: "owner_full_name",
      severidad: "error",
      mensaje: "El nombre del titular es obligatorio.",
    });
  }

  const taxId = valores.owner_tax_id?.trim() ?? "";
  if (!taxId) {
    problemas.push({
      campo: "owner_tax_id",
      severidad: "warning",
      mensaje:
        "Sin CUIT/CUIL — se puede cargar igual, pero el matching automático futuro pierde precisión, y si volvés a importar este mismo archivo más adelante, este titular puede quedar duplicado (sin CUIT no hay forma confiable de reconocer que ya existe).",
    });
  } else {
    const problema = validarCuitLibre(taxId);
    if (problema) problemas.push({ campo: "owner_tax_id", ...problema });
  }

  if (valores.owner_email?.trim() && !validarEmail(valores.owner_email)) {
    problemas.push({
      campo: "owner_email",
      severidad: "error",
      mensaje: "Email del titular con formato inválido.",
    });
  }

  const relacion = valores.owner_relationship?.trim();
  if (relacion && !normalizarRelacionUnidad(relacion)) {
    problemas.push({
      campo: "owner_relationship",
      severidad: "warning",
      mensaje: `"${relacion}" no se reconoce como Propietario/Inquilino — se va a importar como Propietario por defecto.`,
    });
  }

  const coeficiente = valores.coefficient?.trim();
  if (coeficiente && Number.isNaN(Number(coeficiente.replace(",", ".").replace("%", "")))) {
    problemas.push({
      campo: "coefficient",
      severidad: "warning",
      mensaje: "El coeficiente no parece un número — se va a importar sin coeficiente.",
    });
  }

  return problemas;
}

export function tieneErroresBloqueantes(problemas: ProblemaValidacion[]): boolean {
  return problemas.some((p) => p.severidad === "error");
}

interface DeteccionCampo {
  campo: CampoDestino;
  keywords: string[];
}

/**
 * Motor genérico de sugerencia de mapeo por palabras clave — compartido por
 * cualquier "sabor" de importación. Cada sabor define su propia tabla de
 * detección (ver `DETECCION_ORGANIZACION`/`DETECCION_UNIDADES` abajo) en
 * orden de especificidad (de más a menos específico) para minimizar
 * ambigüedades — ej. una columna "Email de Facturación" no debe terminar
 * mapeada como "Email del contacto" solo porque contiene la palabra "email".
 */
function sugerirMapeoGenerico(headers: string[], deteccion: DeteccionCampo[]): MapeoColumnas {
  const mapeo: MapeoColumnas = {};
  const usados = new Set<string>();

  for (const { campo, keywords } of deteccion) {
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

const DETECCION_ORGANIZACION: DeteccionCampo[] = [
  { campo: "tax_id", keywords: ["cuit", "cuil", "rut", "rfc"] },
  { campo: "billing_email", keywords: ["facturacion", "facturación", "billing", "cobranza"] },
  { campo: "contact_email", keywords: ["email", "mail", "correo"] },
  { campo: "contact_phone", keywords: ["telefono", "teléfono", "celular", "whatsapp", "phone", " tel"] },
  { campo: "contact_name", keywords: ["contacto", "referente"] },
  { campo: "cbu_alias", keywords: ["cbu", "alias", "cuenta bancaria", "iban"] },
  { campo: "name", keywords: ["nombre", "consorcio", "edificio", "razon social", "razón social"] },
];

/** Sugiere el mapeo de columnas para la importación de Organizaciones — comportamiento sin cambios. */
export function sugerirMapeo(headers: string[]): MapeoColumnas {
  return sugerirMapeoGenerico(headers, DETECCION_ORGANIZACION);
}

const DETECCION_UNIDADES: DeteccionCampo[] = [
  { campo: "owner_tax_id", keywords: ["cuit", "cuil"] },
  { campo: "owner_email", keywords: ["email", "mail", "correo"] },
  { campo: "owner_phone", keywords: ["telefono", "teléfono", "celular", "whatsapp", "phone", " tel"] },
  { campo: "owner_relationship", keywords: ["ocupante", "relacion", "relación", "tipo"] },
  { campo: "coefficient", keywords: ["coeficiente", "porcentaje", "%"] },
  { campo: "owner_full_name", keywords: ["titular", "propietario", "nombre", "apellido"] },
  { campo: "unit_code", keywords: ["unidad", "uf", "depto", "departamento", "funcional"] },
];

/** Sugiere el mapeo de columnas para la importación de Unidades/Titulares (Fase 2). */
export function sugerirMapeoUnidades(headers: string[]): MapeoColumnas {
  return sugerirMapeoGenerico(headers, DETECCION_UNIDADES);
}

/**
 * Valida una fila ya mapeada a los campos de Obligación (Fase 3.2 — ver
 * OBLIGATION_MODEL.md). `unit_code`, `period` y `amount` son los únicos
 * bloqueantes — sin ellos no hay obligación posible. La existencia real de
 * la Unidad (¿matchea algún Unit.code de la organización?) NO se valida acá
 * — esta función solo mira la forma de la fila, sin tocar la base; esa
 * verificación la hace `importarObligaciones` fila por fila.
 */
export function validarFilaObligacion(valores: Record<CampoDestino, string>): ProblemaValidacion[] {
  const problemas: ProblemaValidacion[] = [];

  if (!valores.unit_code?.trim()) {
    problemas.push({
      campo: "unit_code",
      severidad: "error",
      mensaje: "El código de unidad es obligatorio.",
    });
  }

  const period = valores.period?.trim() ?? "";
  if (!period) {
    problemas.push({
      campo: "period",
      severidad: "error",
      mensaje: "El período es obligatorio.",
    });
  } else if (!/^\d{4}-\d{2}(-\d{2})?$/.test(period) && !/^\d{1,2}\/\d{4}$/.test(period)) {
    problemas.push({
      campo: "period",
      severidad: "error",
      mensaje: 'El período debe tener formato "AAAA-MM" (ej. 2026-08).',
    });
  }

  const amount = valores.amount?.trim() ?? "";
  if (!amount) {
    problemas.push({
      campo: "amount",
      severidad: "error",
      mensaje: "El importe es obligatorio.",
    });
  } else {
    const n = Number(amount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      problemas.push({
        campo: "amount",
        severidad: "error",
        mensaje: "El importe debe ser un número mayor a cero.",
      });
    }
  }

  const dueDate = valores.due_date?.trim();
  if (dueDate && Number.isNaN(new Date(dueDate).getTime())) {
    problemas.push({
      campo: "due_date",
      severidad: "warning",
      mensaje: "La fecha de vencimiento no tiene un formato reconocible — se va a importar sin vencimiento.",
    });
  }

  return problemas;
}

const DETECCION_OBLIGACIONES: DeteccionCampo[] = [
  { campo: "due_date", keywords: ["vencimiento", "vence", "due"] },
  { campo: "period", keywords: ["periodo", "período", "mes", "month"] },
  { campo: "amount", keywords: ["importe", "monto", "amount", "expensa"] },
  { campo: "concept", keywords: ["concepto", "descripcion", "descripción", "detalle"] },
  { campo: "unit_code", keywords: ["unidad", "uf", "depto", "departamento", "funcional"] },
];

/** Sugiere el mapeo de columnas para la importación de Obligaciones (Fase 3.2). */
export function sugerirMapeoObligaciones(headers: string[]): MapeoColumnas {
  return sugerirMapeoGenerico(headers, DETECCION_OBLIGACIONES);
}
