import { describe, expect, it } from "vitest";
import { getFirstValueProgress } from "./progress";
import type { FirstReviewableCaseStatus, OperationalInboxData } from "@/app/operational-inbox-data";

const data = (overrides: Partial<OperationalInboxData["onboarding"]> & { organizationCount?: number } = {}): OperationalInboxData => ({
  organizationCount: overrides.organizationCount ?? 1,
  onboarding: {
    unitCount: overrides.unitCount ?? 1,
    obligationCount: overrides.obligationCount ?? 1,
    paymentCount: overrides.paymentCount ?? 1,
    reviewCount: overrides.reviewCount ?? 0,
    firstDecisionCount: overrides.firstDecisionCount ?? 0,
  },
  needsInformation: [],
  recentActivity: [],
  resolvedToday: 0,
});

const status = (kind: FirstReviewableCaseStatus["kind"]): FirstReviewableCaseStatus => {
  const message = "Estado persistido de prueba.";
  if (kind === "REVIEWABLE") return { kind, reviewableCount: 1, message };
  return { kind, reviewableCount: 0, message };
};

const milestone = (result: ReturnType<typeof getFirstValueProgress>, key: string) => result.milestones.find((item) => item.key === key);

describe("getFirstValueProgress", () => {
  it("prioriza crear un consorcio cuando no existe uno autorizado", () => {
    const result = getFirstValueProgress(data({ organizationCount: 0, unitCount: 0, obligationCount: 0, paymentCount: 0 }), status("NO_MOVEMENTS"));
    expect(milestone(result, "ORGANIZATION")).toMatchObject({ state: "CURRENT", href: "/importar" });
    expect(milestone(result, "UNITS")).toMatchObject({ state: "PENDING" });
  });

  it("prioriza unidades cuando existe un consorcio sin padrón", () => {
    const result = getFirstValueProgress(data({ unitCount: 0, obligationCount: 0, paymentCount: 0 }), status("NO_MOVEMENTS"));
    expect(milestone(result, "ORGANIZATION")).toMatchObject({ state: "COMPLETE" });
    expect(milestone(result, "UNITS")).toMatchObject({ state: "CURRENT", href: "/unidades-config" });
  });

  it("prioriza obligaciones cuando las unidades ya están disponibles", () => {
    const result = getFirstValueProgress(data({ obligationCount: 0, paymentCount: 0 }), status("NO_MOVEMENTS"));
    expect(milestone(result, "OBLIGATIONS")).toMatchObject({ state: "CURRENT", href: "/obligaciones" });
  });

  it("prioriza importar movimientos cuando ya existen obligaciones", () => {
    const result = getFirstValueProgress(data({ paymentCount: 0 }), status("NO_MOVEMENTS"));
    expect(milestone(result, "PAYMENTS")).toMatchObject({ state: "CURRENT", href: "/conciliacion" });
  });

  it("muestra espera honesta cuando hay movimientos sin evaluación persistida", () => {
    const result = getFirstValueProgress(data(), status("WAITING_PROCESSING"));
    expect(milestone(result, "ASSESSMENT")).toMatchObject({ state: "CURRENT", title: "Esperando evaluación" });
  });

  it("muestra que falta evidencia sin inventar una decisión", () => {
    const result = getFirstValueProgress(data(), status("WAITING_EVIDENCE"));
    expect(milestone(result, "ASSESSMENT")).toMatchObject({ state: "COMPLETE" });
    expect(milestone(result, "REVIEWABLE_CASE")).toMatchObject({ state: "CURRENT", title: "Esperando evidencia suficiente" });
  });

  it("ofrece un acceso directo cuando existe un caso revisable", () => {
    const result = getFirstValueProgress(data(), status("REVIEWABLE"), "/conciliacion/resolver/payment-a");
    expect(milestone(result, "REVIEWABLE_CASE")).toMatchObject({ state: "CURRENT", href: "/conciliacion/resolver/payment-a", action: "Revisar caso" });
  });

  it("deja de priorizar el journey después de una primera decisión humana", () => {
    const result = getFirstValueProgress(data({ firstDecisionCount: 1 }), status("REVIEWABLE"));
    expect(result).toEqual({ complete: true, milestones: [] });
  });

  it("expone la indisponibilidad de evaluaciones como bloqueo honesto", () => {
    const result = getFirstValueProgress(data(), status("ASSESSMENT_UNAVAILABLE"));
    expect(milestone(result, "ASSESSMENT")).toMatchObject({ state: "BLOCKED", title: "Evaluación no disponible" });
  });

  it("no recibe ni expone conteos globales: sólo deriva del snapshot ya tenant-scoped", () => {
    const result = getFirstValueProgress(data({ organizationCount: 1, unitCount: 0, obligationCount: 99, paymentCount: 99 }), status("NO_MOVEMENTS"));
    expect(milestone(result, "UNITS")).toMatchObject({ state: "CURRENT" });
    expect(milestone(result, "OBLIGATIONS")).toMatchObject({ state: "PENDING" });
  });
});
