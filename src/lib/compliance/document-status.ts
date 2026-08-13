// Fase 4 Parte C — cálculo de vigencia de un ProviderDocument. Función PURA
// a propósito: cero import de Prisma, cero conocimiento de Ley 941 ni de
// ninguna normativa puntual — un futuro agente (o cualquier otro consumidor)
// puede llamarla sin saber cómo está modelada la base ni qué ley aplica.
//
// "Vigente/vencido" es siempre DERIVADO, nunca un campo persistido — mismo
// criterio ya usado para "obligación vencida" en el motor de expensas
// (OBLIGATION_MODEL.md §3): calcularlo al vuelo evita que alguien tenga que
// mantenerlo sincronizado con el reloj.

export type EstadoDocumentoCompliance = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "SIN_VENCIMIENTO";

export interface DocumentoParaEvaluarVigencia {
  validTo: Date | null;
}

const VENTANA_DIAS_PROXIMO_A_VENCER_DEFAULT = 30;

/**
 * `validTo=null` → `SIN_VENCIMIENTO` (ej. una matrícula que no vence) —
 * nunca se confunde con "vencido" ni con "vigente": es una tercera
 * categoría explícita, igual que ya se distingue `null` de `0` en los
 * campos diagnósticos de `ShadowMatchResult` (Fase 3.9).
 */
export function calcularEstadoDocumento(
  documento: DocumentoParaEvaluarVigencia,
  opciones: { ventanaDiasProximoAVencer?: number; ahora?: Date } = {}
): EstadoDocumentoCompliance {
  if (documento.validTo === null) return "SIN_VENCIMIENTO";

  const ventana = opciones.ventanaDiasProximoAVencer ?? VENTANA_DIAS_PROXIMO_A_VENCER_DEFAULT;
  const ahora = opciones.ahora ?? new Date();

  const diffDias = (documento.validTo.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDias < 0) return "EXPIRED";
  if (diffDias <= ventana) return "EXPIRING_SOON";
  return "VALID";
}
