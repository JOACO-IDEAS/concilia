import type { ReactNode } from "react";

/** Primitiva compartida de estado vacío/no-disponible — reemplaza el patrón
 * repetido a mano en cada sección de Inicio. Nunca decorativa: siempre exige
 * un ícono y un mensaje específico del llamador (sin defaults genéricos tipo
 * "no hay datos"). */
export function OperationalEmptyState({ icon, message, action }: { icon: ReactNode; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-5 text-sm text-slate-600 dark:text-slate-300">
      {icon}
      <span className="flex-1">{message}</span>
      {action}
    </div>
  );
}
