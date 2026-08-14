"use client";

import { FormEvent, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";

const GENERIC_MESSAGE = "Si la dirección está habilitada, recibirás un enlace de acceso en los próximos minutos.";
const RATE_LIMIT_MESSAGE = "Se realizaron demasiados intentos. Esperá unos minutos antes de volver a probar.";
const UNAVAILABLE_MESSAGE = "El acceso no está disponible temporalmente. Intentá nuevamente más tarde.";

// UX-1 — genérico a propósito: nunca distingue token inexistente, vencido,
// usado o revocado (anti-enumeración, ver PILOT_AUTHENTICATED_ACCESS_STATIC_AUDIT_V1.md).
export const INVALID_LINK_MESSAGE = "Ese enlace ya no es válido. Pedí uno nuevo con el formulario de abajo.";

export function accessRequestMessage(status: number): string {
  if (status === 429) return RATE_LIMIT_MESSAGE;
  if (status === 503) return UNAVAILABLE_MESSAGE;
  return GENERIC_MESSAGE;
}

export function PilotAccessRequestForm({ invalidLink = false }: { invalidLink?: boolean }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/pilot-access/request", {
        method: "POST",
        body: new FormData(event.currentTarget),
        credentials: "same-origin",
      });
      const nextMessage = accessRequestMessage(response.status);
      setMessage(nextMessage);
      if (response.status !== 429 && response.status !== 503) setEmail("");
      if (response.status === 429 || response.status === 503) requestAnimationFrame(() => messageRef.current?.focus());
    } catch {
      setMessage(UNAVAILABLE_MESSAGE);
      requestAnimationFrame(() => messageRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-950" aria-busy={submitting}>
      <div>
        <h1 className="text-xl font-bold text-slate-950 dark:text-slate-50">Acceso a ConcilIA</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Ingresá tu email para recibir un enlace de acceso.</p>
      </div>
      {invalidLink ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{INVALID_LINK_MESSAGE}</span>
        </div>
      ) : null}
      <div>
        <label htmlFor="pilot-access-email" className="block text-sm font-medium text-slate-900 dark:text-slate-100">Email</label>
        <input
          id="pilot-access-email"
          required
          disabled={submitting}
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="pilot-access-email mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 placeholder:text-slate-500 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:border-slate-100 dark:focus:ring-slate-100/25"
          placeholder="nombre@ejemplo.com"
        />
      </div>
      <button className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white dark:focus:ring-slate-100" disabled={submitting} type="submit">
        {submitting ? "Enviando…" : "Solicitar acceso"}
      </button>
      <p ref={messageRef} tabIndex={-1} aria-live="polite" className={message ? "text-sm text-slate-700 outline-none dark:text-slate-200" : "sr-only"}>
        {message ?? ""}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        El enlace, si llega, vence a los 15 minutos — revisá también la carpeta de spam.
      </p>
    </form>
  );
}
