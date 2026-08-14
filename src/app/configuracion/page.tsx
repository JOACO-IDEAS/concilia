import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { Settings2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ConfiguracionPage() {
  return (
    <>
      <Topbar title="Configuración" subtitle="Preferencias y estado de tu cuenta" />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6">
        <Card className="animate-fade-in-up">
          <CardHeader title="Configuración de la cuenta" subtitle="Las opciones disponibles para tu organización aparecerán aquí." />
          <div className="flex flex-col items-start gap-4 px-5 py-7 sm:px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Settings2 size={20} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No hay preferencias para configurar todavía
              </p>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                La configuración técnica de ConcilIA se administra de forma segura y no se muestra
                dentro de la operación diaria.
              </p>
            </div>
          </div>
        </Card>
      </main>
    </>
  );
}
