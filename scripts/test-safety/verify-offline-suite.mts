import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixtureSuffix = ".fixtures.test.mts";

function findFixtureSuites(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? findFixtureSuites(path) : entry.name.endsWith(fixtureSuffix) ? [relative(root, path)] : [];
  });
}

// Static collection does not import test modules or execute hooks. The offline
// config is therefore verified before any test code can run.
const listed = execFileSync(
  resolve(root, "node_modules/.bin/vitest"),
  ["list", "--config", "vitest.offline.config.mts", "--filesOnly", "--staticParse"],
  { cwd: root, encoding: "utf8", env: { ...process.env, DATABASE_URL: "", DATABASE_URL_UNPOOLED: "", DIRECT_URL: "" } },
).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

const fixtureListed = execFileSync(
  resolve(root, "node_modules/.bin/vitest"),
  ["list", "--config", "vitest.fixtures.config.mts", "--filesOnly", "--staticParse"],
  { cwd: root, encoding: "utf8", env: { ...process.env, DATABASE_URL: "", DATABASE_URL_UNPOOLED: "", DIRECT_URL: "" } },
).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

const fixtures = findFixtureSuites(root);
if (fixtures.length === 0) throw new Error("Offline safety contract: no fixture suites were found to protect.");
const leaked = listed.filter((file) => file.endsWith(fixtureSuffix));
if (leaked.length > 0) throw new Error(`Offline safety contract: fixture suites leaked into collection: ${leaked.join(", ")}`);
if (!listed.some((file) => file.endsWith("src/lib/payer-identity/runtime-financial-intelligence.test.ts"))) {
  throw new Error("Offline safety contract: normal application tests are not being collected.");
}
if (fixtureListed.length !== fixtures.length || fixtureListed.some((file) => !file.endsWith(fixtureSuffix))) {
  throw new Error("Offline safety contract: the explicit fixtures gate does not select exactly the fixture suites.");
}

process.stdout.write(`[offline-safety] PASS: ${listed.length} offline files; ${fixtures.length} fixture suites excluded.\n`);
