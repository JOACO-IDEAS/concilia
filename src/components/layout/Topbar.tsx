"use client";

import { Bell, Menu } from "lucide-react";
import { useMobileNav } from "@/lib/mobile-nav";
import { LogoMark } from "./Logo";
import { HeaderSearch } from "./HeaderSearch";

export function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { open } = useMobileNav();

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
        <button
          type="button"
          className="relative rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
        >
          <Bell size={18} />
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2 rounded-full bg-rose-500" />
        </button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          EF
        </div>
      </div>
    </header>
  );
}
