import { describe, expect, it } from "vitest";
import { buildOperationalInboxViewModel, hasContradictoryEmptyActivity } from "./operational-inbox-view-model";
import type { FirstReviewableCaseStatus, OperationalInboxData, OperationalReviewItem } from "@/app/operational-inbox-data";

const NO_MOVEMENTS: FirstReviewableCaseStatus = { kind: "NO_MOVEMENTS", reviewableCount: 0, message: "Todavía no hay movimientos importados para analizar." };
const ASSESSMENT_UNAVAILABLE: FirstReviewableCaseStatus = { kind: "ASSESSMENT_UNAVAILABLE", reviewableCount: 0, message: "Las evaluaciones todavía no están disponibles en este entorno." };

const baseData: OperationalInboxData = {
  organizationCount: 1,
  onboarding: { unitCount: 3, obligationCount: 3, paymentCount: 5, reviewCount: 0, firstDecisionCount: 2 },
  needsInformation: [],
  recentActivity: [],
  resolvedToday: 0,
};

const emptyOrgData: OperationalInboxData = {
  organizationCount: 0,
  onboarding: { unitCount: 0, obligationCount: 0, paymentCount: 0, reviewCount: 0, firstDecisionCount: 0 },
  needsInformation: [],
  recentActivity: [],
  resolvedToday: 0,
};

function reviewItem(overrides: Partial<OperationalReviewItem> = {}): OperationalReviewItem {
  return {
    id: "single:pt-1",
    paymentTransactionId: "pt-1",
    kind: "SINGLE",
    organizationName: "Consorcio Test",
    amount: 1000,
    currency: "ARS",
    createdAt: "2026-08-01T10:00:00.000Z",
    detail: "Coincidencia por monto y fecha.",
    ...overrides,
  };
}

function needsInfoPayment(overrides: Partial<OperationalInboxData["needsInformation"][number]> = {}) {
  return {
    id: "pt-info-1",
    amount: 500,
    currency: "ARS",
    concept: "Transferencia",
    createdAt: "2026-08-01T09:00:00.000Z",
    organizationName: "Consorcio Test",
    ...overrides,
  };
}

function buildVm(data: OperationalInboxData, reviewItems: OperationalReviewItem[] = [], reviewQueueAvailable = true, status: FirstReviewableCaseStatus = NO_MOVEMENTS) {
  return buildOperationalInboxViewModel(data, reviewItems, reviewQueueAvailable, status);
}

describe("buildOperationalInboxViewModel — organización nueva sin datos", () => {
  it("activa setupJourney (no null) cuando no hubo ninguna decisión todavía, con 3 pasos máximo", () => {
    const vm = buildVm(emptyOrgData);
    expect(vm.setupJourney).not.toBeNull();
    expect(vm.setupJourney?.steps).toHaveLength(3);
    expect(vm.setupJourney?.steps.map((s) => s.key)).toEqual(["CONFIGURE", "IMPORT", "REVIEW"]);
  });

  it("no confunde organización creada con consorcio configurado: el paso 1 no está COMPLETE sin unidades/obligaciones", () => {
    const orgOnlyData: OperationalInboxData = { ...emptyOrgData, organizationCount: 1 };
    const vm = buildVm(orgOnlyData);
    expect(vm.setupJourney?.steps[0].state).not.toBe("COMPLETE");
    expect(vm.setupJourney?.steps[0].state).toBe("CURRENT");
  });

  it("expone una única CTA primaria real (href de un hito accionable real, no inventado)", () => {
    const vm = buildVm(emptyOrgData);
    expect(vm.setupJourney?.primaryCta).toMatchObject({ href: "/importar" });
  });

  it("UX.3.2 §2 — el título del paso activo y el botón de CTA describen el mismo destino, nunca dos procesos distintos", () => {
    const vm = buildVm(emptyOrgData);
    const activeStep = vm.setupJourney?.steps.find((s) => s.state === "CURRENT" || s.state === "BLOCKED");
    expect(activeStep).toBeDefined();
    // El título visible del paso y el título/href de la CTA primaria vienen
    // del mismo hito real — no pueden divergir por construcción.
    expect(vm.setupJourney?.primaryCta?.title).toBe(activeStep?.title);
    expect(vm.setupJourney?.primaryCta?.href).toBe(activeStep?.href);
    expect(vm.setupJourney?.primaryCta?.actionLabel).toBe(activeStep?.actionLabel);
    // Caso concreto: la organización todavía no existe → el paso y el botón
    // hablan los dos de "crear o importar un consorcio" vía /importar.
    expect(activeStep?.title).toMatch(/consorcio/i);
    expect(vm.setupJourney?.primaryCta?.actionLabel).toBe("Importar consorcio");
  });

  it("cuando el consorcio ya existe pero faltan unidades, el paso y el CTA hablan de unidades — no del consorcio ni de movimientos", () => {
    const orgOnlyData: OperationalInboxData = { ...emptyOrgData, organizationCount: 1 };
    const vm = buildVm(orgOnlyData);
    const configureStep = vm.setupJourney?.steps.find((s) => s.key === "CONFIGURE");
    expect(configureStep?.href).toBe("/unidades-config");
    expect(configureStep?.actionLabel).toBe("Gestionar unidades");
    expect(vm.setupJourney?.primaryCta).toMatchObject({ href: "/unidades-config", actionLabel: "Gestionar unidades", title: configureStep?.title });
  });
});

