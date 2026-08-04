import { prisma } from "@/lib/prisma";

export interface SugerenciaSmartMatch {
  organizationId: string;
  organizationName: string;
  taxId: string;
  confidence: number; // 0-99 — se reserva 100 para el match exacto que ya resuelve reconcile-payment.ts
  motivo: string;
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PALABRAS_VACIAS = new Set([
  "consorcio",
  "sa",
  "srl",
  "sociedad",
  "anonima",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
]);

function tokenizar(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

// Distancia de Levenshtein — usada para medir similitud entre strings cortos
// (CUIT/CBU/Alias) que pueden tener typos o dígitos de más/menos, a
// diferencia del match exacto que ya intenta reconcile-payment.ts.
function distanciaLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const fila = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) fila[j] = j;

  for (let i = 1; i <= m; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = fila[j];
      fila[j] = a[i - 1] === b[j - 1] ? anterior : 1 + Math.min(anterior, fila[j], fila[j - 1]);
      anterior = temp;
    }
  }
  return fila[n];
}

function similitud(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distanciaLevenshtein(a, b) / maxLen;
}

/**
 * Calcula un Top 3 de organizaciones candidatas para un PaymentTransaction
 * UNMATCHED, con un % de confianza heurístico (no ML — reglas simples y
 * explicables, igual que el resto del motor de reconciliación).
 *
 * Señales evaluadas (cada una suma puntos independientes, hasta 99):
 *  1. `payerIdentifier` similar (no exacto — el exacto ya lo resuelve
 *     reconcile-payment.ts) al CUIT de la organización o al CBU/Alias de
 *     alguno de sus BillingProfile — hasta 45 puntos, según % de similitud.
 *  2. `concept` con tokens en común con el nombre de la organización — hasta
 *     30 puntos.
 *  3. `amount` idéntico al de otro pago ya MATCHED de la misma organización
 *     (patrón de expensa recurrente) — 25 puntos fijos.
 *
 * Solo se devuelven candidatos con confianza >= 20 (ruido descartado).
 */
export async function calcularSugerenciasSmartMatch(
  paymentTransactionId: string
): Promise<{ ok: boolean; sugerencias: SugerenciaSmartMatch[]; error?: string }> {
  try {
    const pago = await prisma.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
    });
    if (!pago) {
      return { ok: false, sugerencias: [], error: "El pago no existe." };
    }

    const [organizaciones, pagosMismoMonto] = await Promise.all([
      prisma.organization.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          taxId: true,
          billingProfiles: {
            where: { deletedAt: null },
            select: { bankAccountNumber: true },
          },
        },
      }),
      prisma.paymentTransaction.findMany({
        where: {
          status: "MATCHED",
          organizationId: { not: null },
          amount: pago.amount,
          id: { not: pago.id },
        },
        select: { organizationId: true },
      }),
    ]);

    const orgsConMontoHistorico = new Set(pagosMismoMonto.map((p) => p.organizationId));
    const payerDigits = pago.payerIdentifier ? soloDigitos(pago.payerIdentifier) : "";
    const payerNormalizado = pago.payerIdentifier ? normalizar(pago.payerIdentifier) : "";
    const conceptoTokens = pago.concept ? tokenizar(pago.concept) : [];

    const candidatos = organizaciones.map((org): SugerenciaSmartMatch => {
      let score = 0;
      const motivos: string[] = [];

      // 1. payerIdentifier vs CUIT / CBU-Alias
      if (pago.payerIdentifier) {
        let mejorSim = 0;
        let etiqueta = "";

        const taxIdDigits = soloDigitos(org.taxId);
        if (payerDigits && taxIdDigits) {
          const sim = similitud(payerDigits, taxIdDigits);
          if (sim > mejorSim) {
            mejorSim = sim;
            etiqueta = "CUIT";
          }
        }

        for (const perfil of org.billingProfiles) {
          const cbuDigits = soloDigitos(perfil.bankAccountNumber);
          const simDigits = payerDigits && cbuDigits ? similitud(payerDigits, cbuDigits) : 0;
          const simTexto = similitud(payerNormalizado, normalizar(perfil.bankAccountNumber));
          const sim = Math.max(simDigits, simTexto);
          if (sim > mejorSim) {
            mejorSim = sim;
            etiqueta = "CBU/Alias";
          }
        }

        if (mejorSim >= 0.5) {
          score += Math.round(mejorSim * 45);
          motivos.push(`${etiqueta} similar (${Math.round(mejorSim * 100)}% de coincidencia)`);
        }
      }

      // 2. concept vs nombre de la organización
      if (conceptoTokens.length > 0) {
        const nombreTokens = tokenizar(org.name);
        const nombreSet = new Set(nombreTokens);
        const coincidentes = conceptoTokens.filter((t) => nombreSet.has(t));
        if (coincidentes.length > 0 && nombreTokens.length > 0) {
          const ratio = coincidentes.length / nombreTokens.length;
          const puntos = Math.round(Math.min(ratio, 1) * 30);
          if (puntos > 0) {
            score += puntos;
            motivos.push(`nombre coincide parcialmente ("${coincidentes.join(" ")}")`);
          }
        }
      }

      // 3. monto igual a un pago histórico ya conciliado de esta organización
      if (orgsConMontoHistorico.has(org.id)) {
        score += 25;
        motivos.push("mismo monto que un pago anterior de esta organización");
      }

      const confidence = Math.min(score, 99);
      const motivo =
        motivos.length > 0
          ? motivos[0][0].toUpperCase() + motivos[0].slice(1) + (motivos.length > 1 ? ` + ${motivos.slice(1).join(" + ")}` : "")
          : "Sin coincidencias relevantes";

      return {
        organizationId: org.id,
        organizationName: org.name,
        taxId: org.taxId,
        confidence,
        motivo,
      };
    });

    const sugerencias = candidatos
      .filter((c) => c.confidence >= 20)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    return { ok: true, sugerencias };
  } catch (e) {
    return {
      ok: false,
      sugerencias: [],
      error: e instanceof Error ? e.message : "No se pudieron calcular sugerencias.",
    };
  }
}
