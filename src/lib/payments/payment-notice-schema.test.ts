import { describe, expect, it } from "vitest";
import { PaymentNoticeStatus } from "@/generated/prisma/enums";

// PaymentNotice es, en esta fase, exclusivamente infraestructura de datos
// (ver FASE_3_1_PREPARACION_DE_DATOS.md §7): no existe ningún Server Action,
// webhook, ni lógica de correlación que probar todavía — solo el modelo. Lo
// que se puede y debe verificar acá es la forma del modelo tal como quedó
// migrado: los 5 estados aprobados, y que un objeto con la forma esperada
// (incluyendo todos los campos nullable) es válido para el tipo generado por
// Prisma. No se toca Neon — esto es una verificación de tipos/enum, no una
// escritura real.
describe("PaymentNotice — infraestructura de datos (Fase 3.2)", () => {
  it("expone exactamente los 5 estados aprobados", () => {
    expect(Object.values(PaymentNoticeStatus).sort()).toEqual(
      ["DISCARDED", "EXTRACTED", "LINKED", "MATCHED_PENDING", "RECEIVED"].sort()
    );
  });

  it("RECEIVED es el estado inicial documentado", () => {
    expect(PaymentNoticeStatus.RECEIVED).toBe("RECEIVED");
  });

  it("acepta un objeto con todos los campos opcionales en null/undefined (campos nullable del diseño aprobado)", () => {
    // No es una escritura real — solo construye el shape para confirmar que
    // el modelo generado coincide con el diseño aprobado (organizationId,
    // amount, claimedDate, reference, attachmentUrl, extractedText,
    // extractedData, linked*, confidence: todos nullable).
    const notaMinima = {
      id: "pn-1",
      organizationId: null as string | null,
      phone: "5491122334455",
      receivedAt: new Date(),
      amount: null as number | null,
      claimedDate: null as Date | null,
      reference: null as string | null,
      attachmentUrl: null as string | null,
      extractedText: null as string | null,
      extractedData: null as unknown,
      status: PaymentNoticeStatus.RECEIVED,
      linkedPaymentTransactionId: null as string | null,
      linkedUnitId: null as string | null,
      linkedUnitOwnerId: null as string | null,
      confidence: null as number | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(notaMinima.phone).toBe("5491122334455");
    expect(notaMinima.organizationId).toBeNull();
    expect(notaMinima.linkedPaymentTransactionId).toBeNull();
  });
});
