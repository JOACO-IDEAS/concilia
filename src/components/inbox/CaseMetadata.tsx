export type MetadataItem = { text: string; atomic?: boolean };

/**
 * Metadatos de un caso (consorcio, importe, señal/motivo, antigüedad) —
 * cada dato pasa a su propia línea cuando no entra (`flex-wrap`), en vez de
 * formar un único párrafo largo difícil de escanear (UX.3.2 §3).
 *
 * `atomic: true` marca valores cortos de formato fijo (importes, "hace 6 d")
 * que nunca deben partirse a mitad de palabra — reciben `whitespace-nowrap`.
 * Los demás (nombre de consorcio, referencia libre, motivo) son texto
 * potencialmente largo y deben poder envolver normalmente: forzarlos
 * también a `nowrap` es la causa real de overflow que este componente
 * corrige (un consorcio con nombre largo o una referencia bancaria extensa
 * no debe salirse del ancho disponible).
 */
export function CaseMetadata({ items }: { items: (MetadataItem | string | null | undefined)[] }) {
  const visible = items
    .map((item) => (item == null ? null : typeof item === "string" ? { text: item } : item))
    .filter((item): item is MetadataItem => Boolean(item && item.text));
  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
      {visible.map((item, index) => (
        <span key={index} className="inline-flex min-w-0 items-baseline gap-1.5">
          {index > 0 ? <span aria-hidden="true" className="shrink-0 text-slate-300 dark:text-slate-600">·</span> : null}
          <span className={item.atomic ? "whitespace-nowrap" : ""}>{item.text}</span>
        </span>
      ))}
    </p>
  );
}
