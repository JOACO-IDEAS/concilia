// Utilidad pura de normalización de período — separada de
// obligaciones-actions.ts a propósito: ese archivo es "use server", y
// Next.js exige que TODO export de un archivo así sea una Server Action
// async; una función sync como esta rompería la compilación del módulo
// entero (y, con Turbopack, arrastra al resto de la app).

/**
 * Normaliza texto libre de período a un `Date` de primer-día-de-mes UTC —
 * acepta "YYYY-MM", "YYYY-MM-DD" (ignora el día) y "MM/YYYY". Cualquier otro
 * formato devuelve `null` — nunca se adivina un período ambiguo.
 */
export function parsearPeriodo(valor: string): Date | null {
  const texto = valor.trim();

  const isoCompleto = texto.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (isoCompleto) {
    const anio = Number(isoCompleto[1]);
    const mes = Number(isoCompleto[2]);
    if (mes < 1 || mes > 12) return null;
    return new Date(Date.UTC(anio, mes - 1, 1));
  }

  const mesAnio = texto.match(/^(\d{1,2})\/(\d{4})$/);
  if (mesAnio) {
    const mes = Number(mesAnio[1]);
    const anio = Number(mesAnio[2]);
    if (mes < 1 || mes > 12) return null;
    return new Date(Date.UTC(anio, mes - 1, 1));
  }

  return null;
}
