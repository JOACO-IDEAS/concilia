import { describe, expect, it } from "vitest";
import { buildOperationalInboxViewModel } from "./operational-inbox-view-model";
import type { OperationalInboxData, OperationalReviewItem } from "@/app/operational-inbox-data";

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

describe("buildOperationalInboxViewModel — organización nueva sin datos", () => {
  it("activa showSetupJourney cuando no hubo ninguna decisión todavía", () => {
    const vm = buildOperationalInboxViewModel(emptyOrgData, [], true);
    expect(vm.showSetupJourney).toBe(true);
  });
});

describe("buildOperationalInboxViewModel — todo al día", () => {
  it("colas vacías, sin siguiente paso, sin journey de setup", () => {
    const vm = buildOperationalInboxViewModel(baseData, [], true);
    expect(vm.showSetupJourney).toBe(false);
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
    const vm = buildOperationalInboxViewModel(baseData, [oldest, newest], true);

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
    const vm = buildOperationalInboxViewModel(data, [], true);

    expect(vm.informationQueue).toHaveLength(1);
    expect(vm.informationQueue[0]).toMatchObject({ organizationName: "Consorcio Test", referenceLabel: "Transferencia", href: "/conciliacion/resolver/pt-info-1" });
    expect(vm.informationQueue[0].reason).toMatch(/evidencia suficiente/);
  });

  it("cuando no hay cola de decisión pero sí hay información pendiente, el siguiente paso prioriza información", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: [needsInfoPayment({ id: "pt-info-priority" })] };
    const vm = buildOperationalInboxViewModel(data, [], true);
    expect(vm.nextStep).toMatchObject({ href: "/conciliacion/resolver/pt-info-priority", actionLabel: "Investigar" });
  });

  it("la cola de decisión, cuando existe, tiene prioridad sobre la de información en el siguiente paso", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: [needsInfoPayment()] };
    const vm = buildOperationalInboxViewModel(data, [reviewItem()], true);
    expect(vm.nextStep?.actionLabel).toBe("Revisar caso");
  });
});

describe("buildOperationalInboxViewModel — cola de revisión no disponible", () => {
  it("marca needsDecision como no disponible, nunca como cero", () => {
    const vm = buildOperationalInboxViewModel(baseData, [], false);
    expect(vm.summary.needsDecision).toEqual({ status: "unavailable", reason: expect.stringContaining("no está disponible") });
    expect(vm.attentionQueue).toEqual({ available: false, cases: [] });
  });

  it("si además no hay información pendiente, el siguiente paso redirige honestamente a Conciliación", () => {
    const vm = buildOperationalInboxViewModel(baseData, [], false);
    expect(vm.nextStep).toMatchObject({ href: "/conciliacion", actionLabel: "Ir a Conciliación" });
  });

  it("si hay información pendiente, esa toma prioridad sobre el fallback de cola no disponible", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: [needsInfoPayment()] };
    const vm = buildOperationalInboxViewModel(data, [], false);
    expect(vm.nextStep?.actionLabel).toBe("Investigar");
  });
});

describe("buildOperationalInboxViewModel — métricas con límite de consulta (capped)", () => {
  it("needsInformation se marca capped al alcanzar el límite de 8 (take:8 de la consulta real)", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: Array.from({ length: 8 }, (_, i) => needsInfoPayment({ id: `pt-${i}` })) };
    const vm = buildOperationalInboxViewModel(data, [], true);
    expect(vm.summary.needsInformation).toEqual({ status: "available", value: 8, capped: true });
  });

  it("needsInformation con menos de 8 nunca se marca capped — el número es exacto", () => {
    const data: OperationalInboxData = { ...baseData, needsInformation: [needsInfoPayment()] };
    const vm = buildOperationalInboxViewModel(data, [], true);
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
    const vm = buildOperationalInboxViewModel(data, [], true);
    expect(vm.summary.processedToday).toEqual({ status: "available", value: 1, capped: false });
  });

  it("se marca capped cuando la actividad reciente alcanzó su límite de consulta (take:8) — el número puede ser un piso", () => {
    const todayIso = new Date().toISOString();
    const data: OperationalInboxData = {
      ...baseData,
      recentActivity: Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, kind: "PAYMENT_RECEIVED" as const, title: "Movimiento ingresado", detail: "$1", organizationName: "X", createdAt: todayIso })),
    };
    const vm = buildOperationalInboxViewModel(data, [], true);
    expect(vm.summary.processedToday).toEqual({ status: "available", value: 8, capped: true });
  });
});

describe("buildOperationalInboxViewModel — resueltos hoy", () => {
  it("pasa directamente el conteo exacto ya provisto por la capa de datos, sin recomputar", () => {
    const data: OperationalInboxData = { ...baseData, resolvedToday: 4 };
    const vm = buildOperationalInboxViewModel(data, [], true);
    expect(vm.summary.resolvedToday).toEqual({ status: "available", value: 4, capped: false });
  });
});

describe("buildOperationalInboxViewModel — actividad reciente", () => {
  it("estado disponible con entradas reales mapeadas, formateadas para presentación", () => {
    const data: OperationalInboxData = {
      ...baseData,
      recentActivity: [{ id: "a1", kind: "PAYMENT_RECEIVED", title: "Movimiento ingresado", detail: "$1000", organizationName: "Consorcio X", createdAt: new Date().toISOString() }],
    };
    const vm = buildOperationalInboxViewModel(data, [], true);
    expect(vm.recentActivity.status).toBe("available");
    if (vm.recentActivity.status === "available") {
      expect(vm.recentActivity.entries).toHaveLength(1);
      expect(vm.recentActivity.entries[0]).toMatchObject({ organizationName: "Consorcio X", title: "Movimiento ingresado" });
    }
  });

  it("estado disponible pero vacío cuando no hay actividad — nunca actividad inventada", () => {
    const vm = buildOperationalInboxViewModel(baseData, [], true);
    expect(vm.recentActivity).toEqual({ status: "available", entries: [] });
  });
});

describe("buildOperationalInboxViewModel — accesos rápidos y morosidad", () => {
  it("solo incluye rutas reales y funcionales, ninguna hardcodeada como fetch dinámico", () => {
    const vm = buildOperationalInboxViewModel(baseData, [], true);
    expect(vm.quickActions.map((a) => a.href)).toEqual(["/conciliacion", "/importar", "/unidades-config"]);
  });

  it("morosidad es un enlace de salida, nunca datos ni CTA de WhatsApp inline", () => {
    const vm = buildOperationalInboxViewModel(baseData, [], true);
    expect(vm.delinquency).toEqual({ href: "/morosidad" });
  });
});
