"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Building2, Home, Inbox as InboxIcon, Settings, X } from "lucide-react";
import { useMobileNav } from "@/lib/mobile-nav";
import { Logo } from "./Logo";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
}

// UX-2 — navegación canónica del piloto (decisión de Product Owner,
// ADMIN_PANEL_INFORMATION_ARCHITECTURE_V1.md), extendida por TASK 5.3A con
// la interfaz conversacional tenant-scoped.
// "Consorcios" apunta a /consorcios, el hub canónico — unidades y
// obligaciones viven dentro de la ficha de cada consorcio, no como ítems
// propios acá. Ningún módulo experimental o huérfano se agrega al sidebar.
// UX.3.1 — íconos vectoriales de lucide-react (ya instalada) en vez de
// emojis: consistentes con el resto del sistema visual, sin depender del
// renderizado de emoji del sistema operativo del usuario.
const navItems: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/agente", label: "Agente", icon: Bot },
  { href: "/conciliacion", label: "Conciliación", icon: InboxIcon },
  { href: "/consorcios", label: "Consorcios", icon: Building2 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
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
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            }`}
          >
            <Icon size={18} className={isActive ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Decisión pura de la trampa de foco — sin DOM, testeable directamente.
 * `Tab` en el último elemento vuelve al primero; `Shift+Tab` en el primero
 * vuelve al último; cualquier otro caso no interviene (deja que el
 * navegador mueva el foco normalmente dentro del drawer). */
export function focusTrapTarget(input: { key: string; shiftKey: boolean; isFirst: boolean; isLast: boolean; hasFocusable: boolean }): "first" | "last" | null {
  if (input.key !== "Tab" || !input.hasFocusable) return null;
  if (input.shiftKey && input.isFirst) return "last";
  if (!input.shiftKey && input.isLast) return "first";
  return null;
}

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useMobileNav();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Foco inicial dentro del drawer, trampa de Tab, Escape, backdrop-click,
  // scroll de fondo bloqueado, y retorno de foco al control que abrió el
  // drawer al cerrarse — matriz completa de accesibilidad del drawer móvil.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const target = focusTrapTarget({
        key: e.key,
        shiftKey: e.shiftKey,
        isFirst: document.activeElement === first,
        isLast: document.activeElement === last,
        hasFocusable: focusable.length > 0,
      });
      if (target === "last") {
        e.preventDefault();
        last.focus();
      } else if (target === "first") {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus();
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
        <div className="no-print fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navegación">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={close}
          />
          <div ref={drawerRef} className="absolute inset-y-0 left-0 flex w-[min(320px,86vw)] animate-fade-in-up flex-col overflow-y-auto bg-white shadow-xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <BrandHeader />
              <button
                ref={closeButtonRef}
                onClick={close}
                aria-label="Cerrar menú"
                className="mr-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
