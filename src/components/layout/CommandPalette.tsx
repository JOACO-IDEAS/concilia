"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Building2, DoorOpen, Landmark, Loader2, Search } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { buscarOrganizaciones, type OrganizacionBusquedaDTO } from "@/app/search-actions";

const LIMITE_RESULTADOS = 5;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Command Palette global (Cmd/Ctrl+K) — busca en los datos mock de
 * Consorcios/Unidades (`useAppStore`, instantáneo) y en Organizaciones reales
 * (Server Action debounceada, ya que vive en Postgres). No hay ficha de
 * detalle por Organización todavía, así que ese resultado navega a
 * `/conciliacion` en vez de a una página propia — es una limitación honesta,
 * no un bug.
 */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { state } = useAppStore();
  const [query, setQuery] = useState("");
  const [organizaciones, setOrganizaciones] = useState<OrganizacionBusquedaDTO[]>([]);
  const [buscandoOrgs, setBuscandoOrgs] = useState(false);

  function cerrar() {
    setQuery("");
    setOrganizaciones([]);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  // El estado `organizaciones` puede quedar con resultados obsoletos de una
  // búsqueda anterior una vez que el usuario borra el texto — se ocultan acá
  // en vez de limpiarlos con un setState extra dentro del efecto de arriba.
  const organizacionesVisibles = query.trim().length >= 2 ? organizaciones : [];

  const consorciosFiltrados = useMemo(() => {
    const texto = normalizar(query.trim());
    if (!texto) return [];
    return state.consorcios
      .filter(
        (c) =>
          normalizar(c.nombre).includes(texto) ||
          normalizar(c.direccion).includes(texto) ||
          normalizar(c.barrio).includes(texto)
      )
      .slice(0, LIMITE_RESULTADOS);
  }, [query, state.consorcios]);

  const unidadesFiltradas = useMemo(() => {
    const texto = normalizar(query.trim());
    if (!texto) return [];
    return state.unidades
      .filter((u) => normalizar(u.unidad).includes(texto) || normalizar(u.titular).includes(texto))
      .slice(0, LIMITE_RESULTADOS);
  }, [query, state.unidades]);

  function ir(ruta: string) {
    cerrar();
    router.push(ruta);
  }

  if (!open) return null;

  const sinResultados =
    query.trim().length > 0 &&
    consorciosFiltrados.length === 0 &&
    unidadesFiltradas.length === 0 &&
    organizacionesVisibles.length === 0 &&
    !buscandoOrgs;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={cerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg animate-toast-in overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <Command shouldFilter={false} label="Buscador global">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <Search size={16} className="shrink-0 text-slate-400" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar consorcio, unidad (ej. 4B) o pago…"
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
            />
            {buscandoOrgs ? (
              <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" />
            ) : null}
            <kbd className="hidden shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 dark:border-slate-700 sm:block">
              Esc
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            {query.trim().length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-400">
                Escribí para buscar consorcios, unidades funcionales o pagos.
              </div>
            ) : null}

            {sinResultados ? (
              <div className="px-3 py-8 text-center text-sm text-slate-400">
                Sin resultados para &quot;{query}&quot;.
              </div>
            ) : null}

            {consorciosFiltrados.length > 0 ? (
              <Command.Group
                heading="Consorcios"
                className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 [&_[cmdk-group-items]]:mt-1"
              >
                {consorciosFiltrados.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`consorcio-${c.id}`}
                    onSelect={() => ir(`/consorcios?consorcio=${c.id}`)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 data-[selected=true]:bg-slate-100 dark:text-slate-200 dark:data-[selected=true]:bg-slate-800"
                  >
                    <Building2 size={15} className="shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.nombre}</p>
                      <p className="truncate text-xs text-slate-400">{c.direccion}</p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {unidadesFiltradas.length > 0 ? (
              <Command.Group
                heading="Unidades funcionales"
                className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 [&_[cmdk-group-items]]:mt-1"
              >
                {unidadesFiltradas.map((u) => (
                  <Command.Item
                    key={u.id}
                    value={`unidad-${u.id}`}
                    onSelect={() => ir(`/unidades?unidad=${u.id}`)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 data-[selected=true]:bg-slate-100 dark:text-slate-200 dark:data-[selected=true]:bg-slate-800"
                  >
                    <DoorOpen size={15} className="shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">UF {u.unidad}</p>
                      <p className="truncate text-xs text-slate-400">{u.titular}</p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {organizacionesVisibles.length > 0 ? (
              <Command.Group
                heading="Pagos / deudores"
                className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 [&_[cmdk-group-items]]:mt-1"
              >
                {organizacionesVisibles.map((o) => (
                  <Command.Item
                    key={o.id}
                    value={`org-${o.id}`}
                    onSelect={() => ir("/conciliacion")}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 data-[selected=true]:bg-slate-100 dark:text-slate-200 dark:data-[selected=true]:bg-slate-800"
                  >
                    <Landmark size={15} className="shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{o.name}</p>
                      <p className="truncate text-xs text-slate-400">{o.address}</p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
