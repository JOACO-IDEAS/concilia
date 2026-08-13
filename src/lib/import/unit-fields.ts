// Set de campos destino para la importación de Unidades/Titulares (Fase 2
// del Motor de Conciliación — ver RECONCILIATION_ENGINE_IMPLEMENTATION.md
// sección C). Separado de `types.ts` (que define el set de Organizaciones)
// para que cada "sabor" de importación sea dueño de su propia lista de
// campos, sin mezclar dominios en un único array — mismo criterio que ya
// documentó IMPORT_PIPELINE.md.
//
// Nota: la Organización a la que pertenecen las unidades NO es un campo por
// fila — un archivo de padrón siempre es de UN consorcio a la vez (así es
// como un administrador real tiene la planilla). Se elige una sola vez antes
// de subir el archivo, no se mapea columna por columna.

import type { CampoDestinoConfig } from "./types";

export const CAMPOS_DESTINO_UNIDADES: CampoDestinoConfig[] = [
  {
    campo: "unit_code",
    etiqueta: "Unidad",
    requerido: true,
    ayuda: "Código de la unidad funcional (ej. \"3A\", \"PB 1\")",
  },
  {
    campo: "owner_full_name",
    etiqueta: "Titular",
    requerido: true,
    ayuda: "Nombre y apellido del propietario o inquilino",
  },
  {
    campo: "owner_tax_id",
    etiqueta: "CUIT / CUIL del titular",
    requerido: false,
    ayuda: "Fuertemente recomendado — sin esto, el matching automático futuro pierde precisión",
  },
  {
    campo: "owner_relationship",
    etiqueta: "Tipo de ocupante",
    requerido: false,
    ayuda: "\"Propietario\" o \"Inquilino\" — si no se reconoce, se importa como Propietario",
  },
  {
    campo: "owner_email",
    etiqueta: "Email del titular",
    requerido: false,
    ayuda: "Para notificaciones",
  },
  {
    campo: "owner_phone",
    etiqueta: "Teléfono del titular",
    requerido: false,
    ayuda: "Para notificaciones",
  },
  {
    campo: "coefficient",
    etiqueta: "Coeficiente (%)",
    requerido: false,
    ayuda: "Porcentaje de participación en el consorcio — se puede completar después",
  },
];
