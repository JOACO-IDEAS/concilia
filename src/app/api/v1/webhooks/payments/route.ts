import { NextResponse, after, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { verificarFirmaWebhook } from "@/lib/payments/verify-signature";
import { extraerPagoDelPayload, PayloadInvalidoError } from "@/lib/payments/extract-payload";
import { reconcilePayment } from "@/lib/payments/reconcile-payment";
import { notificarPagoMatched, notificarPagoUnmatched } from "@/lib/notifications/send-payment-notifications";

const LOG = "[webhook:payments]";

/**
 * POST /api/v1/webhooks/payments
 *
 * Endpoint público para recibir notificaciones de cobro de proveedores de
 * Open Banking / pasarelas (Belvo, Prometeo, Pluggy, etc.).
 *
 * Autenticación: header `x-signature` (firma HMAC-SHA256 del body, hex o
 * "sha256=<hex>") o, como fallback, header `x-webhook-token` / query
 * `?token=` con el secreto compartido. Ver src/lib/payments/verify-signature.ts.
 *
 * Idempotencia: se identifica cada evento por su `transaction_id` (mapeado a
 * `PaymentTransaction.externalId`, con constraint único en la base). Un
 * mismo id nunca genera dos registros, aunque el proveedor reintente el
 * webhook — se responde 200 igual, para que el proveedor no siga
 * reintentando.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const verificacion = verificarFirmaWebhook({
    rawBody,
    headerSignature: request.headers.get("x-signature"),
    headerToken: request.headers.get("x-webhook-token"),
    queryToken: request.nextUrl.searchParams.get("token"),
  });

  if (!verificacion.ok) {
    console.warn(`${LOG} Rechazado — ${verificacion.motivo}`);
    return NextResponse.json({ error: "unauthorized", detail: verificacion.motivo }, { status: 401 });
  }

  let payloadJson: unknown;
  try {
    payloadJson = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    console.warn(`${LOG} Body no es JSON válido.`);
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  let pago;
  try {
    pago = extraerPagoDelPayload(payloadJson, request.headers.get("x-provider") ?? undefined);
  } catch (e) {
    const detail = e instanceof PayloadInvalidoError ? e.message : "Payload inválido.";
    console.warn(`${LOG} Payload inválido — ${detail}`);
    return NextResponse.json({ error: "invalid_payload", detail }, { status: 400 });
  }

  console.log(
    `${LOG} Recibido transaction_id=${pago.externalId} provider=${pago.provider} amount=${pago.amount} ${pago.currency} payer=${pago.payerIdentifier ?? "(sin identificar)"}`
  );

  try {
    // Idempotencia — chequeo rápido antes de la transacción para no pagar el
    // costo de la reconciliación en el caso (esperable) de reintentos.
    const existente = await prisma.paymentTransaction.findUnique({
      where: { externalId: pago.externalId },
      select: { id: true, status: true },
    });
    if (existente) {
      console.log(
        `${LOG} Duplicado ignorado — transaction_id=${pago.externalId} ya existe (status=${existente.status}).`
      );
      return NextResponse.json({ ok: true, duplicate: true, status: existente.status }, { status: 200 });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const reconciliacion = await reconcilePayment(pago.payerIdentifier, tx);

      const creado = await tx.paymentTransaction.create({
        data: {
          externalId: pago.externalId,
          provider: pago.provider,
          amount: pago.amount,
          currency: pago.currency,
          payerIdentifier: pago.payerIdentifier,
          concept: pago.concept,
          rawPayload: payloadJson as Prisma.InputJsonValue,
          status: reconciliacion.status,
          organizationId: reconciliacion.organizationId,
          matchedAt: reconciliacion.status === "MATCHED" ? new Date() : null,
          matchMethod: reconciliacion.status === "MATCHED" ? "AUTO" : null,
        },
      });

      return { creado, reconciliacion };
    });

    console.log(
      `${LOG} Procesado transaction_id=${pago.externalId} → ${resultado.reconciliacion.status} (${resultado.reconciliacion.motivo})`
    );

    // Notificaciones por email + WhatsApp — se disparan con `after()` para
    // que corran DESPUÉS de que la respuesta 200 ya salió: si algún canal
    // está lento o caído, el proveedor del webhook nunca lo nota ni
    // reintenta de más. Nunca deben poder tirar el request (por eso el
    // .catch acá, además de que ninguno de los dos dispatchers lanza — ver
    // src/lib/notifications/send-payment-notifications.ts).
    const paymentTransactionId = resultado.creado.id;
    if (resultado.reconciliacion.status === "MATCHED") {
      after(() =>
        notificarPagoMatched(paymentTransactionId).catch((e) =>
          console.error(`${LOG} Error inesperado notificando recibo de pago:`, e)
        )
      );
    } else if (resultado.reconciliacion.status === "UNMATCHED") {
      after(() =>
        notificarPagoUnmatched(paymentTransactionId).catch((e) =>
          console.error(`${LOG} Error inesperado notificando pago sin reconciliar:`, e)
        )
      );
    }

    return NextResponse.json(
      { ok: true, id: resultado.creado.id, status: resultado.reconciliacion.status },
      { status: 200 }
    );
  } catch (e) {
    // Carrera entre dos entregas casi simultáneas del mismo webhook: el
    // constraint único de externalId actúa como red de seguridad final.
    if (esErrorDeConstraintUnico(e)) {
      console.log(`${LOG} Duplicado detectado por constraint único — transaction_id=${pago.externalId}`);
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }

    console.error(`${LOG} Error procesando transaction_id=${pago.externalId}:`, e);

    return NextResponse.json(
      {
        error: "processing_failed",
        detail: esErrorDeConexion(e)
          ? "No hay una base de datos conectada todavía."
          : "Error interno al procesar el webhook.",
      },
      { status: 500 }
    );
  }
}

function esErrorDeConstraintUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === "P2002";
}

function esErrorDeConexion(e: unknown): boolean {
  // El mensaje humano de PrismaClientKnownRequestError suele venir vacío —
  // el detalle real vive en `code` (ECONNREFUSED del driver `pg`, o P1001
  // "Can't reach database server" del motor de Prisma).
  const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
  const mensaje = e instanceof Error ? e.message : "";
  return /ECONNREFUSED|ENOTFOUND|P1001|P1002/i.test(code) || /connect|no-configurado/i.test(mensaje);
}
