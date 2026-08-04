import { createHmac } from "node:crypto";
import { compararConstante } from "@/lib/security/timing-safe-compare";

export type ResultadoVerificacion = { ok: true } | { ok: false; motivo: string };

/**
 * Verifica que un webhook entrante venga realmente del proveedor configurado
 * (Belvo/Prometeo/Pluggy/pasarela) y no de un tercero cualquiera.
 *
 * Soporta dos modos, según lo que mande el proveedor:
 *  1. Firma HMAC-SHA256 del body crudo en el header `x-signature` (acepta
 *     tanto el hex digest solo como el formato "sha256=<hex>" que usan
 *     Stripe/GitHub).
 *  2. Token compartido simple, como fallback, vía header `x-webhook-token`
 *     o query param `?token=` — útil para proveedores que no firman, o para
 *     pruebas manuales.
 *
 * Si `PAYMENTS_WEBHOOK_SECRET` no está configurada, se rechaza *todo* — fail
 * closed. Nunca se aceptan webhooks sin verificar solo porque falte la
 * configuración del secreto.
 *
 * La comparación usa `timingSafeEqual` (no `===`) para no filtrar el secreto
 * por diferencias de tiempo de respuesta (timing attack).
 */
export function verificarFirmaWebhook(params: {
  rawBody: string;
  headerSignature: string | null;
  headerToken: string | null;
  queryToken: string | null;
}): ResultadoVerificacion {
  const secret = process.env.PAYMENTS_WEBHOOK_SECRET;
  if (!secret) {
    return {
      ok: false,
      motivo: "PAYMENTS_WEBHOOK_SECRET no está configurada en el servidor — se rechazan todos los webhooks hasta configurarla.",
    };
  }

  if (params.headerSignature) {
    const firmaEsperada = createHmac("sha256", secret).update(params.rawBody).digest("hex");
    const firmaRecibida = params.headerSignature.replace(/^sha256=/i, "").trim();
    if (compararConstante(firmaEsperada, firmaRecibida)) {
      return { ok: true };
    }
    return { ok: false, motivo: "Firma en x-signature inválida." };
  }

  const tokenRecibido = params.headerToken ?? params.queryToken;
  if (tokenRecibido && compararConstante(secret, tokenRecibido)) {
    return { ok: true };
  }

  return {
    ok: false,
    motivo: "Falta un header x-signature válido o un token (x-webhook-token / ?token=).",
  };
}
