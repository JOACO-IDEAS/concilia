"use client";

import { useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { ArrowUp, ExternalLink, MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AgentConversationDTO } from "@/lib/agent/conversations";
import { AGENT_MESSAGE_MAX_LENGTH } from "@/lib/agent/contracts";
import type { AgentPresentation } from "@/lib/agent/executor";
import { createAgentConversationAction, sendAgentMessageAction } from "./actions";

const SUGGESTIONS = [
  "¿Qué requiere mi atención hoy?",
  "¿Qué pagos necesitan revisión?",
  "¿Dónde tengo mayor mora?",
  "¿Qué pasó con el pago de $210.000?",
] as const;

export function AgentWorkspace({
  organizations,
  initialConversations,
  initialActive,
}: {
  organizations: Array<{ id: string; name: string }>;
  initialConversations: AgentConversationDTO[];
  initialActive: AgentConversationDTO | null;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const [active, setActive] = useState(initialActive);
  const [organizationId, setOrganizationId] = useState(initialActive?.organizationId ?? organizations[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<AgentPresentation | null>(null);
  const [pending, startTransition] = useTransition();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeId = active?.id ?? "";
  const remaining = AGENT_MESSAGE_MAX_LENGTH - content.length;
  const sorted = useMemo(() => [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [conversations]);

  function replaceConversation(conversation: AgentConversationDTO) {
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    setActive(conversation);
  }

  function newConversation() {
    if (!organizationId || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createAgentConversationAction(organizationId);
      if (!result.ok) { setError(result.error); return; }
      replaceConversation(result.conversation);
      router.replace(`/agente?conversation=${result.conversation.id}`);
      composerRef.current?.focus();
    });
  }

  function submit(value = content) {
    const message = value.trim();
    if (!message || message.length > AGENT_MESSAGE_MAX_LENGTH || pending) return;
    setError(null);
    startTransition(async () => {
      let conversation = active;
      if (!conversation) {
        if (!organizationId) { setError("Necesitás una organización activa para iniciar una conversación."); return; }
        const created = await createAgentConversationAction(organizationId);
        if (!created.ok) { setError(created.error); return; }
        conversation = created.conversation;
      }
      const result = await sendAgentMessageAction(conversation.id, message);
      if (!result.ok) { setError(result.error); return; }
      setContent("");
      setPresentation(result.response.presentation ?? null);
      replaceConversation(result.conversation);
      router.replace(`/agente?conversation=${result.conversation.id}`);
    });
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-73px)] min-w-0 flex-1 overflow-hidden bg-white dark:bg-slate-950">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950 lg:flex lg:flex-col" aria-label="Historial de conversaciones">
        <Button type="button" variant="outline" className="min-h-11 w-full justify-start" onClick={newConversation} disabled={!organizationId || pending}>
          <MessageSquarePlus aria-hidden="true" /> Nueva conversación
        </Button>
        {organizations.length > 1 ? (
          <label className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-300">Consorcio
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
        ) : null}
        <div className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {sorted.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => router.push(`/agente?conversation=${conversation.id}`)} className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeId === conversation.id ? "bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"}`}>
              <span className="block truncate">{conversation.title ?? "Nueva conversación"}</span>
              <span className="block truncate text-xs font-normal text-slate-400">{conversation.organizationName}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col" aria-label="Conversación con ConcilIA Agent">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 lg:hidden dark:border-slate-800">
          <label className="sr-only" htmlFor="agent-conversation">Conversación</label>
          <select id="agent-conversation" value={activeId} onChange={(event) => router.push(event.target.value ? `/agente?conversation=${event.target.value}` : "/agente")} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="">Nueva conversación</option>
            {sorted.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title ?? "Nueva conversación"} · {conversation.organizationName}</option>)}
          </select>
          <Button type="button" size="icon" className="h-11 w-11 shrink-0" aria-label="Nueva conversación" onClick={newConversation} disabled={!organizationId || pending}><MessageSquarePlus /></Button>
        </div>
        {organizations.length > 1 ? (
          <label className="border-b border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 lg:hidden dark:border-slate-800 dark:text-slate-300">Consorcio para una conversación nueva
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite" aria-busy={pending}>
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            {!active || active.messages.length === 0 ? (
              <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">ConcilIA Agent</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">¿Qué necesitás resolver?</h2>
                <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => submit(suggestion)} disabled={pending || !organizationId} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">{suggestion}</button>)}
                </div>
              </div>
            ) : active.messages.map((message) => (
              <article key={message.id} className={message.role === "USER" ? "ml-auto max-w-[85%] rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800" : "max-w-2xl"}>
                {message.role === "ASSISTANT" ? <p className="mb-1 text-xs font-semibold text-blue-600 dark:text-blue-400">ConcilIA</p> : <span className="sr-only">Vos</span>}
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800 dark:text-slate-100">{message.content}</p>
              </article>
            ))}
            {pending ? <p className="text-sm text-slate-500" role="status">Consultando ConcilIA...</p> : null}
            {presentation ? <AgentStructuredResult presentation={presentation} /> : null}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4">
          <div className="mx-auto w-full max-w-3xl">
            {error ? <p className="mb-2 text-sm text-rose-600" role="alert">{error}</p> : null}
            <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:ring-blue-950">
              <textarea ref={composerRef} value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={onComposerKeyDown} maxLength={AGENT_MESSAGE_MAX_LENGTH} rows={1} placeholder="Preguntale a ConcilIA..." aria-label="Mensaje para ConcilIA" className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400" />
              <Button type="button" size="icon" className="h-11 w-11 shrink-0 rounded-xl" aria-label="Enviar mensaje" onClick={() => submit()} disabled={pending || !content.trim() || remaining < 0}><ArrowUp /></Button>
            </div>
            <p className="mt-1 text-right text-xs text-slate-400">{content.length}/{AGENT_MESSAGE_MAX_LENGTH}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ResultLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:bg-slate-800">{children}<ExternalLink size={14} aria-hidden="true" /></Link>;
}

function AgentStructuredResult({ presentation }: { presentation: AgentPresentation }) {
  if (presentation.kind === "ATTENTION_SUMMARY") return null;
  if (presentation.kind === "RECONCILIATION_REVIEW") return <div className="grid gap-3 sm:grid-cols-2">{presentation.cases.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><p className="font-semibold text-slate-900 dark:text-white">{item.title}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.organizationName} · {item.amountLabel}</p><p className="mt-2 line-clamp-3 text-sm text-slate-500">{item.reason}</p><ResultLink href={item.href}>Revisar caso</ResultLink></article>)}</div>;
  if (presentation.kind === "DEBT_OVERVIEW") return <ol className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">{presentation.results.map((item, index) => <li key={item.organizationId} className="flex min-w-0 flex-wrap items-center gap-3 border-b border-slate-100 p-4 last:border-0 dark:border-slate-800"><span className="text-sm font-semibold text-slate-400">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.organizationName}</p><p className="text-sm text-slate-500">{item.outstandingLabel} · {item.overdueUnits} unidades con saldo</p></div><ResultLink href={item.href}>Ver consorcio</ResultLink></li>)}</ol>;
  if (presentation.kind === "RECONCILIATION_LOOKUP") return <div className="grid gap-3 sm:grid-cols-2">{presentation.matches.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><p className="font-semibold">{item.amountLabel}</p><p className="truncate text-sm text-slate-600 dark:text-slate-300">{item.organizationName}</p><p className="mt-1 text-xs text-slate-500">{item.dateLabel} · {item.referenceLabel} · {item.status}</p><ResultLink href={item.href}>Ver movimiento</ResultLink></article>)}</div>;
  return <div className="grid gap-3 sm:grid-cols-2">{presentation.organizations.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><p className="truncate font-semibold">{item.name}</p><p className="truncate text-sm text-slate-500">{item.address}</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.unitCount} unidades · {item.paymentCount} movimientos</p><ResultLink href={item.href}>Ver consorcio</ResultLink></article>)}</div>;
}
