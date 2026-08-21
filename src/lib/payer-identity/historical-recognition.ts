export type MemoryStatus = "OBSERVED" | "DISPUTED" | "REVOKED";

export interface HistoricalEvidence {
  provenanceKey: string;
  effect: "SUPPORT" | "CONTRADICT";
}

export interface HistoricalUnitMemory {
  organizationId: string;
  unitId: string;
  payerId: string | null;
  signalId: string | null;
  status: MemoryStatus;
  supportCount: number;
  contradictionCount: number;
  evidence?: readonly HistoricalEvidence[];
}

export interface HistoricalContribution {
  supportCount: number;
  contradictionCount: number;
  state: "NONE" | MemoryStatus;
  sources: ("SIGNAL" | "PAYER")[];
  contribution: number;
  disputed: boolean;
  revokedIgnored: boolean;
  deduplicatedByProvenance: boolean;
}

// Explicit, offline historical policy inherited from 5.0E. It does not alter
// financial calibration and its contribution remains capped and inspectable.
const SUPPORT_POINTS = 4;
const CONTRADICTION_POINTS = 6;
const CONTRIBUTION_CAP = 20;

export function historicalContribution(
  items: readonly HistoricalUnitMemory[],
  identity: { organizationId: string; signalId: string | null; payerId: string | null },
): HistoricalContribution {
  const matching = items.filter((item) => item.organizationId === identity.organizationId && (
    (identity.signalId !== null && item.signalId === identity.signalId) ||
    (identity.payerId !== null && item.payerId === identity.payerId)));
  const revokedIgnored = matching.some((item) => item.status === "REVOKED");
  const active = matching.filter((item) => item.status !== "REVOKED");
  const signalItems = active.filter((item) => identity.signalId !== null && item.signalId === identity.signalId);
  const payerItems = active.filter((item) => identity.payerId !== null && item.payerId === identity.payerId);
  const sources: ("SIGNAL" | "PAYER")[] = [];
  if (signalItems.length) sources.push("SIGNAL");
  if (payerItems.length) sources.push("PAYER");

  let supportCount = 0;
  let contradictionCount = 0;
  let deduplicatedByProvenance = false;
  if (identity.signalId !== null && identity.payerId !== null) {
    // Signal is primary. Payer evidence contributes only when event-level
    // provenance proves it is independent; otherwise it is counted once.
    for (const item of signalItems) {
      supportCount += Math.max(0, item.supportCount);
      contradictionCount += Math.max(0, item.contradictionCount);
    }
    const signalKeys = new Set(signalItems.flatMap((item) => item.evidence?.map((event) => event.provenanceKey) ?? []));
    for (const item of payerItems) {
      if (!item.evidence) {
        deduplicatedByProvenance = true;
        continue;
      }
      for (const event of item.evidence) {
        if (signalKeys.has(event.provenanceKey)) {
          deduplicatedByProvenance = true;
        } else if (event.effect === "SUPPORT") {
          supportCount++;
        } else {
          contradictionCount++;
        }
      }
    }
  } else {
    for (const item of active) {
      supportCount += Math.max(0, item.supportCount);
      contradictionCount += Math.max(0, item.contradictionCount);
    }
  }

  const disputed = active.some((item) => item.status === "DISPUTED");
  const raw = Math.max(-CONTRIBUTION_CAP, Math.min(CONTRIBUTION_CAP, supportCount * SUPPORT_POINTS - contradictionCount * CONTRADICTION_POINTS));
  return {
    supportCount,
    contradictionCount,
    state: active.length === 0 ? "NONE" : disputed ? "DISPUTED" : "OBSERVED",
    sources,
    contribution: disputed ? Math.trunc(raw / 4) : raw,
    disputed,
    revokedIgnored,
    deduplicatedByProvenance,
  };
}
