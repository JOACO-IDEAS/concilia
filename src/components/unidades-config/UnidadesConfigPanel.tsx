"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import {
  listarUnidades,
  eliminarUnidad,
  eliminarTitular,
  type OrganizacionOpcionDTO,
  type UnitDTO,
  type UnitOwnerDTO,
} from "@/app/unidades-config/actions";
import { UnidadFormModal } from "./UnidadFormModal";
import { TitularFormModal } from "./TitularFormModal";
import {
  Building2,
  Loader2,
  Plus,
  Pencil,
  Receipt,
  Trash2,
  User,
  UploadCloud,
  DoorOpen,
} from "lucide-react";

type ModalUnidad = { modo: "crear" } | { modo: "editar"; unidad: UnitDTO } | null;
type ModalTitular =
  | { modo: "crear"; unitId: string }
  | { modo: "editar"; unitId: string; titular: UnitOwnerDTO }
  | null;

export function UnidadesConfigPanel({
  organizacionesIniciales,
}: {
  organizacionesIniciales: OrganizacionOpcionDTO[];
}) {
  const { showToast } = useToast();
  const [organizationId, setOrganizationId] = useState(organizacionesIniciales[0]?.id ?? "");
  const [unidades, setUnidades] = useState<UnitDTO[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalUnidad, setModalUnidad] = useState<ModalUnidad>(null);
  const [modalTitular, setModalTitular] = useState<ModalTitular>(null);

  const recargar = useCallback(async (orgId: string) => {
    if (!orgId) {
      setUnidades([]);
      return;
    }
    setCargando(true);
    const r = await listarUnidades(orgId);
    setCargando(false);
    if (r.ok) setUnidades(r.unidades);
    else setError(r.error ?? "No se pudieron cargar las unidades.");
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!organizationId) return;
      setCargando(true);
      const r = await listarUnidades(organizationId);
      if (cancelado) return;
      setCargando(false);
      if (r.ok) setUnidades(r.unidades);
      else setError(r.error ?? "No se pudieron cargar las unidades.");
    })();
    return () => {
      cancelado = true;
    };
  }, [organizationId]);

  async function borrarUnidad(unidad: UnitDTO) {
    if (!confirm(`¿Eliminar la unidad ${unidad.code}? Esto también oculta sus titulares.`)) return;
    const r = await eliminarUnidad(unidad.id);
    if (r.ok) {
      showToast("Unidad eliminada", unidad.code);
      recargar(organizationId);
    } else {
      showToast("No se pudo eliminar", r.error);
    }
  }

  async function borrarTitular(titular: UnitOwnerDTO) {
    if (!confirm(`¿Eliminar a ${titular.fullName} como titular?`)) return;
    const r = await eliminarTitular(titular.id);
    if (r.ok) {
      showToast("Titular eliminado", titular.fullName);
      recargar(organizationId);
    } else {
      showToast("No se pudo eliminar", r.error);
    }
  }

  if (organizacionesIniciales.length === 0) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Unidades y Titulares" subtitle="Padrón real de un consorcio" />
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Building2 size={26} className="text-slate-300 dark:text-slate-700" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Todavía no hay ninguna organización cargada — importala primero desde{" "}
            <Link href="/importar" className="text-blue-600 hover:underline dark:text-blue-400">
              /importar
            </Link>
            .
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Unidades y Titulares"
          subtitle="Padrón operativo del consorcio — necesario para revisar pagos con contexto"
          action={
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/obligaciones"
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <Receipt size={13} />
                Obligaciones
              </Link>
              <Link
                href="/unidades-config/importar"
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <UploadCloud size={13} />
                Importar desde Excel/CSV
              </Link>
            </div>
          }
        />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Consorcio:</label>
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 sm:flex-none"
          >
            {organizacionesIniciales.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => setModalUnidad({ modo: "crear" })} disabled={!organizationId}>
            <Plus size={14} /> Nueva unidad
          </Button>
        </div>
      </Card>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 size={22} className="animate-spin text-slate-400" />
        </div>
      ) : unidades.length === 0 ? (
        <Card className="animate-fade-in-up">
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <DoorOpen size={26} className="text-slate-300 dark:text-slate-700" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Este consorcio todavía no tiene unidades cargadas. Creá la primera para continuar.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {unidades.map((unidad) => (
            <Card key={unidad.id} className="animate-fade-in-up">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    UF {unidad.code}
                  </p>
                  {unidad.coefficient !== null ? (
                    <Badge tone="slate">{unidad.coefficient}%</Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setModalTitular({ modo: "crear", unitId: unidad.id })}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
                  >
                    <Plus size={12} /> Titular
                  </button>
                  <button
                    onClick={() => setModalUnidad({ modo: "editar", unidad })}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Editar unidad"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => borrarUnidad(unidad)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    aria-label="Eliminar unidad"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {unidad.owners.length === 0 ? (
                <p className="px-5 py-3 text-xs text-slate-400">Sin titulares cargados.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {unidad.owners.map((titular) => (
                    <div key={titular.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <User size={14} className="shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-700 dark:text-slate-200">
                            {titular.fullName}
                            {titular.isPrimary && unidad.owners.length > 1 ? (
                              <span className="ml-1.5 text-[10px] text-slate-400">(principal)</span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {titular.relationship === "OWNER" ? "Propietario" : "Inquilino"}
                            {titular.taxId ? ` · CUIT ${titular.taxId}` : " · sin CUIT"}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setModalTitular({ modo: "editar", unitId: unidad.id, titular })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          aria-label="Editar titular"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => borrarTitular(titular)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                          aria-label="Eliminar titular"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {modalUnidad ? (
        <UnidadFormModal
          organizationId={organizationId}
          unidad={modalUnidad.modo === "editar" ? modalUnidad.unidad : undefined}
          onClose={() => setModalUnidad(null)}
          onGuardado={() => {
            setModalUnidad(null);
            recargar(organizationId);
          }}
        />
      ) : null}

      {modalTitular ? (
        <TitularFormModal
          unitId={modalTitular.unitId}
          titular={modalTitular.modo === "editar" ? modalTitular.titular : undefined}
          onClose={() => setModalTitular(null)}
          onGuardado={() => {
            setModalTitular(null);
            recargar(organizationId);
          }}
        />
      ) : null}
    </div>
  );
}