describe("buildOperationalInboxViewModel — todo al día", () => {
  it("colas vacías, sin siguiente paso, sin setup journey", () => {
    const vm = buildVm(baseData);
    expect(vm.setupJourney).toBeNull();
    expect(vm.attentionQueue).toEqual({ available: true, cases: [] });
    expect(vm.informationQueue).toEqual([]);
    expect(vm.nextStep).toBeNull();
    expect(vm.summary.needsDecision).toEqual({ status: "available", value: 0, capped: false });
  });
});

describe("buildOperationalInboxViewModel — requiere decisión", () => {
  it("mapea reviewItems a AttentionCase reales, y recomienda el más antiguo como siguiente paso", () => {
    const oldest = reviewItem({ id: "single:pt-old", paymentTransactionId: "pt-old", createdAt: "2026-07-01T00:00:00.000Z", organizationName: "Consorcio Viejo" });
    const newest = reviewItem({ id: "ambiguous:pt-new", paymentTransactionId: "pt-new", kind: "AMBIGUOUS", createdAt: "2026-08-01T00:00:00.000Z" });
    const vm = buildVm(baseData, [oldest, newest]);

    expect(vm.attentionQueue.available).toBe(true);
    expect(vm.attentionQueue.cases).toHaveLength(2);
    expect(vm.attentionQueue.cases[0]).toMatchObject({ organizationName: "Consorcio Viejo", href: "/conciliacion/resolver/pt-old", actionLabel: "Revisar" });
    expect(vm.attentionQueue.cases[1].title).toBe("Pago con varios candidatos posibles");
    expect(vm.summary.needsDecision).toEqual({ status: "available", value: 2, capped: false });
    expect(vm.nextStep).toMatchObject({ href: "/conciliacion/resolver/pt-old", actionLabel: "Revisar caso" });
  });
});

describe("buildOperationalInboxViewModel — requiere información", () => {
  it("mapea needsInformation a InformationCase reales con razón honesta, no inventada por caso", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: [needsInfoPayment()] };
    const vm = buildVm(data);

    expect(vm.informationQueue).toHaveLength(1);
    expect(vm.informationQueue[0]).toMatchObject({ organizationName: "Consorcio Test", referenceLabel: "Transferencia", href: "/conciliacion/resolver/pt-info-1" });
    expect(vm.informationQueue[0].reason).toMatch(/evidencia suficiente/);
  });

  it("cuando no hay cola de decisión pero sí hay información pendiente, el siguiente paso prioriza información", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: [needsInfoPayment({ id: "pt-info-priority" })] };
    const vm = buildVm(data);
    expect(vm.nextStep).toMatchObject({ href: "/conciliacion/resolver/pt-info-priority", actionLabel: "Investigar" });
  });

  it("la cola de decisión, cuando existe, tiene prioridad sobre la de información en el siguiente paso", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: [needsInfoPayment()] };
    const vm = buildVm(data, [reviewItem()]);
    expect(vm.nextStep?.actionLabel).toBe("Revisar caso");
  });
});

