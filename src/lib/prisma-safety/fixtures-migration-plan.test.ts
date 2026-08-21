import { describe, expect, it } from "vitest";
import { FIXTURES_HOST_FRAGMENT } from "./entornos";
import { FixturesMigrationConfigurationError, planificarMigracionFixtures } from "./fixtures-migration-plan";

const fixtures = (label: string) =>
  `postgresql://user:pass@${FIXTURES_HOST_FRAGMENT}${label === "pooled" ? "-pooler" : ""}.example.com/neondb?application_name=${label}`;

describe("planificarMigracionFixtures", () => {
  it("A: DIRECT_URL gana y es exactamente el endpoint de preflight y migrate", () => {
    const direct = fixtures("direct");
    const plan = planificarMigracionFixtures({ DIRECT_URL: direct, DATABASE_URL_UNPOOLED: fixtures("unpooled"), DATABASE_URL: fixtures("pooled") } as unknown as NodeJS.ProcessEnv);
    expect(plan.sourceVariable).toBe("DIRECT_URL");
    expect(plan.preflightEndpoint).toBe(direct);
    expect(plan.migrationEndpoint).toBe(direct);
  });

  it("B: sin DIRECT_URL usa DATABASE_URL_UNPOOLED para ambos", () => {
    const unpooled = fixtures("unpooled");
    const plan = planificarMigracionFixtures({ DATABASE_URL_UNPOOLED: unpooled, DATABASE_URL: fixtures("pooled") } as unknown as NodeJS.ProcessEnv);
    expect(plan.sourceVariable).toBe("DATABASE_URL_UNPOOLED");
    expect(plan.preflightEndpoint).toBe(unpooled);
    expect(plan.migrationEndpoint).toBe(unpooled);
  });

  it("C: cae a DATABASE_URL para ambos", () => {
    const pooled = fixtures("pooled");
    const plan = planificarMigracionFixtures({ DATABASE_URL: pooled } as unknown as NodeJS.ProcessEnv);
    expect(plan.sourceVariable).toBe("DATABASE_URL");
    expect(plan.preflightEndpoint).toBe(pooled);
    expect(plan.migrationEndpoint).toBe(pooled);
  });

  it("D: URL inválida o host no autorizado falla cerrado", () => {
    expect(() => planificarMigracionFixtures({ DIRECT_URL: "not-a-url" } as unknown as NodeJS.ProcessEnv)).toThrow(FixturesMigrationConfigurationError);
    expect(() => planificarMigracionFixtures({ DIRECT_URL: "postgresql://u:p@unknown.example/db" } as unknown as NodeJS.ProcessEnv)).toThrow(FixturesMigrationConfigurationError);
  });

  it("E: ausencia total de URL falla explícitamente", () => {
    expect(() => planificarMigracionFixtures({} as NodeJS.ProcessEnv)).toThrow("No hay DIRECT_URL");
  });
});
