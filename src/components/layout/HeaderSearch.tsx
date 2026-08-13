"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Search } from "lucide-react";
import { buscarOrganizaciones, type OrganizacionBusquedaDTO } from "@/app/search-actions";

/**
 * Buscador global del header — input real anclado en la esquina superior
 * derecha del Topbar, con resultados en un dropdown que cuelga justo debajo
 * (`absolute top-full`). Deliberadamente NO es un modal/overlay centrado: el
 * CPO lo rechazó dos veces por taparle la pantalla. Busca en paralelo los
 * organizaciones reales autorizadas para el administrador actual.
 */
export function HeaderSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [organizaciones, setOrganizaciones] = useState<OrganizacionBusquedaDTO[]>([]);
  const [buscandoOrgs, setBuscandoOrgs] = useState(false);

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    const texto = query.trim();
    if (texto.length < 2) return;

    let cancelado = false;
    const id = window.setTimeout(async () => {
      setBuscandoOrgs(true);
      try {
        const resultado = await buscarOrganizaciones(texto);
        if (!cancelado) setOrganizaciones(resultado);
      } finally {
        if (!cancelado) setBuscandoOrgs(false);
      }
    }, 200);
    return () => {
      cancelado = true;
      window.clearTimeout(id);
    };
  }, [query]);

  // Se ocultan acá en vez de limpiarlas con un setState extra dentro del
  // efecto de arriba (evita "setState síncrono en el cuerpo del efecto").
  const organizacionesVisibles = query.trim().length >= 2 ? organizaciones : [];

  function ir(ruta: string) {
    setQuery("");
    setOrganizaciones([]);
    setFocused(false);
    inputRef.current?.blur();
    router.push(ruta);
  }

  function onKeyDownInput(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setQuery("");
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  const totalResultados = organizacionesVisibles.length;
  const mostrarDropdown = focused && totalResultados > 0;

  return (
    <div ref={containerRef} className="relative hidden lg:block">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDownInput}
          placeholder="Buscar unidad, consorcio…"
          className="w-48 bg-transparent text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
        />
        {buscandoOrgs ? <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" /> : null}
        <kbd className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 dark:border-slate-700">
          ⌘K
        </kbd>
      </div>

      {mostrarDropdown ? (
        <div className="absolute top-full right-0 z-[9999] mt-2 max-h-[70vh] w-96 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {organizacionesVisibles.length > 0 ? (
            <div>
              <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                Consorcios
              </p>
              {organizacionesVisibles.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => ir("/unidades-config")}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Building2 size={15} className="shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.name}</p>
                    <p className="truncate text-xs text-slate-400">{o.address}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
