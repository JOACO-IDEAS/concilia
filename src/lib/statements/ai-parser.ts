import { z } from "zod";
import {
  extraerTextoPDF,
  extraerMovimientosDeTexto,
  generarExternalId,
  type MovimientoExtraidoPDF,
} from "./parse-pdf-statement";
import { parsearCSVLocal } from "./parse-csv-statement";

// ----------------------------------------------------------------------------
// Parser universal de extractos (PDF/imagen/CSV) vía LLM con Structured
// Output — punto de extensión mencionado en parse-pdf-statement.ts. Cuando
// no hay una API key de IA configurada, degrada al parser heurístico local
// (solo funciona para PDF/CSV con texto real — una imagen sin IA no tiene
// fallback posible, ver `parseStatementWithAI` más abajo).
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

export type TipoArchivoExtracto = "pdf" | "image" | "csv";

const TAMANO_MAXIMO_DOCUMENTO_BYTES = 8 * 1024 * 1024; // 8MB — PDF/CSV
const TAMANO_MAXIMO_IMAGEN_BYTES = 5 * 1024 * 1024; // 5MB — el payload base64 infla ~33% sobre esto
const MAX_CHARS_TEXTO_A_IA = 20000; // ~5-6k tokens — cubre extractos de varios meses sin disparar costo/latencia
const MAX_OUTPUT_TOKENS = 8000;
const DEFAULT_MODEL = "gpt-4o-mini";
const TIMEOUT_IA_MS = 20000; // la UI nunca debe quedar colgada esperando al LLM — a los 20s se corta y se usa el fallback local

const MIME_A_TIPO: Record<string, TipoArchivoExtracto> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "text/csv": "csv",
  "application/vnd.ms-excel": "csv", // algunos navegadores/OS reportan CSV así
};

export function detectarTipoArchivo(mimeType: string, fileName: string): TipoArchivoExtracto | null {
  if (MIME_A_TIPO[mimeType]) return MIME_A_TIPO[mimeType];
  const nombre = fileName.toLowerCase();
  if (nombre.endsWith(".pdf")) return "pdf";
  if (nombre.endsWith(".png") || nombre.endsWith(".jpg") || nombre.endsWith(".jpeg")) return "image";
  if (nombre.endsWith(".csv")) return "csv";
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

const SYSTEM_PROMPT = `Sos un motor de extracción de datos para extractos bancarios y de billeteras virtuales de cualquier entidad financiera de LATAM (bancos, Mercado Pago, Nubank, billeteras, etc.), en cualquier formato (PDF, imagen o CSV).

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

/** Heurístico local como fallback — solo puede leer PDF (vía extracción de texto). */
async function parsearConHeuristicoLocal(
  buffer: Buffer,
  tipo: TipoArchivoExtracto
): Promise<ResultadoParserIA> {
  if (tipo === "image") {
    return {
      ok: false,
      usedAI: false,
      bankName: null,
      accountIdentifier: null,
      transactions: [],
      error:
        "Las imágenes requieren IA configurada (OPENAI_API_KEY) — no hay un parser local que pueda leer píxeles.",
    };
  }

  const texto = tipo === "pdf" ? await extraerTextoPDF(buffer) : buffer.toString("utf-8");
  const movimientos = extraerMovimientosDeTexto(texto);

  return {
    ok: movimientos.length > 0,
    usedAI: false,
    bankName: null,
    accountIdentifier: null,
    transactions: movimientos.map(
      (m): TransaccionIA => ({
        date: m.fecha,
        amount: m.esEgreso ? -m.amount : m.amount,
        concept: m.concept,
        payerIdentifier: m.payerIdentifier,
        referenceNumber: null,
      })
    ),
    error:
      movimientos.length === 0
        ? "No se detectó ningún movimiento reconocible con el parser local (sin IA configurada)."
        : undefined,
  };
}

/**
 * Parser universal de extractos — PDF, PNG/JPG o CSV, de cualquier entidad
 * financiera. Con `OPENAI_API_KEY` configurada, manda el documento (texto
 * extraído para PDF/CSV, o la imagen para PNG/JPG) a un LLM con Structured
 * Output (JSON Schema estricto generado desde el mismo Zod schema que valida
 * la respuesta). Sin la API key, degrada al parser heurístico local — que
 * solo puede leer PDF/CSV (una imagen no tiene fallback posible sin IA).
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
      error: "Formato no soportado — subí un PDF, PNG, JPG o CSV.",
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

  // CSV es una estructura de columnas conocida — nunca hace falta un LLM
  // para leerlo, así que se intenta local primero SIEMPRE (con o sin IA
  // configurada). Instantáneo (milisegundos) y evita el viaje de red por
  // completo en el caso más común de "extracto = export de un banco/billetera".
  if (tipo === "csv") {
    const resultadoCSV = parsearCSVLocal(fileBuffer.toString("utf-8"));
    if (resultadoCSV.ok) {
      return {
        ok: true,
        usedAI: false,
        bankName: null,
        accountIdentifier: null,
        transactions: resultadoCSV.transactions,
      };
    }
  }

  const config = obtenerConfigIA();
  if (!config) {
    return parsearConHeuristicoLocal(fileBuffer, tipo);
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
      const textoCrudo = tipo === "pdf" ? await extraerTextoPDF(fileBuffer) : fileBuffer.toString("utf-8");
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

    // Para PDF/CSV todavía queda el heurístico local como red de seguridad
    // — la UI nunca debe quedar esperando indefinidamente a la IA. Para
    // imágenes no hay fallback posible (no hay parser de píxeles sin IA),
    // así que se devuelve el error rápido en vez de colgar la UI.
    if (tipo !== "image") {
      const fallback = await parsearConHeuristicoLocal(fileBuffer, tipo);
      if (fallback.ok) return fallback;
    }

    return {
      ok: false,
      usedAI: true,
      bankName: null,
      accountIdentifier: null,
      transactions: [],
      error: esTimeout
        ? "La IA tardó demasiado en procesar el extracto y no se encontró un fallback local. Probá de nuevo o con otro archivo."
        : e instanceof Error
          ? `No se pudo procesar con IA: ${e.message}`
          : "No se pudo procesar con IA.",
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
