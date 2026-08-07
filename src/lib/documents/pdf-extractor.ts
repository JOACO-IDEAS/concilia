import { extractText, getDocumentProxy } from "unpdf";
import type { DocumentExtractor } from "./types";

/**
 * Extrae el texto plano de un PDF (sin OCR — asume texto embebido real, no
 * un escaneo). Usa `unpdf` — un build de pdf.js empaquetado específicamente
 * para entornos serverless, sin dependencias nativas (a diferencia de
 * `pdf-parse`, que arrastra `@napi-rs/canvas` para renderizado que acá nunca
 * se usa — ver IMPORT_PIPELINE.md / la auditoría de causa raíz del bug de
 * `DOMMatrix is not defined` en Vercel).
 */
export const PdfExtractor: DocumentExtractor = {
  supports({ mimeType, fileName }) {
    if (mimeType === "application/pdf") return true;
    return fileName.toLowerCase().endsWith(".pdf");
  },
  async extract({ buffer }) {
    const documento = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(documento, { mergePages: true });
    return text;
  },
};
