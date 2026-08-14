"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useMobileNav } from "@/lib/mobile-nav";
import { Logo } from "./Logo";

interface NavItem {
  href: string;
  label: string;
  emoji: string;
}

// UX-2 — navegación canónica del piloto (decisión de Product Owner,
// ADMIN_PANEL_INFORMATION_ARCHITECTURE_V1.md): exactamente estos 4 destinos.
// "Consorcios" apunta a /consorcios, el hub canónico — unidades y
// obligaciones viven dentro de la ficha de cada consorcio, no como ítems
// propios acá. Ningún módulo experimental o huérfano se agrega al sidebar.
const navItems: NavItem[] = [
  { href: "/", label: "Inicio", emoji: "🏠" },
  { href: "/conciliacion", label: "Conciliación", emoji: "📥" },
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

export function Sidebar() {
  const pathname = usePathname();
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
          </div>
        </div>
      ) : null}
    </>
  );
}
