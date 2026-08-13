import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      // `server-only` es un marcador que Next.js resuelve al compilar la app.
      // Vitest ejecuta módulos de servidor en Node y necesita un stub inocuo;
      // no cambia el bundle ni el comportamiento de producción.
      "server-only": path.resolve(dirname, "./src/test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
