"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useMobileNav } from "@/lib/mobile-nav";
import { planParaUso } from "@/lib/plans";
import { formatARS } from "@/lib/format";
import { Logo } from "./Logo";

// Menú del empleado de IA — 7 categorías planas, sin jerarquías ni
// destacados (ver PRODUCT_BLUEPRINT.md, "Arquitectura de navegación"). Cada
// una es lo que le pedirías a una asistente administrativa, no un nombre de
// feature. Las rutas que no entran acá (Dashboard mock, Analítica,
// Unidades, Importar, Morosidad detallada) siguen vivas y enlazadas desde
// adentro de la pantalla que corresponde — no se perdió ninguna capacidad.
interface NavItem {
  href: string;
  label: string;
  emoji: string;
}

const navItems: NavItem[] = [
  { href: "/bandeja-de-trabajo", label: "Bandeja de Trabajo", emoji: "🏠" },
  { href: "/ia", label: "IA", emoji: "🤖" },
  { href: "/conciliacion", label: "Pagos", emoji: "📥" },
  { href: "/conversaciones", label: "Conversaciones", emoji: "💬" },
  { href: "/reportes", label: "Documentos", emoji: "📄" },
  { href: "/consorcios", label: "Consorcios", emoji: "🏢" },
  { href: "/configuracion", label: "Configuración", emoji: "⚙️" },
];

function BrandHeader() {
  return (
    <div className="px-5 py-5">
      <Logo />
      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        Administradores de Consorcios
      </p>
    </div>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-0.5 px-3 py-2">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            }`}
          >
            <span className="text-base leading-none" aria-hidden="true">
              {item.emoji}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BarraUso({
  label,
  usado,
  limite,
  colorClassName,
}: {
  label: string;
  usado: number;
  limite: number;
  colorClassName: string;
}) {
  const esIlimitado = !Number.isFinite(limite);
  const pct = esIlimitado ? 8 : Math.min(100, Math.round((usado / limite) * 100));
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span>
          {usado}/{esIlimitado ? "∞" : limite}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={`h-full rounded-full ${colorClassName}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FooterSummary({ consorcios, unidades }: { consorcios: number; unidades: number }) {
  const plan = planParaUso(consorcios, unidades);

  return (
    <div className="mx-3 mb-4 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
        <Building2 size={14} />
        Estudio Fernández Admin.
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
          Plan {plan.nombre}
        </span>
        <span className="text-[10px] text-slate-400">
          {plan.precioMensual ? `${formatARS(plan.precioMensual)}/mes` : "A medida"}
        </span>
      </div>

      <div className="space-y-1.5">
        <BarraUso
          label="Edificios"
          usado={consorcios}
          limite={plan.maxEdificios}
          colorClassName="bg-blue-500"
        />
        <BarraUso
          label="Unidades Funcionales"
          usado={unidades}
          limite={plan.maxUF}
          colorClassName="bg-emerald-500"
        />
      </div>

      <p className="text-[10px] leading-snug text-slate-400">
        Tu plan se calcula por edificios y UF administradas — no por comprobantes procesados.
      </p>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { state } = useAppStore();
  const { isOpen, close } = useMobileNav();

  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [isOpen, close]);

  return (
    <>
      {/* Desktop */}
      <aside className="no-print hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 md:flex">
        <BrandHeader />
        <NavLinks pathname={pathname} />
        <FooterSummary consorcios={state.consorcios.length} unidades={state.unidades.length} />
      </aside>

      {/* Mobile drawer */}
      {isOpen ? (
        <div className="no-print fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={close}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-fade-in-up flex-col overflow-y-auto bg-white shadow-xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <BrandHeader />
              <button
                onClick={close}
                aria-label="Cerrar menú"
                className="mr-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={close} />
            <FooterSummary consorcios={state.consorcios.length} unidades={state.unidades.length} />
          </div>
        </div>
      ) : null}
    </>
  );
}
