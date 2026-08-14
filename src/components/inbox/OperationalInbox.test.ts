import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inboxSourceFiles = [
  "./OperationalInbox.tsx",
  "./operational-inbox-view-model.ts",
  "./AttentionQueue.tsx",
  "./InformationQueue.tsx",
  "./RecentActivity.tsx",
  "./RecommendedNextStep.tsx",
  "./OperationalQuickActions.tsx",
  "./DelinquencyCallout.tsx",
  "./OperationalHeader.tsx",
  "./OperationalSummary.tsx",
  "./SetupJourney.tsx",
  "./CaseMetadata.tsx",
].map((relative) => readFileSync(new URL(relative, import.meta.url), "utf8"));

describe("OperationalInbox — enlaces de Human Review y arquitectura del módulo", () => {
  it("ningún archivo del módulo de Inicio enlaza a la ruta histórica rota", () => {
    for (const source of inboxSourceFiles) expect(source).not.toContain("/conciliacion/revision-humana");
  });

  it("el destino canónico funcional (/conciliacion) sigue alcanzable desde el módulo", () => {
    expect(inboxSourceFiles.some((source) => source.includes('"/conciliacion"'))).toBe(true);
  });

  it("OperationalInbox mantiene exactamente la misma firma de props que antes de UX.3 — cero cambios requeridos en page.tsx", () => {
    const source = readFileSync(new URL("./OperationalInbox.tsx", import.meta.url), "utf8");
    expect(source).toContain("data: OperationalInboxData");
    expect(source).toContain("reviewItems: OperationalReviewItem[]");
    expect(source).toContain("reviewQueueAvailable: boolean");
    expect(source).toContain("firstReviewableStatus: FirstReviewableCaseStatus");
  });

  it("no importa tipos de Prisma directamente — solo tipos ya presentacionales de operational-inbox-data / el view model", () => {
    for (const source of inboxSourceFiles) {
      // El comment del contrato menciona "@/generated/prisma" como
      // documentación de la regla — se excluye antes de verificar imports reales.
      const withoutComments = source.replace(/\/\*\*[\s\S]*?\*\//g, "");
      expect(withoutComments).not.toMatch(/@\/generated\/prisma/);
      expect(withoutComments).not.toMatch(/from ["']@\/lib\/prisma["']/);
    }
  });

  it("no hay ningún control de AUTO en el módulo de Inicio", () => {
    for (const source of inboxSourceFiles) expect(source).not.toMatch(/\bAUTO\b/);
  });

  it("cada componente de fila con texto variable usa min-w-0 — regresión del overflow horizontal móvil (UX.3.1 sección 4)", () => {
    const filesWithVariableText = ["./AttentionQueue.tsx", "./InformationQueue.tsx", "./RecentActivity.tsx", "./RecommendedNextStep.tsx", "./OperationalSummary.tsx", "./DelinquencyCallout.tsx", "./SetupJourney.tsx"];
    for (const relative of filesWithVariableText) {
      const source = readFileSync(new URL(relative, import.meta.url), "utf8");
      expect(source, `${relative} debería contener min-w-0`).toContain("min-w-0");
    }
  });
});
