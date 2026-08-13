import { describe, expect, it } from "vitest";
import { convertirATransaccionesPipeline } from "./ai-parser";

// Fase 3.2 — confirma que la fecha real (`date`) y la referencia bancaria
// (`referenceNumber`) sobreviven la transformación de TransaccionIA a
// MovimientoExtraidoPDF, sin romper la construcción existente de
// externalId/lineaOriginal (que ya usaba referenceNumber para otra cosa).
describe("convertirATransaccionesPipeline — preserva fecha y referencia (Fase 3.2)", () => {
  it("preserva la fecha real del movimiento en el campo `fecha`", () => {
    const [mov] = convertirATransaccionesPipeline({
      transactions: [
        {
          date: "2026-08-05",
          amount: 145000,
          concept: "Transferencia recibida",
          payerIdentifier: "20289900113",
          referenceNumber: null,
        },
      ],
    });
    expect(mov.fecha).toBe("2026-08-05");
  });

  it("preserva referenceNumber como campo propio cuando el movimiento lo trae", () => {
    const [mov] = convertirATransaccionesPipeline({
      transactions: [
        {
          date: "2026-08-05",
          amount: 145000,
          concept: "Transferencia recibida",
          payerIdentifier: "20289900113",
          referenceNumber: "REF-998877",
        },
      ],
    });
    expect(mov.referenceNumber).toBe("REF-998877");
    // No rompe el comportamiento existente: externalId y lineaOriginal
    // siguen construyéndose igual que antes de esta fase.
    expect(mov.externalId).toBe("ai:ref:ref-998877");
    expect(mov.lineaOriginal).toBe("Transferencia recibida (ref: REF-998877)");
  });

  it("referenceNumber queda null cuando el movimiento no trae referencia, sin romper el hash de externalId", () => {
    const [mov] = convertirATransaccionesPipeline({
      transactions: [
        {
          date: "2026-08-05",
          amount: 145000,
          concept: "Transferencia recibida",
          payerIdentifier: null,
          referenceNumber: null,
        },
      ],
    });
    expect(mov.referenceNumber).toBeNull();
    expect(mov.externalId.startsWith("pdf:")).toBe(true); // hash determinístico, comportamiento sin cambios
    expect(mov.lineaOriginal).toBe("Transferencia recibida");
  });

  it("descarta movimientos con fecha mal formada, igual que antes de esta fase", () => {
    const movimientos = convertirATransaccionesPipeline({
      transactions: [
        {
          date: "fecha-invalida",
          amount: 100,
          concept: "x",
          payerIdentifier: null,
          referenceNumber: null,
        },
      ],
    });
    expect(movimientos).toHaveLength(0);
  });
});
