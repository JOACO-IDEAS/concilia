import { timingSafeEqual } from "node:crypto";

/**
 * Compara dos strings en tiempo constante (no usar `===`) — evita filtrar un
 * secreto por diferencias en el tiempo de respuesta (timing attack).
 * Compartido entre la verificación de firma de webhooks y el healthcheck.
 */
export function compararConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Igual comparamos contra sí mismo para no filtrar el largo real a
    // través del tiempo de respuesta.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
