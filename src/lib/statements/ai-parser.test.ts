import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStatementWithAI } from "./ai-parser";

const FIXTURES = join(__dirname, "..", "documents", "__fixtures__");

const ARCHIVOS = [
  {
    tipo: "PDF",
    buffer: readFileSync(join(FIXTURES, "extracto-bancario.pdf")),
    mimeType: "application/pdf",
    fileName: "extracto-bancario.pdf",
  },
  {
    tipo: "CSV",
    buffer: readFileSync(join(FIXTURES, "extracto-bancario.csv")),
    mimeType: "text/csv",
    fileName: "extracto-bancario.csv",
  },
  {
    tipo: "Excel",
    buffer: readFileSync(join(FIXTURES, "extracto-bancario.xlsx")),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: "extracto-bancario.xlsx",
  },
];

// Respuesta simulada de OpenAI — no se llama a la red real. El objetivo de
// esta suite es probar que PDF/CSV/Excel llegan al MISMO pipeline de IA
// (mismo modelo, mismo prompt, mismo schema), no probar la calidad del
// modelo en sí (eso ya se verificó manualmente contra la API real en
// iteraciones anteriores).
function mockRespuestaOpenAI() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              bankName: "Banco Galicia",
              accountIdentifier: null,
              transactions: [
                {
                  date: "2026-03-03",
                  amount: 85400,
                  concept: "Transferencia recibida Juan Perez",
                  payerIdentifier: "20345678901",
                  referenceNumber: null,
                },
              ],
            }),
          },
        },
      ],
    }),
  };
}

describe("parseStatementWithAI — PDF/CSV/Excel alimentan exactamente el mismo pipeline de IA", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-fake-key-for-pipeline-routing-test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const archivo of ARCHIVOS) {
    it(`${archivo.tipo}: usa el mismo modelo, prompt y schema que los demás formatos`, async () => {
      fetchMock = vi.fn().mockResolvedValue(mockRespuestaOpenAI());
      vi.stubGlobal("fetch", fetchMock);

      const resultado = await parseStatementWithAI(archivo.buffer, archivo.mimeType, archivo.fileName);

      expect(resultado.ok).toBe(true);
      expect(resultado.usedAI).toBe(true);
      expect(resultado.transactions).toHaveLength(1);
      expect(resultado.transactions[0].payerIdentifier).toBe("20345678901");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opciones] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");

      const body = JSON.parse(opciones.body as string);
      expect(body.model).toBe("gpt-4o-mini");
      expect(body.response_format.json_schema.name).toBe("extracto_bancario");
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("experto procesando extractos bancarios argentinos");

      // El contenido del usuario es el texto ya extraído del documento —
      // sin importar si vino de un PDF (unpdf), un CSV (passthrough) o un
      // Excel (xlsx): todos llegan como el mismo "type: text" content block,
      // y todos deben contener el mismo dato real del extracto de prueba.
      const contenidoUsuario = body.messages[1].content;
      expect(contenidoUsuario[0].type).toBe("text");
      expect(contenidoUsuario[0].text).toContain("20345678901");
    });
  }

  it("las tres llamadas usan literalmente el mismo system prompt (no hay ramas por tipo de archivo)", async () => {
    const prompts: string[] = [];
    for (const archivo of ARCHIVOS) {
      const mock = vi.fn().mockResolvedValue(mockRespuestaOpenAI());
      vi.stubGlobal("fetch", mock);
      await parseStatementWithAI(archivo.buffer, archivo.mimeType, archivo.fileName);
      const body = JSON.parse(mock.mock.calls[0][1].body as string);
      prompts.push(body.messages[0].content);
      vi.unstubAllGlobals();
    }
    expect(new Set(prompts).size).toBe(1); // los 3 prompts son exactamente el mismo string
  });
});
