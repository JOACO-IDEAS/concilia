"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { listarUnidades, type OrganizacionOpcionDTO, type UnitDTO } from "@/app/unidades-config/actions";
import {
  listarObligaciones,
  eliminarObligacion,
  type ObligationDTO,
} from "@/app/unidades-config/obligaciones-actions";
import { ObligacionFormModal } from "./ObligacionFormModal";
import { Building2, Loader2, Plus, Pencil, Receipt, Trash2, UploadCloud } from "lucide-react";

function formatPeriodo(iso: string): string {
  const [anio, mes] = iso.slice(0, 7).split("-");
  const nombres = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ];
  return `${nombres[Number(mes) - 1]} ${anio}`;
}

function formatMonto(amount: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(amount);
}

function toneEstado(status: ObligationDTO["status"]): "green" | "amber" | "slate" | "red" {
  if (status === "PAID") return "green";
  if (status === "PARTIALLY_PAID") return "amber";
  if (status === "CANCELLED") return "red";
  return "slate";
}

function etiquetaEstado(status: ObligationDTO["status"]): string {
  return { PENDING: "Pendiente", PARTIALLY_PAID: "Pago parcial", PAID: "Pagada", CANCELLED: "Cancelada" }[status];
}

type ModalObligacion = { modo: "crear" } | { modo: "editar"; obligacion: ObligationDTO } | null;

export function ObligacionesPanel({
  organizacionesIniciales,
}: {
  organizacionesIniciales: OrganizacionOpcionDTO[];
}) {
  const { showToast } = useToast();
  const [organizationId, setOrganizationId] = useState(organizacionesIniciales[0]?.id ?? "");
  const [unidades, setUnidades] = useState<UnitDTO[]>([]);
  const [unitId, setUnitId] = useState("");
  const [obligaciones, setObligaciones] = useState<ObligationDTO[]>([]);
  const [cargandoUnidades, setCargandoUnidades] = useState(false);
  const [cargandoObligaciones, setCargandoObligaciones] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalObligacion>(null);

  const recargarObligaciones = useCallback(async (uid: string) => {
    if (!uid) {
      setObligaciones([]);
      return;
    }
    setCargandoObligaciones(true);
    const r = await listarObligaciones(uid);
    setCargandoObligaciones(false);
    if (r.ok) setObligaciones(r.obligaciones);
    else setError(r.error ?? "No se pudieron cargar las obligaciones.");
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setUnitId("");
      setObligaciones([]);
      if (!organizationId) return;
      setCargandoUnidades(true);
      const r = await listarUnidades(organizationId);
      if (cancelado) return;
      setCargandoUnidades(false);
      if (r.ok) {
        setUnidades(r.unidades);
        if (r.unidades[0]) setUnitId(r.unidades[0].id);
      } else {
        setError(r.error ?? "No se pudieron cargar las unidades.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [organizationId]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!unitId) {
        setObligaciones([]);
        return;
      }
      setCargandoObligaciones(true);
      const r = await listarObligaciones(unitId);
      if (cancelado) return;
      setCargandoObligaciones(false);
      if (r.ok) setObligaciones(r.obligaciones);
      else setError(r.error ?? "No se pudieron cargar las obligaciones.");
    })();
    return () => {
      cancelado = true;
    };
  }, [unitId]);

  async function borrarObligacion(obligacion: ObligationDTO) {
    if (!confirm(`¿Eliminar la obligación de ${formatPeriodo(obligacion.period)}?`)) return;
    const r = await eliminarObligacion(obligacion.id);
    if (r.ok) {
      showToast("Obligación eliminada", formatPeriodo(obligacion.period));
      recargarObligaciones(unitId);
    } else {
      showToast("No se pudo eliminar", r.error);
    }
  }

  if (organizacionesIniciales.length === 0) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Obligaciones" subtitle="Expensas por unidad y período" />
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
          title="Obligaciones"
          subtitle="Expensas por unidad y período — contexto para resolver pagos"
          action={
            obligaciones.length > 0 ? (
              <Link href="/conciliacion" className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                <Receipt size={13} /> Cargar movimientos
              </Link>
            ) : (
              <Link href="/obligaciones/importar" className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                <UploadCloud size={13} /> Importar desde Excel/CSV
              </Link>
            )
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

          {cargandoUnidades ? (
            <Loader2 size={16} className="animate-spin text-slate-400" />
          ) : unidades.length > 0 ? (
            <>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Unidad:</label>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 sm:flex-none"
              >
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    UF {u.code}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => setModal({ modo: "crear" })} disabled={!unitId}>
                <Plus size={14} /> Nueva obligación
              </Button>
            </>
          ) : (
            <p className="text-xs text-slate-400">Este consorcio todavía no tiene unidades cargadas.</p>
          )}
        </div>
      </Card>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      {unitId ? (
        cargandoObligaciones ? (
          <div className="flex justify-center py-10">
            <Loader2 size={22} className="animate-spin text-slate-400" />
          </div>
        ) : obligaciones.length === 0 ? (
          <Card className="animate-fade-in-up">
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Receipt size={26} className="text-slate-300 dark:text-slate-700" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Esta unidad todavía no tiene obligaciones cargadas.
              </p>
            </div>
          </Card>
        ) : (
          <Card className="animate-fade-in-up">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {obligaciones.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {formatPeriodo(o.period)}
                      </p>
                      <Badge tone={toneEstado(o.status)}>{etiquetaEstado(o.status)}</Badge>
                    </div>
                    <p className="truncate text-xs text-slate-400">
                      {formatMonto(o.amount)}
                      {o.paidAmount > 0 ? ` · ${formatMonto(o.paidAmount)} pagado` : ""}
                      {o.concept ? ` · ${o.concept}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setModal({ modo: "editar", obligacion: o })}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label="Editar obligación"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => borrarObligacion(o)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                      aria-label="Eliminar obligación"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      ) : null}

      {modal ? (
        <ObligacionFormModal
          unitId={unitId}
          obligacion={modal.modo === "editar" ? modal.obligacion : undefined}
          onClose={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            recargarObligaciones(unitId);
          }}
        />
      ) : null}
    </div>
  );
}
