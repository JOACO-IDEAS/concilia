import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { ArchivoParseado } from "./types";

export class ArchivoNoSoportadoError extends Error {}

const LIMITE_FILAS = 500;

function extensionDe(nombre: string): string {
  const idx = nombre.lastIndexOf(".");
  return idx === -1 ? "" : nombre.slice(idx + 1).toLowerCase();
}

async function parsearCsv(archivo: File): Promise<ArchivoParseado> {
  const texto = await archivo.text();
  const resultado = Papa.parse<string[]>(texto, { skipEmptyLines: true });

  const [headerRow, ...filas] = resultado.data;
  if (!headerRow || headerRow.length === 0) {
    throw new Error("El archivo CSV está vacío.");
  }

  return {
    nombreArchivo: archivo.name,
    headers: headerRow.map((h) => String(h).trim()),
    filas: filas.map((fila) => fila.map((celda) => String(celda ?? "").trim())),
    totalFilasOriginal: filas.length,
  };
}

function celdaATexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toLocaleDateString("es-AR");
  if (typeof valor === "object") {
    // fórmulas, hipervínculos, texto enriquecido: exceljs las modela como objetos.
    if ("text" in valor && typeof valor.text === "string") return valor.text;
    if ("result" in valor) return celdaATexto(valor.result as ExcelJS.CellValue);
    if ("hyperlink" in valor && typeof valor.hyperlink === "string") return valor.hyperlink;
    return "";
  }
  return String(valor).trim();
}

async function parsearXlsx(archivo: File): Promise<ArchivoParseado> {
  const buffer = await archivo.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const hoja = workbook.worksheets[0];
  if (!hoja) {
    throw new Error("El archivo Excel no tiene ninguna hoja con datos.");
  }

  const filasCrudas: string[][] = [];
  hoja.eachRow({ includeEmpty: false }, (row) => {
    const raw = row.values as ExcelJS.CellValue[];
    // exceljs indexa row.values desde 1 (el índice 0 queda vacío) — se descarta.
    const valores = raw.slice(1).map(celdaATexto);
    filasCrudas.push(valores);
  });

  const [headerRow, ...filas] = filasCrudas;
  if (!headerRow || headerRow.length === 0) {
    throw new Error("El archivo Excel está vacío.");
  }

  return {
    nombreArchivo: archivo.name,
    headers: headerRow.map((h) => h.trim()),
    filas,
    totalFilasOriginal: filas.length,
  };
}

/**
 * Parsea un archivo subido por el usuario (.xlsx o .csv) enteramente en el
 * navegador — no se sube el archivo crudo al servidor, solo los datos ya
 * validados/editados del Paso 3 (ver actions.ts).
 *
 * Nota: el formato legacy .xls (Excel 97-2003) no está soportado a propósito
 * — la única librería con soporte amplio para ese formato binario (`xlsx` /
 * SheetJS) tiene vulnerabilidades altas sin parchear en el registro de npm
 * (prototype pollution + ReDoS). Se usan `exceljs` (.xlsx) y `papaparse`
 * (.csv) en su lugar, ambas sin vulnerabilidades conocidas de severidad alta.
 */
export async function parsearArchivo(archivo: File): Promise<ArchivoParseado> {
  const ext = extensionDe(archivo.name);

  let resultado: ArchivoParseado;
  if (ext === "csv") {
    resultado = await parsearCsv(archivo);
  } else if (ext === "xlsx") {
    resultado = await parsearXlsx(archivo);
  } else if (ext === "xls") {
    throw new ArchivoNoSoportadoError(
      "El formato .xls (Excel 97-2003) no está soportado por motivos de seguridad. Volvé a guardar el archivo como .xlsx o .csv desde Excel/Google Sheets y subilo de nuevo."
    );
  } else {
    throw new ArchivoNoSoportadoError(`Formato ".${ext || "?"}" no soportado. Subí un archivo .xlsx o .csv.`);
  }

  if (resultado.filas.length > LIMITE_FILAS) {
    resultado = { ...resultado, filas: resultado.filas.slice(0, LIMITE_FILAS) };
  }

  return resultado;
}
