export interface PagoExtraido {
  externalId: string;
  amount: number;
  currency: string;
  payerIdentifier: string | null;
  concept: string | null;
  provider: string;
}

export class PayloadInvalidoError extends Error {}

function primero(obj: Record<string, unknown>, claves: string[]): unknown {
  for (const clave of claves) {
    const valor = obj[clave];
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return undefined;
}

function aTexto(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

function aNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") {
    let limpio = valor.trim().replace(/[^\d.,-]/g, "");
    if (limpio.includes(",") && limpio.includes(".")) {
      // Formato es-AR/es-ES: "50.000,25" (punto = miles, coma = decimales).
      limpio = limpio.replace(/\./g, "").replace(",", ".");
    } else if (limpio.includes(",")) {
      // "50000,25" — la coma es el separador decimal.
      limpio = limpio.replace(",", ".");
    }
    // si solo tiene puntos (o ninguno), ya está en formato válido para Number().
    const n = Number(limpio);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Normaliza el payload de distintos proveedores de Open Banking / pasarelas
 * (Belvo, Prometeo, Pluggy, genéricos) a una forma común. Cada proveedor
 * nombra los campos distinto — acá se prueban las variantes más comunes.
 *
 * Para integrar un proveedor específico con nombres de campo propios, sumar
 * esos nombres a las listas de `primero(...)` de abajo — no hace falta tocar
 * el resto del pipeline (verificación de firma, reconciliación, UI).
 */
export function extraerPagoDelPayload(
  payloadCrudo: unknown,
  providerDeHeader?: string
): PagoExtraido {
  if (typeof payloadCrudo !== "object" || payloadCrudo === null || Array.isArray(payloadCrudo)) {
    throw new PayloadInvalidoError("El body del webhook debe ser un objeto JSON.");
  }
  const payload = payloadCrudo as Record<string, unknown>;

  // Algunos proveedores anidan los datos reales en "data" / "transaction" / "payment".
  const anidado = payload.data ?? payload.transaction ?? payload.payment;
  const raiz = (
    typeof anidado === "object" && anidado !== null ? anidado : payload
  ) as Record<string, unknown>;

  const externalId = aTexto(
    primero(raiz, ["transaction_id", "id", "movement_id", "payment_id", "external_id"])
  );
  if (!externalId) {
    throw new PayloadInvalidoError(
      "No se encontró un identificador de transacción (transaction_id / id)."
    );
  }

  const amount = aNumero(primero(raiz, ["amount", "monto", "value", "amount_total"]));
  if (amount === null) {
    throw new PayloadInvalidoError("No se encontró un monto (amount) numérico válido.");
  }

  const currency = aTexto(primero(raiz, ["currency", "currency_code", "moneda"])) ?? "ARS";

  const payerIdentifier = aTexto(
    primero(raiz, [
      "payer_tax_id",
      "payer_document",
      "document_number",
      "cuit",
      "tax_id",
      "cbu",
      "alias",
      "account_number",
      "payer_account",
    ])
  );

  const concept = aTexto(
    primero(raiz, ["concept", "reference", "description", "detail", "concepto"])
  );

  const provider = aTexto(primero(payload, ["provider", "source"])) ?? providerDeHeader ?? "generic";

  return { externalId, amount, currency, payerIdentifier, concept, provider };
}
