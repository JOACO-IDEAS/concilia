import { describe, expect, it } from "vitest";
import {
  detectarEntornoPorHost,
  esComandoRiesgoso,
  extraerHost,
  extraerUrlDeArgv,
  FIXTURES_HOST_FRAGMENT,
  PRODUCTION_HOST_FRAGMENT,
  resolverDatasourceUrlDesdeEnv,
  verificarEntornoContraTarget,
} from "./entornos";

const URL_PRODUCCION = `postgresql://user:pass@${PRODUCTION_HOST_FRAGMENT}-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require`;
const URL_FIXTURES = `postgresql://user:pass@${FIXTURES_HOST_FRAGMENT}-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require`;
const URL_DESCONOCIDA = `postgresql://user:pass@algun-otro-host.example.com/db`;

describe("extraerHost", () => {
  it("extrae el host de una URL válida", () => {
    expect(extraerHost(URL_PRODUCCION)).toContain(PRODUCTION_HOST_FRAGMENT);
  });
  it("null para undefined/vacío/URL inválida — nunca lanza", () => {
    expect(extraerHost(undefined)).toBeNull();
    expect(extraerHost("")).toBeNull();
    expect(extraerHost("no-es-una-url")).toBeNull();
  });
});

describe("detectarEntornoPorHost — producción detectada correctamente", () => {
  it("host de producción → 'production'", () => {
    expect(detectarEntornoPorHost(extraerHost(URL_PRODUCCION))).toBe("production");
  });
});

describe("detectarEntornoPorHost — fixtures/dev detectado correctamente", () => {
  it("host de dev-fixtures → 'fixtures'", () => {
    expect(detectarEntornoPorHost(extraerHost(URL_FIXTURES))).toBe("fixtures");
  });
});

describe("detectarEntornoPorHost — ambigüedad", () => {
  it("host desconocido → 'unknown', nunca se adivina", () => {
    expect(detectarEntornoPorHost(extraerHost(URL_DESCONOCIDA))).toBe("unknown");
  });
  it("sin host → 'unknown'", () => {
    expect(detectarEntornoPorHost(null)).toBe("unknown");
    expect(detectarEntornoPorHost(undefined)).toBe("unknown");
  });
});

describe("resolverDatasourceUrlDesdeEnv — misma cadena que prisma.config.ts", () => {
  it("prioriza DIRECT_URL", () => {
    expect(resolverDatasourceUrlDesdeEnv({ DIRECT_URL: "a", DATABASE_URL_UNPOOLED: "b", DATABASE_URL: "c" } as unknown as NodeJS.ProcessEnv)).toBe("a");
  });
  it("cae a DATABASE_URL_UNPOOLED si no hay DIRECT_URL", () => {
    expect(resolverDatasourceUrlDesdeEnv({ DATABASE_URL_UNPOOLED: "b", DATABASE_URL: "c" } as unknown as NodeJS.ProcessEnv)).toBe("b");
  });
  it("cae a DATABASE_URL como último recurso", () => {
    expect(resolverDatasourceUrlDesdeEnv({ DATABASE_URL: "c" } as unknown as NodeJS.ProcessEnv)).toBe("c");
  });
  it("undefined si no hay ninguna", () => {
    expect(resolverDatasourceUrlDesdeEnv({} as unknown as NodeJS.ProcessEnv)).toBeUndefined();
  });
});

