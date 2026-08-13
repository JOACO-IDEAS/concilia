import { describe, expect, it } from "vitest";
import { extraerPagoDelPayload, PayloadInvalidoError } from "./extract-payload";

const BASE = { transaction_id: "tx-1", amount: 1000, currency: "ARS" };

describe("extraerPagoDelPayload — transactionDate/referenceNumber (Fase 3.2)", () => {
  it("extrae transactionDate cuando el payload trae una variante reconocida", () => {
    const r1 = extraerPagoDelPayload({ ...BASE, transaction_date: "2026-08-05" });
    expect(r1.transactionDate).toBeInstanceOf(Date);
    expect(r1.transactionDate?.toISOString().slice(0, 10)).toBe("2026-08-05");

    const r2 = extraerPagoDelPayload({ ...BASE, fecha: "2026-08-06" });
    expect(r2.transactionDate?.toISOString().slice(0, 10)).toBe("2026-08-06");
  });

  it("transactionDate es null si el payload no trae ninguna variante reconocida", () => {
    const r = extraerPagoDelPayload({ ...BASE });
    expect(r.transactionDate).toBeNull();
  });

  it("transactionDate es null (no lanza) ante una fecha no parseable", () => {
    const r = extraerPagoDelPayload({ ...BASE, transaction_date: "no-es-una-fecha" });
    expect(r.transactionDate).toBeNull();
  });

  it("extrae referenceNumber cuando el payload trae una variante reconocida", () => {
    const r = extraerPagoDelPayload({ ...BASE, reference_number: "REF-12345" });
    expect(r.referenceNumber).toBe("REF-12345");
  });

  it("referenceNumber es null si no hay ninguna variante reconocida", () => {
    const r = extraerPagoDelPayload({ ...BASE });
    expect(r.referenceNumber).toBeNull();
  });

  it("no cambia el mapeo existente de concept (que ya usaba 'reference')", () => {
    // 'reference' ya estaba tomado por concept antes de esta fase — confirma
    // que agregar variantes de referenceNumber no le pisó ese campo.
    const r = extraerPagoDelPayload({ ...BASE, reference: "Pago de expensas" });
    expect(r.concept).toBe("Pago de expensas");
    expect(r.referenceNumber).toBeNull();
  });

  it("un payload sin ninguno de los campos nuevos sigue siendo válido (compatibilidad hacia atrás)", () => {
    const r = extraerPagoDelPayload({ ...BASE, concept: "Transferencia" });
    expect(r.externalId).toBe("tx-1");
    expect(r.amount).toBe(1000);
    expect(r.transactionDate).toBeNull();
    expect(r.referenceNumber).toBeNull();
  });

  it("sigue rechazando un payload sin transaction_id, como antes", () => {
    expect(() => extraerPagoDelPayload({ amount: 100 })).toThrow(PayloadInvalidoError);
  });
});
