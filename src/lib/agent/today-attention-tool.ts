import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { buildStatusLine, type SummaryMetric } from "@/components/inbox/operational-inbox-view-model";

const DECISION_CAP = 500;
const INFORMATION_CAP = 8;

export type TodayAttentionResult = {
  message: string;
  needsDecision: SummaryMetric;
  needsInformation: SummaryMetric;
};

/** Bounded, tenant-authorized tool. It cannot mutate operational entities. */
export async function loadTodayAttention(
  tx: Prisma.TransactionClient,
  administratorId: string,
  organizationId: string,
): Promise<TodayAttentionResult> {
  const membership = await tx.organizationAdministrator.findUnique({
    where: { administratorId_organizationId: { administratorId, organizationId } },
    select: { administrator: { select: { deletedAt: true } }, organization: { select: { status: true, deletedAt: true } } },
  });
  if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") {
    throw new Error("AGENT_ACCESS_DENIED");
  }

  let needsDecision: SummaryMetric;
  try {
    const count = await tx.paymentEvidenceAssessmentLog.count({
      where: {
        state: "NEEDS_DECISION",
        paymentTransaction: {
          organizationId,
          reconciliationMatches: { none: { decision: { in: ["APPROVED", "REJECTED"] } } },
        },
      },
      take: DECISION_CAP,
    });
    needsDecision = { status: "available", value: count, capped: count >= DECISION_CAP };
  } catch {
    needsDecision = { status: "unavailable", reason: "La cola de decisiones no está disponible." };
  }

  let needsInformation: SummaryMetric;
  try {
    const rows = await tx.paymentTransaction.findMany({
      where: { organizationId, status: "UNMATCHED" },
      select: { id: true },
      take: INFORMATION_CAP,
    });
    needsInformation = { status: "available", value: rows.length, capped: rows.length >= INFORMATION_CAP };
  } catch {
    needsInformation = { status: "unavailable", reason: "La cola de información no está disponible." };
  }

  const statusLine = buildStatusLine(needsDecision, needsInformation);
  if (!statusLine) return { message: "No puedo calcular un total confiable porque una parte de la información operativa no está disponible.", needsDecision, needsInformation };
  const decisionLabel = needsDecision.status === "available" ? `${needsDecision.value}${needsDecision.capped ? "+" : ""} ${needsDecision.value === 1 ? "necesita" : "necesitan"} una decisión` : "";
  const informationLabel = needsInformation.status === "available" ? `${needsInformation.value}${needsInformation.capped ? "+" : ""} ${needsInformation.value === 1 ? "necesita" : "necesitan"} información` : "";
  return { message: `${statusLine} ${decisionLabel}; ${informationLabel}.`, needsDecision, needsInformation };
}
