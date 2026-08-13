// Conexión segura del motor al flujo real — Fase 3.4
// (FASE_3_4_IMPLEMENTATION_PLAN.md §2/§6). `ejecutarMatchingEnSombra` es lo
// que llaman confirmarExtractoPDF y el webhook de pagos, siempre DESPUÉS de
// que el PaymentTransaction ya está confirmado/committeado — nunca antes,
// nunca dentro de la misma transacción de escritura del pago. Si el
// matching falla por lo que sea, se atrapa acá adentro y NUNCA se propaga:
// el pago ya quedó persistido de todos modos, eso es responsabilidad de
// quien llama, no de esto.

import { runMatchingInShadow } from "./match-engine";
import { defaultShadowResultStore, type ShadowResultStore } from "./shadow-store";
import type { MatchContext } from "./deterministic-matcher";

const LOG = "[matching:shadow]";

/**
 * Corre el motor sobre un PaymentTransaction ya persistido y guarda el
 * resultado (upsert idempotente por paymentTransactionId+engineVersion, ver
 * shadow-store.ts). Nunca lanza — cualquier error queda logueado y la
 * función devuelve `null`, para que quien la llame (siempre desde un
 * `after()`, nunca bloqueando la respuesta) no tenga que manejar un catch
 * propio en cada call-site.
 */
export async function ejecutarMatchingEnSombra(
  paymentTransactionId: string,
  options: { context?: MatchContext; store?: ShadowResultStore } = {}
): Promise<void> {
  const store = options.store ?? defaultShadowResultStore;
  try {
    const resultado = await runMatchingInShadow(paymentTransactionId, options.context);
    await store.guardar(resultado);
  } catch (e) {
    console.error(`${LOG} Error evaluando PaymentTransaction ${paymentTransactionId} (no afecta el pago ya persistido):`, e);
  }
}
