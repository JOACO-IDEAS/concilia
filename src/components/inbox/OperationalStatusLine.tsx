/** Frase única de estado operativo — jerarquía #1 de Inicio (TASK 5.0I.1):
 * "¿qué necesita mi atención hoy?" respondida en una línea, antes de que el
 * usuario tenga que leer ninguna cola. `null` (colas parcialmente no
 * disponibles) no renderiza nada — las colas de abajo ya explican ese caso. */
export function OperationalStatusLine({ statusLine }: { statusLine: string | null }) {
  if (!statusLine) return null;
  return <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{statusLine}</p>;
}
