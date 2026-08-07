import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extraerTextoDeDocumento } from "./index";
import { PdfExtractor } from "./pdf-extractor";
import { ExcelExtractor } from "./excel-extractor";
import { CsvExtractor } from "./csv-extractor";

const FIXTURES = join(__dirname, "__fixtures__");

const PDF = {
  buffer: readFileSync(join(FIXTURES, "extracto-bancario.pdf")),
  mimeType: "application/pdf",
  fileName: "extracto-bancario.pdf",
};
const CSV = {
  buffer: readFileSync(join(FIXTURES, "extracto-bancario.csv")),
  mimeType: "text/csv",
  fileName: "extracto-bancario.csv",
};
const XLSX_FILE = {
  buffer: readFileSync(join(FIXTURES, "extracto-bancario.xlsx")),
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  fileName: "extracto-bancario.xlsx",
};

describe("PdfExtractor (unpdf)", () => {
  it("reconoce PDFs por mimeType y por extensión", () => {
    expect(PdfExtractor.supports(PDF)).toBe(true);
    expect(PdfExtractor.supports({ mimeType: "application/octet-stream", fileName: "x.pdf" })).toBe(true);
    expect(PdfExtractor.supports(CSV)).toBe(false);
    expect(PdfExtractor.supports(XLSX_FILE)).toBe(false);
  });

  it("extrae los movimientos reales del extracto bancario en PDF", async () => {
    const texto = await PdfExtractor.extract(PDF);
    expect(texto).toContain("JUAN PEREZ");
    expect(texto).toContain("20345678901");
    expect(texto).toContain("85.400,00");
    expect(texto).toContain("MARIA GONZALEZ");
    expect(texto).toContain("SALDO FINAL");
  });
});

describe("ExcelExtractor (xlsx)", () => {
  it("reconoce .xlsx/.xls por mimeType y por extensión, no CSV", () => {
    expect(ExcelExtractor.supports(XLSX_FILE)).toBe(true);
    expect(ExcelExtractor.supports({ mimeType: "application/octet-stream", fileName: "x.xls" })).toBe(true);
    expect(ExcelExtractor.supports(CSV)).toBe(false);
    expect(ExcelExtractor.supports(PDF)).toBe(false);
  });

  it("convierte cada hoja del Excel a texto CSV con los movimientos reales", async () => {
    const texto = await ExcelExtractor.extract(XLSX_FILE);
    expect(texto).toContain("Juan Perez");
    expect(texto).toContain("20345678901");
    expect(texto).toContain("85400");
    expect(texto).toContain("Maria Gonzalez");
  });
});

describe("CsvExtractor", () => {
  it("reconoce archivos .csv por extensión", () => {
    expect(CsvExtractor.supports(CSV)).toBe(true);
    expect(CsvExtractor.supports(PDF)).toBe(false);
    expect(CsvExtractor.supports(XLSX_FILE)).toBe(false);
  });

  it("decodifica el CSV tal cual, sin transformar (la IA lo interpreta desprolijo)", async () => {
    const texto = await CsvExtractor.extract(CSV);
    expect(texto).toContain("Juan Perez");
    expect(texto).toContain("85400,00");
  });
});

describe("extraerTextoDeDocumento (registro / punto de entrada único)", () => {
  it("elige automáticamente el extractor correcto para PDF, CSV y Excel", async () => {
    const [textoPdf, textoCsv, textoXlsx] = await Promise.all([
      extraerTextoDeDocumento(PDF),
      extraerTextoDeDocumento(CSV),
      extraerTextoDeDocumento(XLSX_FILE),
    ]);

    expect(textoPdf).toContain("20345678901");
    expect(textoCsv).toContain("20345678901");
    expect(textoXlsx).toContain("20345678901");
  });

  it("tira un error claro para un tipo de archivo no soportado", async () => {
    await expect(
      extraerTextoDeDocumento({
        buffer: Buffer.from("no importa"),
        mimeType: "application/zip",
        fileName: "algo.zip",
      })
    ).rejects.toThrow(/No hay un extractor/);
  });
});