describe("verificarEntornoContraTarget — el corazón de la guardia", () => {
  it("DATABASE_URL exportada en shell NO puede pisar silenciosamente el datasource: la verificación siempre se hace sobre el valor EFECTIVO resuelto, sin importar de qué variable vino — si ese valor efectivo es producción, se detecta como producción sin importar la intención declarada por variables previas", () => {
    // Simula exactamente el incidente: alguien "cree" que exportó fixtures,
    // pero .env.local (override:true en prisma.config.ts) hizo que el valor
    // EFECTIVO terminara siendo producción. La función no confía en la
    // intención — confía únicamente en la URL real que se le pasa.
    const r = verificarEntornoContraTarget(URL_PRODUCCION, "fixtures");
    expect(r.ok).toBe(false);
    expect(r.entornoDetectado).toBe("production");
  });

  it("producción es detectada correctamente cuando se declara production", () => {
    const r = verificarEntornoContraTarget(URL_PRODUCCION, "production");
    expect(r.ok).toBe(true);
    expect(r.entornoDetectado).toBe("production");
  });

  it("fixtures/dev es detectado correctamente cuando se declara fixtures", () => {
    const r = verificarEntornoContraTarget(URL_FIXTURES, "fixtures");
    expect(r.ok).toBe(true);
    expect(r.entornoDetectado).toBe("fixtures");
  });

  it("una operación de migración contra producción cuando debería ser fixtures ABORTA — reproduce el incidente real exacto", () => {
    const r = verificarEntornoContraTarget(URL_PRODUCCION, "fixtures");
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("Fase 5.9");
  });

  it("el caso inverso también aborta: declarar production mientras el datasource resuelve a fixtures", () => {
    const r = verificarEntornoContraTarget(URL_FIXTURES, "production");
    expect(r.ok).toBe(false);
  });

  it("una operación correctamente apuntada a fixtures puede continuar (ok=true, sin ambigüedad)", () => {
    const r = verificarEntornoContraTarget(URL_FIXTURES, "fixtures");
    expect(r.ok).toBe(true);
    expect(r.motivo).not.toContain("ABORT");
  });

  it("cualquier estado ambiguo ABORTA — sin targetDeclarado", () => {
    expect(verificarEntornoContraTarget(URL_FIXTURES, undefined).ok).toBe(false);
    expect(verificarEntornoContraTarget(URL_FIXTURES, null).ok).toBe(false);
    expect(verificarEntornoContraTarget(URL_FIXTURES, "").ok).toBe(false);
    expect(verificarEntornoContraTarget(URL_FIXTURES, "staging").ok).toBe(false); // valor no reconocido, nunca se interpreta
  });

  it("cualquier estado ambiguo ABORTA — host no reconocido, aunque el target sí sea válido", () => {
    const r = verificarEntornoContraTarget(URL_DESCONOCIDA, "fixtures");
    expect(r.ok).toBe(false);
    expect(r.entornoDetectado).toBe("unknown");
  });

  it("cualquier estado ambiguo ABORTA — sin URL en absoluto", () => {
    expect(verificarEntornoContraTarget(null, "fixtures").ok).toBe(false);
    expect(verificarEntornoContraTarget(undefined, "production").ok).toBe(false);
  });
});

describe("extraerUrlDeArgv — soporte de --url explícito (con espacio o con =)", () => {
  it("--url <valor>", () => {
    expect(extraerUrlDeArgv(["migrate", "dev", "--url", URL_FIXTURES])).toBe(URL_FIXTURES);
  });
  it("--url=<valor>", () => {
    expect(extraerUrlDeArgv(["migrate", "dev", `--url=${URL_FIXTURES}`])).toBe(URL_FIXTURES);
  });
  it("null si no está presente", () => {
    expect(extraerUrlDeArgv(["migrate", "dev"])).toBeNull();
  });
});

describe("esComandoRiesgoso — qué subcomandos activan la guardia", () => {
  it("migrate/db/studio son riesgosos", () => {
    expect(esComandoRiesgoso(["node", "prisma", "migrate", "dev"])).toBe(true);
    expect(esComandoRiesgoso(["node", "prisma", "db", "push"])).toBe(true);
    expect(esComandoRiesgoso(["node", "prisma", "studio"])).toBe(true);
  });
  it("generate/validate/format NO activan la guardia — no debe romper postinstall/CI", () => {
    expect(esComandoRiesgoso(["node", "prisma", "generate"])).toBe(false);
    expect(esComandoRiesgoso(["node", "prisma", "validate"])).toBe(false);
    expect(esComandoRiesgoso(["node", "prisma", "format"])).toBe(false);
  });
});
