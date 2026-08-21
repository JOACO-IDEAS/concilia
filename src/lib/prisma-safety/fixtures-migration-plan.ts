import { resolverDatasourceSeleccionDesdeEnv, verificarEntornoContraTarget } from "./entornos";

export class FixturesMigrationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixturesMigrationConfigurationError";
  }
}

/** Plan puro: resuelve UNA vez y entrega el mismo valor a preflight y migrate. */
export function planificarMigracionFixtures(env: NodeJS.ProcessEnv) {
  const selection = resolverDatasourceSeleccionDesdeEnv(env);
  if (!selection) throw new FixturesMigrationConfigurationError("No hay DIRECT_URL, DATABASE_URL_UNPOOLED ni DATABASE_URL para fixtures.");
  const verification = verificarEntornoContraTarget(selection.url, "fixtures");
  if (!verification.ok) throw new FixturesMigrationConfigurationError(verification.motivo);
  return {
    sourceVariable: selection.variable,
    endpoint: selection.url,
    preflightEndpoint: selection.url,
    migrationEndpoint: selection.url,
    host: verification.host!,
  };
}
