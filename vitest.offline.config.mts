import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** PostgreSQL suites require explicit authorization and must never be discovered by the offline gate. */
export const OFFLINE_TEST_EXCLUDES = [
  ...configDefaults.exclude,
  "**/*.fixtures.test.mts",
];

export default defineConfig({
  resolve: { alias: { "@": path.resolve(dirname, "./src"), "server-only": path.resolve(dirname, "./src/test/server-only.ts") } },
  test: {
    environment: "node",
    exclude: OFFLINE_TEST_EXCLUDES,
  },
});
