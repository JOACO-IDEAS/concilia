// Set de campos destino para la importación de Obligaciones (Fase 3.2 —
// ver OBLIGATION_MODEL.md). Separado de unit-fields.ts/types.ts porque cada
// "sabor" de importación es dueño de su propia lista de campos, sin mezclar
// dominios en un único array — mismo criterio que ya documentó
// IMPORT_PIPELINE.md.
//
// Nota: igual que en la importación de Unidades, la Organización no es un
// campo por fila — un archivo de obligaciones siempre es de UN consorcio a
// la vez, elegido una sola vez antes de subir el archivo.

import type { CampoDestinoConfig } from "./types";

export const CAMPOS_DESTINO_OBLIGACIONES: CampoDestinoConfig[] = [
  {
    campo: "unit_code",
    etiqueta: "Unidad",
    requerido: true,
    ayuda: 'Código de la unidad funcional, tal como está cargado (ej. "3A") — debe existir previamente',
  },
  {
    campo: "period",
    etiqueta: "Período",
    requerido: true,
    ayuda: 'Mes al que corresponde, formato "AAAA-MM" (ej. "2026-08")',
  },
  {
    campo: "amount",
    etiqueta: "Importe",
    requerido: true,
    ayuda: "Monto de la obligación (expensa) para ese período",
  },
  {
    campo: "due_date",
    etiqueta: "Vencimiento",
    requerido: false,
    ayuda: "Fecha límite de pago — opcional",
  },
  {
    campo: "concept",
    etiqueta: "Concepto",
    requerido: false,
    ayuda: 'Descripción libre (ej. "Expensas Agosto 2026")',
  },
];
