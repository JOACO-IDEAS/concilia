import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CircleCheck, CircleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

interface EstadoIntegracion {
  nombre: string;
  descripcion: string;
  configurado: boolean;
}

/**
 * "Configuración" — estado de las integraciones (solo lectura, solo
 * booleano: nunca se expone el valor de una env var al cliente). Sin
 * formularios para editar todavía — eso es la próxima habilidad, no la de
 * este sprint (ver PRODUCT_BLUEPRINT.md).
 */
export default function ConfiguracionPage() {
  const integraciones: EstadoIntegracion[] = [
    {
      nombre: "Base de datos (Neon Postgres)",
      descripcion: "Pagos, organizaciones, morosidad",
      configurado: Boolean(process.env.DATABASE_URL),
    },
    {
      nombre: "Webhooks de pagos",
      descripcion: "Firma HMAC de proveedores de Open Banking",
      configurado: Boolean(process.env.PAYMENTS_WEBHOOK_SECRET),
    },
    {
      nombre: "Parser de extractos con IA",
      descripcion: "OpenAI — PDF, imagen o CSV de cualquier banco",
      configurado: Boolean(process.env.OPENAI_API_KEY),
    },
    {
      nombre: "Email (Resend)",
      descripcion: "Recibos y alertas de pago",
      configurado: Boolean(process.env.RESEND_API_KEY),
    },
    {
      nombre: "WhatsApp (Meta Cloud API)",
      descripcion: "Recibos, alertas y recordatorios de mora",
      configurado: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
    },
  ];

  return (
    <>
      <Topbar title="Configuración" subtitle="Estado de las integraciones" />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6">
        <Card className="animate-fade-in-up">
          <CardHeader title="Integraciones" subtitle="Sin alguna de estas, esa habilidad queda en modo simulación — no rompe nada" />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {integraciones.map((i) => (
              <div key={i.nombre} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{i.nombre}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{i.descripcion}</p>
                </div>
                {i.configurado ? (
                  <Badge tone="green" icon={<CircleCheck size={12} />}>
                    Configurado
                  </Badge>
                ) : (
                  <Badge tone="amber" icon={<CircleAlert size={12} />}>
                    Modo simulación
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
