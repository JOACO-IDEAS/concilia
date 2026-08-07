import { z } from "zod";
import { generarExternalId, type MovimientoExtraidoPDF } from "./parse-pdf-statement";
import { extraerTextoDeDocumento } from "@/lib/documents";

// ----------------------------------------------------------------------------
// Parser universal de extractos (PDF/imagen/CSV) vía LLM con Structured
// Output. Decisión de producto explícita: TODO documento pasa por la IA para
// ser estandarizado, sin importar el formato ni qué tan desprolijo esté — un
// parser local estricto (columnas de CSV predefinidas, regex de texto) que
// rechace un documento válido rompe la promesa de valor ("la IA hace el
// trabajo sucio"). Si la IA no está configurada o falla, se devuelve un error
// claro en vez de degradar en silencio a un heurístico de menor calidad.
// ----------------------------------------------------------------------------

const TransaccionIASchema = z.object({
  date: z.string(), // ISO yyyy-mm-dd
  amount: z.number(), // positivo = crédito/ingreso, negativo = débito/egreso
  concept: z.string(),
  payerIdentifier: z.string().nullable(),
  referenceNumber: z.string().nullable(),
});

const ExtractoIASchema = z.object({
  bankName: z.string(),
  accountIdentifier: z.string().nullable(),
  transactions: z.array(TransaccionIASchema),
});

export type TransaccionIA = z.infer<typeof TransaccionIASchema>;
export type ExtractoIA = z.infer<typeof ExtractoIASchema>;

// Zod v4 genera JSON Schema con `additionalProperties:false` y todos los
// campos en `required` (los opcionales se expresan como `anyOf [tipo, null]`)
// — coincide exactamente con lo que exige el modo strict de OpenAI
// Structured Outputs, así que el schema de Zod es la única fuente de verdad
// (no hay un JSON Schema escrito a mano por separado que se pueda desincronizar).
const JSON_SCHEMA_EXTRACTO = z.toJSONSchema(ExtractoIASchema);

export interface ResultadoParserIA {
  ok: boolean;
  usedAI: boolean; // false = vino del heurístico local (fallback), no del LLM
  bankName: string | null;
  accountIdentifier: string | null;
  transactions: TransaccionIA[];
  error?: string;
}

export type TipoArchivoExtracto = "pdf" | "image" | "csv" | "excel";

const TAMANO_MAXIMO_DOCUMENTO_BYTES = 8 * 1024 * 1024; // 8MB — PDF/CSV/Excel
const TAMANO_MAXIMO_IMAGEN_BYTES = 5 * 1024 * 1024; // 5MB — el payload base64 infla ~33% sobre esto
const MAX_CHARS_TEXTO_A_IA = 20000; // ~5-6k tokens — cubre extractos de varios meses sin disparar costo/latencia
const MAX_OUTPUT_TOKENS = 8000;
const DEFAULT_MODEL = "gpt-4o-mini"; // modelo chico/rápido a propósito — sin este no hay fallback local, así que la latencia importa
const TIMEOUT_IA_MS = 40000; // tope duro del lado del servidor; la UI tiene su propia red de seguridad de 45s por encima de esto

const MIME_A_TIPO: Record<string, TipoArchivoExtracto> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "text/csv": "csv",
  "application/vnd.ms-excel": "excel", // .xls real — no confundir con CSVs mal etiquetados, esos entran por extensión .csv
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel", // .xlsx
};

export function detectarTipoArchivo(mimeType: string, fileName: string): TipoArchivoExtracto | null {
  const nombre = fileName.toLowerCase();
  // La extensión .csv manda primero — algunos sistemas exportan CSV con el
  // MIME ambiguo "application/vnd.ms-excel", que también es el MIME real de
  // un .xls legítimo.
  if (nombre.endsWith(".csv")) return "csv";
  if (MIME_A_TIPO[mimeType]) return MIME_A_TIPO[mimeType];
  if (nombre.endsWith(".pdf")) return "pdf";
  if (nombre.endsWith(".png") || nombre.endsWith(".jpg") || nombre.endsWith(".jpeg")) return "image";
  if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls")) return "excel";
  return null;
}

export function limiteBytesPara(tipo: TipoArchivoExtracto): number {
  return tipo === "image" ? TAMANO_MAXIMO_IMAGEN_BYTES : TAMANO_MAXIMO_DOCUMENTO_BYTES;
}

