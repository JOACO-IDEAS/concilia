import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { QuickAction } from "./operational-inbox-view-model";

/** Accesos rápidos — únicamente rutas reales y funcionales, nunca
 * placeholders. La lista viene fija desde el view model (ver
 * `buildOperationalInboxViewModel`), no se inventa acá. */
export function OperationalQuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <section aria-label="Accesos rápidos" className="flex flex-wrap gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
      {actions.map((action) => (
        <Link key={action.href} href={action.href} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
          {action.label}<ArrowRight size={13} />
        </Link>
      ))}
    </section>
  );
}
