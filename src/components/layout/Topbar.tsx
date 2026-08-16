"use client";

import { LogOut, Menu, UserRound } from "lucide-react";
import { useMobileNav } from "@/lib/mobile-nav";
import { useCurrentAdministrator } from "@/lib/auth/current-administrator-context";
import { logoutAction } from "@/app/acceso/actions";
import { LogoMark } from "./Logo";
import { HeaderSearch } from "./HeaderSearch";

/** Nunca "EF" ni ningún valor fijo — deriva siempre de una identidad real ya
 * resuelta server-side (RootLayout → requireCurrentAdministrator()). */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function organizationLabel(organizations: { id: string; name: string }[]): string | null {
  if (organizations.length === 0) return null;
  if (organizations.length === 1) return organizations[0].name;
  return `${organizations.length} consorcios`;
}

export function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { open } = useMobileNav();
  const { administrator, organizations } = useCurrentAdministrator();
  const initials = administrator ? initialsFor(administrator.name || administrator.email) : null;
  const orgLabel = organizationLabel(organizations);

  return (
    <header className="no-print relative z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={open}
          aria-label="Abrir menú"
          className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
        >
          <Menu size={20} />
        </button>
        <LogoMark className="shrink-0 md:hidden" />
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-slate-900 dark:text-slate-100 sm:text-lg">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <HeaderSearch />
        {orgLabel ? (
          <span className="hidden max-w-[10rem] truncate text-xs font-medium text-slate-500 dark:text-slate-400 sm:inline">
            {orgLabel}
          </span>
        ) : null}
        {initials ? (
          <div
            title={administrator?.name}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {initials}
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            <UserRound size={18} />
          </div>
        )}
        {/* Separador visual + hover distintivo (TASK CLAUDE UX.4 §C.2): el
            control de logout quedaba visualmente igual a los demás íconos
            del Topbar — ahora se agrupa aparte de la identidad y, al pasar
            el mouse, se distingue como una acción de cierre de sesión, sin
            agregar texto que ensanche la barra. */}
        <div className="ml-1 border-l border-slate-200 pl-2 dark:border-slate-800">
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-800 dark:text-slate-400 dark:hover:border-rose-900 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
            >
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
