import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { obtenerResumenBandejaTrabajo } from "@/app/bandeja-de-trabajo/actions";
import { Sparkles, MessageCircle, FileScan, Wallet, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * "IA" — no es un dashboard de modelos ni una pantalla de configuración de
 * IA: es el listado de habilidades que tu empleado ya sabe hacer, con
 * números reales (no inventados) y un link a dónde correrla. Placeholder
 * inteligente: mínimo hoy, pero con datos reales, pensado para crecer a
 * medida que se agreguen habilidades nuevas (ver PRODUCT_BLUEPRINT.md).
 */
export default async function IAPage() {
  const resumen = await obtenerResumenBandejaTrabajo();

  const habilidades = [
    {
      icon: Wallet,
      titulo: "Conciliar pagos automáticamente",
      detalle: resumen.ok
        ? `${resumen.autoConciliados} pagos conciliados automáticamente hasta ahora`
        : "Matchea CUIT/CBU/Alias contra tus organizaciones",
      href: "/conciliacion",
    },
    {
      icon: FileScan,
      titulo: "Leer extractos de cualquier banco o billetera",
      detalle: "PDF, imagen o CSV — Vision + Structured Output",
      href: "/conciliacion",
    },
    {
      icon: MessageCircle,
      titulo: "Enviar recibos y reclamos por WhatsApp",
      detalle: "Recibo al conciliar, alerta si falta un dato, recordatorio de mora",
      href: "/conversaciones",
    },
  ];

  return (
    <>
      <Topbar title="IA" subtitle="Las habilidades de tu empleado" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-4 sm:p-6">
        {habilidades.map((h) => (
          <Link
            key={h.titulo}
            href={h.href}
            className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <h.icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h.titulo}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{h.detalle}</p>
            </div>
            <ArrowRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />
          </Link>
        ))}

        <Card className="animate-fade-in-up">
          <CardHeader
            title="Próximas habilidades"
            subtitle="La conciliación es la primera — vienen más"
          />
          <div className="flex flex-wrap gap-2 p-4 pt-0">
            {["Gestión de mantenimiento", "Proveedores", "Expensas"].map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              >
                <Sparkles size={11} />
                {s}
              </span>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