interface ConfigIA {
  apiKey: string;
  model: string;
}

let configMemo: ConfigIA | null | undefined;

/**
 * Config del proveedor de IA, o `null` si no está configurada — mismo patrón
 * que `obtenerConfigWhatsApp()`/`obtenerClienteResend()`. Solo OpenAI
 * implementado (Chat Completions + Structured Outputs + Vision en una sola
 * llamada) — Anthropic/Gemini son intercambiables acá mismo sin tocar el
 * resto del módulo, en tanto devuelvan el mismo `ExtractoIA`.
 */
function obtenerConfigIA(): ConfigIA | null {
  if (configMemo !== undefined) return configMemo;
  const apiKey = process.env.OPENAI_API_KEY;
  configMemo = apiKey ? { apiKey, model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL } : null;
  return configMemo;
}

const SYSTEM_PROMPT = `Sos un experto procesando extractos bancarios argentinos (y del resto de LATAM: bancos tradicionales, Mercado Pago, Nubank, billeteras virtuales, etc.), en cualquier formato — PDF, imagen, CSV o planilla Excel.

Vas a recibir texto desestructurado (a veces mal extraído de un PDF o una imagen escaneada), CSVs mal formateados, o una planilla Excel convertida a texto plano tipo CSV (a veces con varias hojas separadas por un encabezado "--- Hoja: <nombre> ---"): columnas en cualquier orden, separadores inconsistentes, encabezados en cualquier idioma, texto pegado, saltos de línea raros. Nunca rechaces un documento por estar desprolijo — encontrá las fechas, descripciones, montos y referencias donde sea que estén, ignorando la basura decorativa (títulos, totales, leyendas legales, pies de página), y devolvé SIEMPRE un JSON estandarizado. Para eso existís.

Devolvé ÚNICAMENTE los movimientos reales de la cuenta (no encabezados, totales, ni texto decorativo). Para cada movimiento:
- "date": fecha en formato ISO estricto YYYY-MM-DD.
- "amount": número. POSITIVO si es un crédito/ingreso (transferencia recibida, depósito). NEGATIVO si es un débito/egreso (pago, extracción, comisión, impuesto).
- "concept": la descripción completa de la transacción tal como figura.
- "payerIdentifier": CUIT/CUIL/RUT/CBU/CVU/Alias del ordenante si figura en el movimiento, o null.
- "referenceNumber": número de comprobante/transacción si figura, o null.

También identificá "bankName" (nombre del banco o billetera, ej. "Mercado Pago", "Banco Galicia", "Nubank", "BancoEstado") y "accountIdentifier" (CBU/CVU/Alias/número de cuenta de la cuenta titular del extracto, no del pagador), o null si no aparecen.`;

interface ContenidoMensaje {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

async function llamarOpenAI(config: ConfigIA, contenido: ContenidoMensaje[]): Promise<ExtractoIA> {
  const respuesta = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contenido },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "extracto_bancario", strict: true, schema: JSON_SCHEMA_EXTRACTO },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_IA_MS),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`OpenAI devolvió ${respuesta.status}: ${detalle.slice(0, 300)}`);
  }

  const data = await respuesta.json();
  const mensaje = data.choices?.[0]?.message;
  if (mensaje?.refusal) throw new Error(`El modelo rechazó la solicitud: ${mensaje.refusal}`);
  const contenidoTexto = mensaje?.content;
  if (typeof contenidoTexto !== "string") throw new Error("Respuesta de OpenAI sin contenido.");

  const json = JSON.parse(contenidoTexto);
  return ExtractoIASchema.parse(json); // defensa en profundidad — no confiar ciegamente en el modelo
}

function truncarTexto(texto: string): string {
  if (texto.length <= MAX_CHARS_TEXTO_A_IA) return texto;
  console.warn(
    `[ai-parser] Texto de ${texto.length} caracteres truncado a ${MAX_CHARS_TEXTO_A_IA} antes de mandarlo al LLM.`
  );
  return texto.slice(0, MAX_CHARS_TEXTO_A_IA);
}

