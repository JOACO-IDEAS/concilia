import Papa from "papaparse";

export interface MovimientoCSV {
  date: string; // ISO yyyy-mm-dd si se pudo normalizar; si no, el string crudo
  amount: number; // positivo = crédito, negativo = débito
  concept: string;
  payerIdentifier: string | null;
  referenceNumber: string | null;
}

export interface ResultadoParserCSV {
  ok: boolean;
  transactions: MovimientoCSV[];
  error?: string;
}

const COLUMNAS_FECHA = ["fecha", "date"];
const COLUMNAS_MONTO = ["monto", "importe", "amount", "valor"];
const COLUMNAS_CREDITO = ["credito", "haber", "credit"];
const COLUMNAS_DEBITO = ["debito", "debe", "debit"];
const COLUMNAS_CONCEPTO = ["concepto", "descripcion", "detalle", "concept", "description", "referencia"];
const COLUMNAS_IDENTIFICADOR = ["cuit", "cuil", "cbu", "cvu", "alias", "documento"];
const COLUMNAS_REFERENCIA_OP = ["comprobante", "operacion", "nro operacion", "reference", "id transaccion"];

function normalizarHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function encontrarColumna(headers: string[], candidatos: string[]): string | null {
  const normalizados = headers.map((h) => ({ original: h, norm: normalizarHeader(h) }));
  for (const candidato of candidatos) {
    const match = normalizados.find((h) => h.norm.includes(candidato));
    if (match) return match.original;
  }
  return null;
}

function parsearMontoEsAr(valor: string | undefined): number | null {
  if (!valor) return null;
  let limpio = valor.trim().replace(/[^\d.,-]/g, "");
  if (!limpio) return null;
  if (limpio.includes(",") && limpio.includes(".")) {
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (limpio.includes(",")) {
    limpio = limpio.replace(",", ".");
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function normalizarFecha(valor: string): string {
  const ddmmyyyy = valor.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (ddmmyyyy) {
    const [, d, m, a] = ddmmyyyy;
    const anio = a.length === 2 ? `20${a}` : a;
    return `${anio}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return valor;
}

/**
 * Parser de CSV 100% local e instantáneo (PapaParse, sin red, sin IA) —
 * bancos y billeteras suelen exportar CSV con columnas bien definidas, así
 * que no hace falta pasar por un LLM para esto (a diferencia de un PDF de
 * texto libre). `parseStatementWithAI` intenta esto PRIMERO para cualquier
 * CSV, sin importar si hay `OPENAI_API_KEY` configurada — solo cae a la IA
 * como respaldo si no se reconocen columnas usables acá.
 */
export function parsearCSVLocal(texto: string): ResultadoParserCSV {
  const parsed = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0) {
    return { ok: false, transactions: [], error: "El CSV no tiene encabezados reconocibles." };
  }

  const colFecha = encontrarColumna(headers, COLUMNAS_FECHA);
  const colMonto = encontrarColumna(headers, COLUMNAS_MONTO);
  const colCredito = encontrarColumna(headers, COLUMNAS_CREDITO);
  const colDebito = encontrarColumna(headers, COLUMNAS_DEBITO);
  const colConcepto = encontrarColumna(headers, COLUMNAS_CONCEPTO);
  const colIdentificador = encontrarColumna(headers, COLUMNAS_IDENTIFICADOR);
  const colReferencia = encontrarColumna(headers, COLUMNAS_REFERENCIA_OP);

  if (!colFecha || (!colMonto && !colCredito && !colDebito)) {
    return { ok: false, transactions: [], error: "No se reconocieron columnas de fecha/monto en el CSV." };
  }

  const transactions: MovimientoCSV[] = [];
  for (const fila of parsed.data) {
    const fechaCruda = fila[colFecha]?.trim();
    if (!fechaCruda) continue;

    let amount: number | null = null;
    if (colMonto) {
      amount = parsearMontoEsAr(fila[colMonto]);
    } else {
      const credito = colCredito ? parsearMontoEsAr(fila[colCredito]) : null;
      const debito = colDebito ? parsearMontoEsAr(fila[colDebito]) : null;
      if (credito) amount = Math.abs(credito);
      else if (debito) amount = -Math.abs(debito);
    }
    if (amount === null || amount === 0) continue;

    transactions.push({
      date: normalizarFecha(fechaCruda),
      amount,
      concept: colConcepto ? (fila[colConcepto] ?? "").trim() : "",
      payerIdentifier: colIdentificador ? fila[colIdentificador]?.trim() || null : null,
      referenceNumber: colReferencia ? fila[colReferencia]?.trim() || null : null,
    });
  }

  return {
    ok: transactions.length > 0,
    transactions,
    error: transactions.length === 0 ? "No se encontraron movimientos válidos en el CSV." : undefined,
  };
}
