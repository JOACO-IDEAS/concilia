import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Explicit PostgreSQL gate. Run only with target/credentials authorization. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(dirname, "./src"), "server-only": path.resolve(dirname, "./src/test/server-only.ts") } },
  test: {
    environment: "node",
    include: ["**/*.fixtures.test.mts"],
  },
});
