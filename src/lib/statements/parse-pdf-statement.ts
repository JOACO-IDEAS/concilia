import { createHash } from "node:crypto";

/**
 * Un movimiento detectado en un extracto bancario en PDF, ya en forma
 * estructurada — pensado para que este mismo tipo pueda llenarse a futuro
 * con un pipeline de LLM/Vision (ver docstring de `extraerMovimientosDeTexto`
 * más abajo) sin tener que tocar el resto del pipeline de ingesta.
 */
export interface MovimientoExtraidoPDF {
  fecha: string; // ISO yyyy-mm-dd
  amount: number;
  concept: string;
  payerIdentifier: string | null;
  esEgreso: boolean; // débito/egreso — no se ofrece para importar como cobro
  lineaOriginal: string;
  externalId: string; // hash determinístico — misma línea reimportada = mismo id
}

const PALABRAS_DEBITO = [
  "debito",
  "extraccion",
  "pago a",
  "comision",
  "impuesto",
  "iva",
  "retencion",
  "compra",
];

function normalizarFecha(dd: string, mm: string, aaaa: string): string | null {
  const anio = aaaa.length === 2 ? `20${aaaa}` : aaaa;
  const mes = mm.padStart(2, "0");
  const dia = dd.padStart(2, "0");
  const fecha = `${anio}-${mes}-${dia}`;
  // Descarta fechas imposibles (ej. un CUIT mal interpretado como fecha).
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31) return null;
  return fecha;
}

// Monto es-AR: agrupado en miles con "." ("15.000,00") o sin agrupar
// ("15000,00") — siempre con 2 decimales tras la coma. El lookbehind evita
// arrancar el match en medio de un número más largo (ej. no interpretar los
// últimos 3 dígitos de "15000,00" como si fueran "000,00").
const REGEX_MONTO = /(?<![\d.,])-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?!\d)/g;
const REGEX_FECHA = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/;
const REGEX_CBU = /\b\d{22}\b/;
const REGEX_CUIT_GUION = /\b\d{2}-\d{8}-\d\b/;
const REGEX_CUIT_CERCA = /CUIT\W{0,3}(\d{11})\b/i;
const REGEX_ALIAS = /ALIAS\W{0,3}([A-Z0-9][A-Z0-9.]{4,19})\b/i;
const REGEX_SEPARADOR_PAGINA = /^--\s*\d+\s*of\s*\d+\s*--$/i;

function extraerMonto(texto: string): { crudo: string; valor: number } | null {
  const coincidencias = [...texto.matchAll(REGEX_MONTO)];
  if (coincidencias.length === 0) return null;
  const ultima = coincidencias[coincidencias.length - 1][0];
  const valor = Number(ultima.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(valor)) return null;
  return { crudo: ultima, valor };
}

function extraerIdentificadorPagador(texto: string): string | null {
  const cbu = texto.match(REGEX_CBU);
  if (cbu) return cbu[0];
  const cuitGuion = texto.match(REGEX_CUIT_GUION);
  if (cuitGuion) return cuitGuion[0];
  const cuitCerca = texto.match(REGEX_CUIT_CERCA);
  if (cuitCerca) return cuitCerca[1];
  const alias = texto.match(REGEX_ALIAS);
  if (alias) return alias[1];
  return null;
}

export function generarExternalId(fecha: string, monto: number, concepto: string): string {
  const hash = createHash("sha256").update(`${fecha}|${monto}|${concepto.toLowerCase()}`).digest("hex");
  return `pdf:${hash.slice(0, 24)}`;
}

/**
 * Reconstruye "filas" lógicas a partir del texto plano del PDF: una fila
 * empieza en cada línea que arranca con una fecha reconocible, y absorbe las
 * líneas siguientes que NO arrancan con fecha (texto de concepto que se
 * desbordó a la línea de abajo en la tabla original) hasta la próxima fecha
 * o el separador de página.
 */
function reconstruirFilas(texto: string): string[] {
  const lineas = texto.split("\n").map((l) => l.replace(/\t/g, " ").trim());
  const filas: string[] = [];
  let actual = "";

  for (const linea of lineas) {
    if (!linea || REGEX_SEPARADOR_PAGINA.test(linea)) {
      if (actual) filas.push(actual);
      actual = "";
      continue;
    }
    if (REGEX_FECHA.test(linea) && REGEX_FECHA.exec(linea)!.index === 0) {
      if (actual) filas.push(actual);
      actual = linea;
    } else if (actual) {
      actual += ` ${linea}`;
    }
    // líneas sin fecha antes de la primera fila (encabezado del banco, título
    // de columnas) se descartan silenciosamente.
  }
  if (actual) filas.push(actual);
  return filas;
}

/**
 * Parser heurístico de extractos bancarios en PDF (texto embebido, no
 * escaneado). Es intencionalmente reglas-simples-y-explicables, en la misma
 * línea que `reconcile-payment.ts` y `smart-match.ts` — no hay un formato
 * único de extracto entre bancos, así que esto cubre el caso común
 * "fecha · concepto · monto" en una fila de tabla.
 *
 * Punto de extensión: si un banco necesita un layout que este heurístico no
 * cubre bien, la salida es este mismo `MovimientoExtraidoPDF[]` — se puede
 * reemplazar (o complementar) esta función por una llamada a un modelo con
 * visión (ej. Claude/GPT-4V sobre un render de cada página) sin tocar
 * ingestion-actions.ts ni la UI, en tanto devuelva esta misma forma.
 */
export function extraerMovimientosDeTexto(texto: string): MovimientoExtraidoPDF[] {
  const filas = reconstruirFilas(texto);
  const movimientos: MovimientoExtraidoPDF[] = [];

  for (const fila of filas) {
    const matchFecha = fila.match(REGEX_FECHA);
    if (!matchFecha) continue;
    const fecha = normalizarFecha(matchFecha[1], matchFecha[2], matchFecha[3]);
    if (!fecha) continue;

    const montoExtraido = extraerMonto(fila);
    if (!montoExtraido) continue;

    const concepto = fila
      .replace(matchFecha[0], "")
      .replace(montoExtraido.crudo, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!concepto) continue;

    const conceptoUpper = concepto.toUpperCase();
    const esEgreso =
      montoExtraido.crudo.startsWith("-") || PALABRAS_DEBITO.some((p) => conceptoUpper.includes(p.toUpperCase()));

    movimientos.push({
      fecha,
      amount: Math.abs(montoExtraido.valor),
      concept: concepto,
      payerIdentifier: extraerIdentificadorPagador(concepto),
      esEgreso,
      lineaOriginal: fila,
      externalId: generarExternalId(fecha, Math.abs(montoExtraido.valor), concepto),
    });
  }

  return movimientos;
}
