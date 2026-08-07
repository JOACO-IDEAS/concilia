import * as XLSX from "xlsx";
import type { DocumentExtractor } from "./types";

const MIME_EXCEL = new Set([
  "application/vnd.ms-excel", // .xls real — no confundir con CSVs mal etiquetados, esos entran por extensión .csv
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

/**
 * Convierte un .xlsx/.xls (binario) a texto plano tipo CSV, hoja por hoja.
 * Si hay más de una hoja, se antepone el nombre de cada una como separador
 * para que la IA no mezcle movimientos de hojas distintas (ej. "Enero"/"Febrero").
 */
export const ExcelExtractor: DocumentExtractor = {
  supports({ mimeType, fileName }) {
    const nombre = fileName.toLowerCase();
    if (nombre.endsWith(".csv")) return false; // el .csv manda primero, ver CsvExtractor
    if (MIME_EXCEL.has(mimeType)) return true;
    return nombre.endsWith(".xlsx") || nombre.endsWith(".xls");
  },
  async extract({ buffer }) {
    const libro = XLSX.read(buffer, { type: "buffer" });
    const partes: string[] = [];

    for (const nombreHoja of libro.SheetNames) {
      const hoja = libro.Sheets[nombreHoja];
      const csv = XLSX.utils.sheet_to_csv(hoja);
      if (!csv.trim()) continue;
      partes.push(libro.SheetNames.length > 1 ? `--- Hoja: ${nombreHoja} ---\n${csv}` : csv);
    }

    return partes.join("\n\n");
  },
};
