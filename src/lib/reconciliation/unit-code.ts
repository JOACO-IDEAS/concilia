// Canonicalización de Unit.code — diseño aprobado en
// FASE_3_1_PREPARACION_DE_DATOS.md §3. El dato original de `Unit.code`
// NUNCA se toca ni se sobreescribe; esto es una función pura que se calcula
// al vuelo cada vez que hace falta comparar.

import { quitarDiacriticos } from "./text-utils";

// Lista CERRADA de prefijos/palabras reconocidas — aprobada explícitamente
// (no una regla genérica tipo "sacar la primera palabra", que podría romper
// un código legítimo). Se comparan ya sin separadores (ver abajo), por eso
// "U.F." se guarda acá también como "UF".
const PREFIJOS_RECONOCIDOS = ["UF", "UNIDAD", "DEPARTAMENTO", "DEPTO", "PISO", "PB"];

/**
 * Normaliza un código de unidad a su forma canónica para COMPARAR (nunca
 * para mostrar ni para persistir). "3A" / "3 A" / "UF 3A" / "UF3A" / "3-a" /
 * "3°A" colapsan todos a "3A".
 *
 * Orden deliberado: primero se quitan los separadores no significativos
 * (así "U.F." y "UF" quedan idénticos, y "UF 3A"/"UF3A" también) y RECIÉN
 * DESPUÉS se busca un prefijo reconocido al inicio del texto ya compacto —
 * usar `\b` (límite de palabra) para esto no funciona, porque en "UF3A" no
 * hay ningún límite de palabra entre "F" y "3" (ambos son caracteres de
 * palabra para la regex).
 */
export function canonicalizarCodigoUnidad(codigo: string): string {
  let texto = quitarDiacriticos(codigo).toUpperCase();

  // Separadores no significativos: espacios, guiones, puntos, símbolo de grado.
  texto = texto.replace(/[\s\-.°º]/g, "");

  for (const prefijo of PREFIJOS_RECONOCIDOS) {
    if (texto.startsWith(prefijo) && texto.length > prefijo.length) {
      texto = texto.slice(prefijo.length);
      break; // un solo prefijo — evita sacar de más
    }
  }

  return texto;
}

/**
 * Extracción determinística (regex, sin IA — ver
 * RECONCILIATION_MATCHING_ARCHITECTURE.md §13) de un posible código de
 * unidad dentro de un texto libre (`PaymentTransaction.concept`). Devuelve
 * el texto candidato TAL CUAL aparece, sin canonicalizar — quien lo use debe
 * canonicalizarlo antes de comparar. `null` si no se encuentra nada
 * plausible. Deliberadamente conservador: prefiere no encontrar nada a
 * encontrar un falso positivo.
 */
export function extraerCodigoUnidadDeTexto(texto: string): string | null {
  // "UF 3A", "U.F. 3A", "UNIDAD 3A", "DEPTO 3A", "PISO 3 A" seguido de un
  // código corto alfanumérico (típicamente 1-4 caracteres, ej. "3A", "12B", "5").
  const conPrefijo = texto.match(/\b(?:U\.?F\.?|UNIDAD|DEPTO\.?|DEPARTAMENTO|PISO)\s*([0-9]{1,3}\s*-?\s*[A-Z]?)\b/i);
  if (conPrefijo) return conPrefijo[0];
  return null;
}