describe("buildOperationalInboxViewModel — cola de revisión no disponible", () => {
  it("marca needsDecision como no disponible, nunca como cero", () => {
    const vm = buildVm(baseData, [], false);
    expect(vm.summary.needsDecision).toEqual({ status: "unavailable", reason: expect.stringContaining("no está disponible") });
    expect(vm.attentionQueue).toEqual({ available: false, cases: [] });
  });

  it("si además no hay información pendiente, el siguiente paso redirige honestamente a Conciliación", () => {
    const vm = buildVm(baseData, [], false);
    expect(vm.nextStep).toMatchObject({ href: "/conciliacion", actionLabel: "Ir a Conciliación" });
  });

  it("si hay información pendiente, esa toma prioridad sobre el fallback de cola no disponible", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: [needsInfoPayment()] };
    const vm = buildVm(data, [], false);
    expect(vm.nextStep?.actionLabel).toBe("Investigar");
  });
});

describe("buildOperationalInboxViewModel — métricas con límite de consulta (capped)", () => {
  it("needsInformation se marca capped al alcanzar el límite de 8 (take:8 de la consulta real)", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: Array.from({ length: 8 }, (_, i) => needsInfoPayment({ id: `pt-${i}` })) };
    const vm = buildVm(data);
    expect(vm.summary.needsInformation).toEqual({ status: "available", value: 8, capped: true });
  });

  it("needsInformation con menos de 8 nunca se marca capped — el número es exacto", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: [needsInfoPayment()] };
    const vm = buildVm(data);
    expect(vm.summary.needsInformation).toEqual({ status: "available", value: 1, capped: false });
  });
});

describe("buildOperationalInboxViewModel — procesados hoy (derivado, sin query nueva)", () => {
  it("cuenta solo actividad de tipo PAYMENT_RECEIVED ocurrida hoy, ignorando decisiones humanas y días anteriores", () => {
    const now = new Date();
    const todayIso = now.toISOString();
    const yesterdayIso = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString();
    const data: OperationalInboxData = {
      ...baseData,
      recentActivity: [
        { id: "a1", kind: "PAYMENT_RECEIVED", title: "Movimiento ingresado", detail: "$1000", organizationName: "X", createdAt: todayIso },
        { id: "a2", kind: "HUMAN_DECISION", title: "Conciliación aprobada", detail: "Decisión", organizationName: "X", createdAt: todayIso },
        { id: "a3", kind: "PAYMENT_RECEIVED", title: "Movimiento ingresado", detail: "$500", organizationName: "X", createdAt: yesterdayIso },
      ],
    };
    const vm = buildVm(data);
    expect(vm.summary.processedToday).toEqual({ status: "available", value: 1, capped: false });
  });

  it("se marca capped cuando la actividad reciente alcanzó su límite de consulta (take:8) — el número puede ser un piso", () => {
    const todayIso = new Date().toISOString();
    const data: OperationalInboxData = {
      ...baseData,
      recentActivity: Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, kind: "PAYMENT_RECEIVED" as const, title: "Movimiento ingresado", detail: "$1", organizationName: "X", createdAt: todayIso })),
    };
    const vm = buildVm(data);
    expect(vm.summary.processedToday).toEqual({ status: "available", value: 8, capped: true });
  });
});

describe("buildOperationalInboxViewModel — resueltos hoy", () => {
  it("pasa directamente el conteo exacto ya provisto por la capa de datos, sin recomputar", () => {
    const data: OperationalInboxData = { ...baseData, resolvedToday: 4, recentActivity: [{ id: "a1", kind: "HUMAN_DECISION", title: "x", detail: "x", organizationName: "X", createdAt: new Date().toISOString() }] };
    const vm = buildVm(data);
    expect(vm.summary.resolvedToday).toEqual({ status: "available", value: 4, capped: false });
  });
});

