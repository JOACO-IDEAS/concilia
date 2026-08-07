import type { DocumentExtractor, DocumentFile } from "./types";
import { CsvExtractor } from "./csv-extractor";
import { PdfExtractor } from "./pdf-extractor";
import { ExcelExtractor } from "./excel-extractor";

// CSV primero — mismo criterio que tenía `detectarTipoArchivo` en
// ai-parser.ts: la extensión .csv manda por sobre un MIME ambiguo como
// "application/vnd.ms-excel" (que también es el MIME real de un .xls).
const EXTRACTORES: DocumentExtractor[] = [CsvExtractor, PdfExtractor, ExcelExtractor];

/**
 * Punto de entrada único del módulo de extracción de documentos. Nada fuera
 * de esta carpeta debería importar `unpdf`, `xlsx`, ni ninguna librería de
 * parsing concreta — solo esta función.
 */
export async function extraerTextoDeDocumento(file: DocumentFile): Promise<string> {
  const extractor = EXTRACTORES.find((e) => e.supports(file));
  if (!extractor) {
    throw new Error(`No hay un extractor de documentos para "${file.fileName}" (${file.mimeType}).`);
  }
  return extractor.extract(file);
}

export type { DocumentExtractor, DocumentFile } from "./types";
