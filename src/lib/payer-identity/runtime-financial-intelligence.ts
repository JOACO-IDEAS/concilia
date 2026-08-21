import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Blocker, Signal, Tier, TopCandidateDiagnostico } from "@/lib/reconciliation/types";
import type { CandidateEntry } from "@/lib/reconciliation/deterministic-matcher";
import { resolveUnknownPayer } from "./unknown-payer-resolution";
import { toReconciliationIntelligenceViewModel, type ReconciliationIntelligenceViewModel } from "./reconciliation-intelligence-view-model";

export type RuntimeShadowRecord = {
  candidateUnitId: string | null;
  candidateUnitOwnerId: string | null;
  candidateObligationId: string | null;
  score: number;
  tier: number | null;
  topCandidates: unknown;
  signals: unknown;
  blockers: unknown;
};

export type RuntimeUnit = {
  id: string;
  code: string;
  organizationId: string;
  obligations: { id: string }[];
};

export type RuntimeIdentity = {
  id: string;
  organizationId: string;
  payerId: string | null;
  payer: { id: string; organizationId: string; status: string } | null;
} | null;

export type RuntimeMemory = {
  organizationId: string;
  unitId: string;
  payerId: string | null;
  signalId: string | null;
  status: "OBSERVED" | "DISPUTED" | "REVOKED";
  supportCount: number;
  contradictionCount: number;
  events: { evidenceKey: string; effect: string }[];
};

function arrayOf<T>(value: unknown, valid: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(valid) : [];
}

function isTopCandidate(value: unknown): value is TopCandidateDiagnostico {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TopCandidateDiagnostico>;
  return typeof item.unitCode === "string" && Number.isInteger(item.score) && item.score! >= 0 && item.score! <= 99
    && (item.tier === null || [1, 2, 3, 4].includes(item.tier as number)) && Array.isArray(item.matchedSignals);
}

function isSignal(value: unknown): value is Signal {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Signal>;
  return typeof item.signal === "string" && typeof item.evidence === "string" && typeof item.matched === "boolean";
}

function isBlocker(value: unknown): value is Blocker {
  return Boolean(value && typeof value === "object" && typeof (value as Partial<Blocker>).type === "string" && typeof (value as Partial<Blocker>).evidence === "string");
}

/** Pure adapter. It preserves persisted scores and delegates every decision to 5.0E/5.0G. */
export function adaptRuntimeFinancialIntelligence(input: {
  organizationId: string;
  shadow: RuntimeShadowRecord | null;
  units: readonly RuntimeUnit[];
  identity: RuntimeIdentity;
  hasDurableCorrelation: boolean;
  memory: readonly RuntimeMemory[];
}): ReconciliationIntelligenceViewModel | null {
  if (!input.shadow) return null;
  const units = new Map(input.units.filter((unit) => unit.organizationId === input.organizationId).map((unit) => [unit.code, unit]));
  const signals = arrayOf(input.shadow.signals, isSignal);
  const blockers = arrayOf(input.shadow.blockers, isBlocker);
  let diagnostics = arrayOf(input.shadow.topCandidates, isTopCandidate);
  if (diagnostics.length === 0 && input.shadow.candidateUnitId) {
    const unit = input.units.find((item) => item.id === input.shadow!.candidateUnitId && item.organizationId === input.organizationId);
    if (unit) diagnostics = [{ unitCode: unit.code, score: input.shadow.score, tier: input.shadow.tier as Tier | null, matchedSignals: signals.filter((item) => item.matched).map((item) => item.signal) }];
  }

  const candidates: CandidateEntry[] = diagnostics.flatMap((diagnostic) => {
    const unit = units.get(diagnostic.unitCode);
    if (!unit) return [];
    const isPersistedWinner = unit.id === input.shadow!.candidateUnitId;
    const obligationId = isPersistedWinner
      ? unit.obligations.some((item) => item.id === input.shadow!.candidateObligationId) ? input.shadow!.candidateObligationId : null
      : unit.obligations.length === 1 ? unit.obligations[0].id : null;
    return [{
      unitId: unit.id,
      unitCode: unit.code,
      unitOwnerId: isPersistedWinner ? input.shadow!.candidateUnitOwnerId : null,
      ownerFullName: null,
      obligationId,
      score: diagnostic.score,
      tier: diagnostic.tier,
      signals: isPersistedWinner ? signals : [],
      blockers: isPersistedWinner ? blockers : [],
      wouldQualifyForAuto: false,
    }];
  });

  const identity = input.identity?.organizationId === input.organizationId ? input.identity : null;
  const payer = identity?.payer?.organizationId === input.organizationId && identity.payer.status === "ACTIVE" ? identity.payer : null;
  const memory = input.memory
    .filter((item) => item.organizationId === input.organizationId)
    .filter((item) => (identity && item.signalId === identity.id) || (payer && item.payerId === payer.id))
    .map((item) => ({
      organizationId: item.organizationId,
      unitId: item.unitId,
      payerId: item.payerId,
      signalId: item.signalId,
      status: item.status,
      supportCount: item.supportCount,
      contradictionCount: item.contradictionCount,
      evidence: item.events.flatMap((event) => event.effect === "SUPPORT" || event.effect === "CONTRADICT"
        ? [{ provenanceKey: event.evidenceKey, effect: event.effect as "SUPPORT" | "CONTRADICT" }]
        : []),
    }));
  const resolution = resolveUnknownPayer({
    organizationId: input.organizationId,
    signalId: identity?.id ?? null,
    payerId: payer?.id ?? null,
    hasDurableCorrelation: input.hasDurableCorrelation,
    candidates,
    memory,
  });
  return toReconciliationIntelligenceViewModel(resolution);
}