describe("buildOperationalInboxViewModel — actividad reciente", () => {
  it("estado disponible con entradas reales mapeadas, formateadas para presentación", () => {
    const data: OperationalInboxData = {
      ...baseData,
      recentActivity: [{ id: "a1", kind: "PAYMENT_RECEIVED", title: "Movimiento ingresado", detail: "$1000", organizationName: "Consorcio X", createdAt: new Date().toISOString() }],
    };
    const vm = buildVm(data);
    expect(vm.recentActivity.status).toBe("available");
    if (vm.recentActivity.status === "available") {
      expect(vm.recentActivity.entries).toHaveLength(1);
      expect(vm.recentActivity.entries[0]).toMatchObject({ organizationName: "Consorcio X", title: "Movimiento ingresado" });
    }
  });

  it("estado disponible pero vacío cuando no hay actividad — nunca actividad inventada", () => {
    const vm = buildVm(baseData);
    expect(vm.recentActivity).toEqual({ status: "available", entries: [] });
  });
});

describe("hasContradictoryEmptyActivity — invariante de consistencia (UX.3.1 sección 7)", () => {
  it("es contradictorio: hubo resoluciones hoy pero la muestra de actividad está vacía", () => {
    expect(hasContradictoryEmptyActivity([], 3)).toBe(true);
  });

  it("no es contradictorio: sin resoluciones y sin actividad — vacío legítimo", () => {
    expect(hasContradictoryEmptyActivity([], 0)).toBe(false);
  });

  it("no es contradictorio si hay entradas, sin importar el conteo de resueltos", () => {
    expect(hasContradictoryEmptyActivity([{ id: "a1", kind: "HUMAN_DECISION", title: "x", organizationName: "x", detail: "x", whenLabel: "hoy" }], 1)).toBe(false);
  });

  it("buildOperationalInboxViewModel expone un contradictionNote real (no oculta el número) cuando se da el caso", () => {
    const data: OperationalInboxData = { ...baseData, resolvedToday: 2, recentActivity: [] };
    const vm = buildVm(data);
    expect(vm.recentActivity.status).toBe("available");
    if (vm.recentActivity.status === "available") {
      expect(vm.recentActivity.entries).toEqual([]);
      expect(vm.recentActivity.contradictionNote).toMatch(/2 casos/);
    }
    expect(vm.summary.resolvedToday).toEqual({ status: "available", value: 2, capped: false });
  });
});

describe("buildOperationalInboxViewModel — accesos rápidos y morosidad", () => {
  it("solo incluye rutas reales y funcionales, ninguna hardcodeada como fetch dinámico", () => {
    const vm = buildVm(baseData);
    expect(vm.quickActions.map((a) => a.href)).toEqual(["/conciliacion", "/importar", "/unidades-config"]);
  });

  it("morosidad es un enlace de salida, nunca datos ni CTA de WhatsApp inline", () => {
    const vm = buildVm(baseData);
    expect(vm.delinquency).toEqual({ href: "/morosidad" });
  });
});

describe("buildOperationalInboxViewModel — estado de evaluación no disponible (error recuperable)", () => {
  it("propaga el estado ASSESSMENT_UNAVAILABLE al setup journey sin fabricar disponibilidad", () => {
    const orgOnlyData: OperationalInboxData = { organizationCount: 1, onboarding: { unitCount: 2, obligationCount: 2, paymentCount: 3, reviewCount: 0, firstDecisionCount: 0 }, needsInformation: [], recentActivity: [], resolvedToday: 0 };
    const vm = buildVm(orgOnlyData, [], true, ASSESSMENT_UNAVAILABLE);
    expect(vm.setupJourney?.steps.find((s) => s.key === "REVIEW")?.state).toBe("BLOCKED");
  });
});
