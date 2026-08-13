// Tipos compartidos por el Módulo de Importación Asistida — reutilizable por
// distintos "sabores" de importación (organizaciones, unidades funcionales),
// no solo el onboarding masivo de consorcios con el que arrancó este módulo.
// Ver src/components/import/ImportWizard.tsx.

// Antes era una unión cerrada de literales específicos de organizaciones
// ("name" | "tax_id" | ...). Se ensancha a `string` a propósito para que el
// mismo wizard sirva para cualquier set de campos destino (cada sabor define
// el suyo) sin necesitar un tipo genérico por flavor — el resto de este
// archivo ya era estructuralmente compatible con eso.
export type CampoDestino = string;

export interface CampoDestinoConfig {
  campo: CampoDestino;
  etiqueta: string;
  requerido: boolean;
  ayuda: string;
}

// Orden de despliegue en el Paso 2 (mapeo) y Paso 3 (preview) — coincide con
// el orden pedido en los requerimientos del módulo original de organizaciones.
export const CAMPOS_DESTINO: CampoDestinoConfig[] = [
  {
    campo: "name",
    etiqueta: "Nombre del consorcio",
    requerido: true,
    ayuda: "Nombre comercial de la organización (ej. \"Consorcio Av. Cabildo 2450\")",
  },
  {
    campo: "tax_id",
    etiqueta: "CUIT / RUT / RFC",
    requerido: true,
    ayuda: "Identificador fiscal — se usa para no duplicar organizaciones existentes",
  },
  {
    campo: "contact_name",
    etiqueta: "Nombre del contacto",
    requerido: false,
    ayuda: "Nombre y apellido de la persona de referencia",
  },
  {
    campo: "contact_email",
    etiqueta: "Email del contacto",
    requerido: false,
    ayuda: "Email personal de la persona de referencia",
  },
  {
    campo: "contact_phone",
    etiqueta: "Teléfono del contacto",
    requerido: false,
    ayuda: "Teléfono o WhatsApp de la persona de referencia",
  },
  {
    campo: "billing_email",
    etiqueta: "Email de facturación",
    requerido: false,
    ayuda: "Casilla usada para el envío de facturas (puede ser genérica, no de una persona)",
  },
  {
    campo: "cbu_alias",
    etiqueta: "CBU / Alias",
    requerido: false,
    ayuda: "Cuenta bancaria usada para cobros",
  },
];

export type Severidad = "error" | "warning";

export interface ProblemaValidacion {
  campo: CampoDestino;
  severidad: Severidad;
  mensaje: string;
}

export interface FilaImportacion {
  id: string; // id local temporal para la UI — no es el id de la base de datos
  valores: Record<CampoDestino, string>;
  problemas: ProblemaValidacion[];
  incluida: boolean;
}

// Mapeo elegido por el usuario: campo del sistema -> nombre de columna del archivo.
export type MapeoColumnas = Partial<Record<CampoDestino, string>>;

export interface ArchivoParseado {
  nombreArchivo: string;
  headers: string[];
  filas: string[][]; // filas crudas tal como vienen del archivo, sin mapear todavía
  totalFilasOriginal: number; // por si se truncó por LIMITE_FILAS
}

// Resultado de una importación — genérico por diseño: no importa si la fila
// representa una organización o una unidad, el resumen (creadas/actualizadas/
// errores) tiene la misma forma. `etiqueta` en el error es el texto legible
// para identificar la fila (nombre de organización, código de unidad, etc.),
// no un campo específico de un dominio.
export interface ErrorFilaImportacion {
  fila: number; // 1-indexado, para mostrarle al usuario
  etiqueta: string;
  mensaje: string;
}

export interface ResultadoImportacion {
  ok: boolean;
  creadas: number;
  actualizadas: number;
  errores: ErrorFilaImportacion[];
}

/**
 * Contrato que necesita `ImportWizard` para servir cualquier "sabor" de
 * importación — hoy Organizaciones (`/importar`) y Unidades/Titulares
 * (`/unidades-config`, Fase 2). El wizard en sí (`ImportWizard.tsx` y sus 4
 * pasos) no conoce ningún campo ni ninguna Server Action específica: todo
 * eso vive acá, provisto por quien arma la config.
 */
export interface ImportWizardConfig {
  tituloUpload: string;
  subtituloUpload: string;
  camposDestino: CampoDestinoConfig[];
  sugerirMapeo: (headers: string[]) => MapeoColumnas;
  validarFila: (valores: Record<CampoDestino, string>) => ProblemaValidacion[];
  confirmar: (filas: FilaImportacion[]) => Promise<ResultadoImportacion>;
  entidadPlural: string; // ej. "organizaciones" / "unidades" — para la copy genérica de StepConfirm
  notaActualizacion: string; // ej. "Los consorcios que ya existan (mismo CUIT) se actualizan..."
  linkResultado?: { href: string; label: string };
}
