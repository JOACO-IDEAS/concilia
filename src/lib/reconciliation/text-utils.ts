// Duplicado deliberado y documentado de las funciones privadas de
// src/lib/payments/smart-match.ts (normalizar/tokenizar/soloDigitos/
// similitud/distanciaLevenshtein). Ese archivo tiene prohibido modificarse
// en todas las fases de este proyecto — no se pueden exportar sus helpers
// sin tocarlo. Ver FASE_3_3_IMPLEMENTATION_PLAN.md §3 para la justificación
// completa. Si en el futuro deja de estar protegido, esto se puede
// reemplazar por un import compartido.

export function quitarDiacriticos(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizar(texto: string): string {
  return quitarDiacriticos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Lista de palabras vacías propia de personas físicas (nombres de titulares)
// — deliberadamente DISTINTA de la de smart-match.ts (que es de razón
// social: "sa", "srl", "sociedad anonima" no aplican acá).
const PALABRAS_VACIAS_NOMBRE = new Set(["de", "del", "la", "el", "los", "las", "y"]);

export function tokenizarNombre(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((t) => t.length > 1 && !PALABRAS_VACIAS_NOMBRE.has(t));
}

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

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

export function similitud(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distanciaLevenshtein(a, b) / maxLen;
}
