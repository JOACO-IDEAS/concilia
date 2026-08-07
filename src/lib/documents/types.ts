/**
 * Capa de abstracción de extracción de documentos — el resto del sistema
 * (`ai-parser.ts` y cualquier dominio futuro) solo conoce esta interfaz,
 * nunca la librería concreta detrás de cada extractor (unpdf, xlsx, etc.).
 * Reemplazar el motor de un tipo de archivo es agregar/cambiar un
 * `DocumentExtractor`, no tocar el pipeline que lo consume.
 */

export interface DocumentFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface DocumentExtractor {
  /** ¿Este extractor sabe leer este archivo? Decide por mimeType/extensión. */
  supports(file: Pick<DocumentFile, "mimeType" | "fileName">): boolean;
  /** Devuelve el texto plano del documento. */
  extract(file: DocumentFile): Promise<string>;
}