/**
 * Parser universal de extractos — PDF, PNG/JPG, CSV o Excel (.xlsx/.xls), de
 * cualquier entidad financiera. TODO documento pasa siempre por la IA (texto
 * extraído para PDF/CSV/Excel, o la imagen para PNG/JPG) con Structured
 * Output (JSON Schema estricto generado desde el mismo Zod schema que valida
 * la respuesta) — no hay atajo local ni validación de columnas que pueda
 * rechazar un documento válido antes de llegar acá. PDF y Excel son binarios:
 * nunca se mandan crudos al modelo, siempre se les extrae el texto primero
 * vía `extraerTextoDeDocumento` (`src/lib/documents/` — este módulo no sabe
 * ni le importa qué librería concreta hace la extracción de cada formato).
 * Si la IA no está configurada o falla, se devuelve un error claro (nunca un
 * cuelgue ni una degradación silenciosa).
 */
export async function parseStatementWithAI(
  fileBuffer: Buffer,
  mimeType: string,
  fileName = "extracto"
): Promise<ResultadoParserIA> {
  const tipo = detectarTipoArchivo(mimeType, fileName);
  if (!tipo) {
    return {
      ok: false,
      usedAI: false,
      bankName: null,
      accountIdentifier: null,
      transactions: [],
      error: "Formato no soportado — subí un PDF, PNG, JPG, CSV o Excel (.xlsx/.xls).",
    };
  }

  const limite = limiteBytesPara(tipo);
  if (fileBuffer.byteLength > limite) {
    return {
      ok: false,
      usedAI: false,
      bankName: null,
      accountIdentifier: null,
      transactions: [],
      error: `El archivo pesa demasiado (máximo ${Math.round(limite / (1024 * 1024))}MB para este formato).`,
    };
  }

  const config = obtenerConfigIA();
  if (!config) {
    return {
      ok: false,
      usedAI: false,
      bankName: null,
      accountIdentifier: null,
      transactions: [],
      error: "La IA no está configurada en este entorno (falta OPENAI_API_KEY) — no se puede procesar el extracto.",
    };
  }

  try {
    let contenido: ContenidoMensaje[];
    if (tipo === "image") {
      const base64 = fileBuffer.toString("base64");
      contenido = [
        { type: "text", text: "Extraé los movimientos de este extracto (imagen)." },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
      ];
    } else {
      const textoCrudo = await extraerTextoDeDocumento({ buffer: fileBuffer, mimeType, fileName });
      contenido = [{ type: "text", text: truncarTexto(textoCrudo) }];
    }

    const extracto = await llamarOpenAI(config, contenido);
    return { ok: true, usedAI: true, ...extracto };
  } catch (e) {
    const esTimeout = e instanceof Error && e.name === "TimeoutError";
    console.error(
      `[ai-parser] ${esTimeout ? "Timeout" : "Error"} llamando al LLM${esTimeout ? ` (${TIMEOUT_IA_MS}ms)` : ""}:`,
      e
    );

    return {
      ok: false,
      usedAI: true,
      bankName: null,
      accountIdentifier: null,
      transactions: [],
      error: esTimeout
        ? "La IA tardó demasiado en responder. Probá de nuevo en unos segundos."
        : e instanceof Error
          ? `No se pudo procesar el extracto con IA: ${e.message}`
          : "No se pudo procesar el extracto con IA.",
    };
  }
}

/**
 * Adapta la salida de `parseStatementWithAI` al tipo que ya usa el resto del
 * pipeline de ingesta (`MovimientoExtraidoPDF` — ver statement-actions.ts).
 * Prioriza `referenceNumber` como clave de idempotencia cuando el proveedor
 * lo dio (más confiable que el hash de contenido); si no, cae al mismo hash
 * determinístico que usa el parser heurístico.
 */
export function convertirATransaccionesPipeline(
  resultado: Pick<ResultadoParserIA, "transactions">
): MovimientoExtraidoPDF[] {
  return resultado.transactions
    .map((t) => {
      const amount = Math.abs(t.amount);
      const esEgreso = t.amount < 0;
      const externalId = t.referenceNumber
        ? `ai:ref:${t.referenceNumber.trim().toLowerCase()}`
        : generarExternalId(t.date, amount, t.concept);
      const lineaOriginal = t.referenceNumber ? `${t.concept} (ref: ${t.referenceNumber})` : t.concept;

      return {
        fecha: t.date,
        amount,
        concept: t.concept,
        payerIdentifier: t.payerIdentifier,
        esEgreso,
        lineaOriginal,
        externalId,
      };
    })
    .filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.fecha)); // descarta fechas mal formadas si el modelo se desvió
}
