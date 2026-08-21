import { describe, expect, it } from "vitest";
import { resolverDatasourceSeleccionDesdeEnv } from "./entornos";
import { fingerprintDatasource, parsearVariablesEnv } from "./env-file";
import { planificarMigracionFixtures } from "./fixtures-migration-plan";
import { FIXTURES_HOST_FRAGMENT } from "./entornos";

const COMPLEX = `postgresql://user:p%40ss%3Aword%24with%2520encoded@${FIXTURES_HOST_FRAGMENT}.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`;

describe("canonical isolated fixtures env loader", () => {
  it("standalone y wrapper reciben exactamente los mismos bytes y SHA-256", () => {
    const file = `DATABASE_URL="postgresql://pooled.invalid"\nDATABASE_URL_UNPOOLED="${COMPLEX}"\n`;
    const standaloneEnv = parsearVariablesEnv(file);
    const wrapperEnv = parsearVariablesEnv(file);
    const standalone = resolverDatasourceSeleccionDesdeEnv(standaloneEnv)!;
    const wrapper = planificarMigracionFixtures(wrapperEnv);
    expect(standalone.variable).toBe("DATABASE_URL_UNPOOLED");
    expect(wrapper.sourceVariable).toBe("DATABASE_URL_UNPOOLED");
    expect(standalone.url).toBe(wrapper.endpoint);
    expect(Buffer.from(standalone.url)).toEqual(Buffer.from(wrapper.endpoint));
    expect(fingerprintDatasource(standalone.url)).toBe(fingerprintDatasource(wrapper.endpoint));
  });

  it("password complejo permanece byte-identical después del parse único", () => {
    expect(parsearVariablesEnv(`DATABASE_URL_UNPOOLED="${COMPLEX}"`).DATABASE_URL_UNPOOLED).toBe(COMPLEX);
  });

  it("variables heredadas no pueden alterar el archivo aislado", () => {
    const isolated = parsearVariablesEnv(`DATABASE_URL_UNPOOLED="${COMPLEX}"`);
    const inherited = { DIRECT_URL: "postgresql://production.invalid", ...isolated } as unknown as NodeJS.ProcessEnv;
    expect(resolverDatasourceSeleccionDesdeEnv(isolated)?.variable).toBe("DATABASE_URL_UNPOOLED");
    expect(resolverDatasourceSeleccionDesdeEnv(inherited)?.variable).toBe("DIRECT_URL");
    expect(isolated.DIRECT_URL).toBeUndefined();
  });
});
