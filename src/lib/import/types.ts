// Tipos compartidos por el Módulo de Importación Asistida (onboarding masivo
// de consorcios vía Excel/CSV). Ver src/components/import/ImportWizard.tsx.

export type CampoDestino =
  | "name"
  | "tax_id"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "billing_email"
  | "cbu_alias";

export interface CampoDestinoConfig {
  campo: CampoDestino;
  etiqueta: string;
  requerido: boolean;
  ayuda: string;
}

// Orden de despliegue en el Paso 2 (mapeo) y Paso 3 (preview) — coincide con
// el orden pedido en los requerimientos del módulo.
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
