import type { AgentCapabilityName } from "./capability-registry";
import { getAgentCapability } from "./capability-registry";
import type { TodayAttentionResult } from "./today-attention-tool";
import type { ReconciliationReviewResult } from "./reconciliation-review-tool";
import type { DebtOverviewResult } from "./debt-overview-tool";
import type { ReconciliationLookupInput, ReconciliationLookupResult } from "./reconciliation-lookup-tool";
import type { OrganizationLookupResult } from "./organization-lookup-tool";
import type { DocumentLookupInput, DocumentLookupResult } from "./document-lookup-tool";

export type AgentToolContext = {
  todayAttention(): Promise<TodayAttentionResult>;
  reconciliationReview(): Promise<ReconciliationReviewResult>;
  debtOverview(): Promise<DebtOverviewResult>;
  reconciliationLookup(input: ReconciliationLookupInput): Promise<ReconciliationLookupResult>;
  organizationLookup(query: string): Promise<OrganizationLookupResult>;
  documentLookup?(input: DocumentLookupInput): Promise<DocumentLookupResult>;
};

export type AgentPresentation =
  | { kind: "ATTENTION_SUMMARY"; needsDecision: TodayAttentionResult["needsDecision"]; needsInformation: TodayAttentionResult["needsInformation"] }
  | { kind: "RECONCILIATION_REVIEW"; cases: ReconciliationReviewResult["cases"] }
  | { kind: "DEBT_OVERVIEW"; results: DebtOverviewResult["results"] }
  | { kind: "RECONCILIATION_LOOKUP"; matches: ReconciliationLookupResult["matches"] }
  | { kind: "ORGANIZATION_LOOKUP"; organizations: OrganizationLookupResult["organizations"] }
  | { kind: "DOCUMENT_LOOKUP"; outcome: DocumentLookupResult["outcome"]; documents: DocumentLookupResult["documents"] };
export type AgentResponse = {
  message: string;
  capability: AgentCapabilityName | null;
  presentation?: AgentPresentation;
};

/** Allowlisted dispatch only. User text and tool data never become executable instructions. */
export async function executeAgentCapability(capability: AgentCapabilityName, input: Record<string, string | number>, context: AgentToolContext): Promise<AgentResponse> {
  const definition = getAgentCapability(capability);
  if (!definition || definition.availability !== "AVAILABLE" || definition.nature !== "READ_ONLY") {
    return { message: "Esta consulta todavía no está disponible en ConcilIA Agent.", capability: null };
  }
  switch (capability) {
    case "TODAY_ATTENTION": {
      const result = await context.todayAttention();
      return { message: result.message, capability, presentation: { kind: "ATTENTION_SUMMARY", needsDecision: result.needsDecision, needsInformation: result.needsInformation } };
    }
    case "RECONCILIATION_REVIEW": { const result = await context.reconciliationReview(); return { message: result.message, capability, presentation: { kind: "RECONCILIATION_REVIEW", cases: result.cases } }; }
    case "DEBT_OVERVIEW": { const result = await context.debtOverview(); return { message: result.message, capability, presentation: { kind: "DEBT_OVERVIEW", results: result.results } }; }
    case "RECONCILIATION_LOOKUP": { const result = await context.reconciliationLookup({ amount: typeof input.amount === "number" ? input.amount : undefined, reference: typeof input.reference === "string" ? input.reference : undefined, date: typeof input.date === "string" ? input.date : undefined }); return { message: result.message, capability, presentation: { kind: "RECONCILIATION_LOOKUP", matches: result.matches } }; }
    case "ORGANIZATION_LOOKUP": { const result = await context.organizationLookup(typeof input.query === "string" ? input.query : ""); return { message: result.message, capability, presentation: { kind: "ORGANIZATION_LOOKUP", organizations: result.organizations } }; }
    case "DOCUMENT_LOOKUP": { if (!context.documentLookup) return { message: "Esta consulta todavía no está disponible en ConcilIA Agent.", capability: null }; const result = await context.documentLookup(input as DocumentLookupInput); return { message: result.message, capability, presentation: { kind: "DOCUMENT_LOOKUP", outcome: result.outcome, documents: result.documents } }; }
  }
}