function phoneFingerprint(type: "PHONE" | "WHATSAPP", phone: string) {
  const normalized = phone.normalize("NFKC").trim().replace(/\D/g, "");
  return normalized ? createHash("sha256").update(`${type}\0${normalized}`, "utf8").digest("hex") : null;
}

/** Same case-to-identity rule used by runtime reading and confirmation learning. */
export function identityFingerprintsForNoticePhones(phones: readonly string[]) {
  return [...new Set(phones.flatMap((phone) => [phoneFingerprint("PHONE", phone), phoneFingerprint("WHATSAPP", phone)]).filter((item): item is string => Boolean(item)))];
}

/** Tenant-scoped read model. Absence or ambiguity of identity degrades to financial-only. */
export async function loadRuntimeFinancialIntelligence(input: {
  organizationId: string;
  paymentTransactionId: string;
  shadow: RuntimeShadowRecord | null;
  confirmedNoticePhones: readonly string[];
}): Promise<ReconciliationIntelligenceViewModel | null> {
  if (!input.shadow) return null;
  const diagnostics = arrayOf(input.shadow.topCandidates, isTopCandidate);
  const unitCodes = [...new Set(diagnostics.map((item) => item.unitCode))];
  const candidateSelectors = [
    ...(unitCodes.length > 0 ? [{ code: { in: unitCodes } }] : []),
    ...(input.shadow.candidateUnitId ? [{ id: input.shadow.candidateUnitId }] : []),
  ];

  const fingerprints = identityFingerprintsForNoticePhones(input.confirmedNoticePhones);
  const [units, signals] = await Promise.all([
    prisma.unit.findMany({
      where: { organizationId: input.organizationId, deletedAt: null, OR: candidateSelectors },
      select: { id: true, code: true, organizationId: true, obligations: { where: { deletedAt: null, status: { in: ["PENDING", "PARTIALLY_PAID"] } }, select: { id: true } } },
    }),
    fingerprints.length === 0 ? Promise.resolve([]) : prisma.payerIdentitySignal.findMany({
      where: { organizationId: input.organizationId, type: { in: ["PHONE", "WHATSAPP"] }, normalizedFingerprint: { in: fingerprints } },
      select: { id: true, organizationId: true, payerId: true, payer: { select: { id: true, organizationId: true, status: true } } },
      take: 2,
    }),
  ]);
  const identity = signals.length === 1 ? signals[0] : null;
  const payerId = identity?.payer?.status === "ACTIVE" && identity.payer.organizationId === input.organizationId ? identity.payer.id : null;
  const memory = identity ? await prisma.payerUnitAssociation.findMany({
    where: { organizationId: input.organizationId, OR: [{ signalId: identity.id }, ...(payerId ? [{ payerId }] : [])] },
    select: { organizationId: true, unitId: true, payerId: true, signalId: true, status: true, supportCount: true, contradictionCount: true, events: { select: { evidenceKey: true, effect: true } } },
  }) : [];
  return adaptRuntimeFinancialIntelligence({ organizationId: input.organizationId, shadow: input.shadow, units, identity, hasDurableCorrelation: input.confirmedNoticePhones.length > 0, memory });
}
