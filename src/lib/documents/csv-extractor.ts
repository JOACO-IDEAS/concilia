import type { DocumentExtractor } from "./types";

/** CSV ya es texto — no hay nada que "extraer", solo decodificar el buffer. */
export const CsvExtractor: DocumentExtractor = {
  supports({ fileName }) {
    return fileName.toLowerCase().endsWith(".csv");
  },
  async extract({ buffer }) {
    return buffer.toString("utf-8");
  },
};
