import { createHash } from "node:crypto";
import { glob, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadConfigFromFile } from "vite";
import { configDefaults } from "vitest/config";
import ts from "typescript";
import { argument, repoRoot } from "./quality-registry.mjs";

const args = process.argv.slice(2);
const baseRoot = resolve(argument(args, "--baseline-root", ".tmp/premain-production-baseline-f572742"));
const headRoot = resolve(argument(args, "--head-root", repoRoot));
const output = resolve(argument(args, "--output", join(headRoot, "artifacts/config-equivalence.json")));
const registry = JSON.parse(await readFile(new URL("./test-projects.json", import.meta.url), "utf8"));
const checks = [], differences = [];
const normalize = (value, root) => {
  if (value instanceof RegExp) return { regexp: value.source, flags: value.flags };
  if (Array.isArray(value)) return value.map((entry) => normalize(entry, root));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, normalize(value[key], root)]));
  if (typeof value === "string") return value.replaceAll("\\", "/").replaceAll(root.replaceAll("\\", "/"), "<repo>").replace(/\/$/, "");
  return value;
};
async function snapshot(root, configFile) {
  const full = resolve(root, configFile);
  // Keep package-local dependencies anchored to the config's original location.
  // Bundling into the workspace .vite-temp directory loses that resolution scope.
  const loaded = await loadConfigFromFile({ command: "serve", mode: "test" }, full, dirname(full), "silent", undefined, "runner");
  if (!loaded) throw new Error("Config did not load: " + full);
  const config = loaded.config;
  const test = { ...config.test };
  delete test.name; delete test.root;
  test.environment ??= "node"; test.pool ??= configDefaults.pool; test.isolate ??= configDefaults.isolate;
  test.include ??= configDefaults.include; test.exclude ??= configDefaults.exclude;
  const rootDirectory = resolve(config.root ?? dirname(full));
  const files = [];
  for await (const file of glob(test.include, { cwd: rootDirectory, exclude: test.exclude })) files.push(file.replaceAll("\\", "/"));
  // Browser wrappers were previously collected twice in jsdom and Chromium.
  if (configFile === "packages/reflex-dom/vite.config.ts") {
    test.exclude = test.exclude.filter((pattern) => pattern !== "test/**/*.browser.test.ts");
  }
  const resolver = { ...config.resolve };
  if (resolver.alias && !Array.isArray(resolver.alias)) resolver.alias = Object.entries(resolver.alias).map(([find, replacement]) => ({ find, replacement }));
  return normalize({ root: rootDirectory, define: config.define, resolve: resolver,
    plugins: (config.plugins ?? []).flat(Infinity).filter(Boolean).map((plugin) => ({ name: plugin.name, enforce: plugin.enforce, apply: typeof plugin.apply === "string" ? plugin.apply : undefined })),
    esbuild: config.esbuild, build: config.build, test,
    files: files.filter((file) => configFile !== "packages/reflex-dom/vite.config.ts" || !file.endsWith(".browser.test.ts")).sort() }, root);
}
function compare(name, before, after) {
  const passed = JSON.stringify(before) === JSON.stringify(after);
  checks.push({ name, passed, beforeSha256: createHash("sha256").update(JSON.stringify(before)).digest("hex"), afterSha256: createHash("sha256").update(JSON.stringify(after)).digest("hex") });
  if (!passed) differences.push({ name, before, after });
}
for (const project of registry.projects) {
  const before = await snapshot(baseRoot, project.config);
  const after = await snapshot(headRoot, project.config);
  // CI screenshot artifacts add no test semantics and are an explicit override.
  if (project.config === "packages/reflex-dom/vite.browser.config.ts") {
    if (after.test.browser) after.test.browser.screenshotFailures = before.test.browser?.screenshotFailures;
  }
  const missing = before.files.filter((file) => !after.files.includes(file));
  const added = after.files.filter((file) => !before.files.includes(file));
  checks.push({ name: project.config + ":discovery", passed: missing.length === 0, beforeCount: before.files.length, afterCount: after.files.length, added, missing });
  if (missing.length) differences.push({ name: project.config + ":discovery", missing });
  delete before.files; delete after.files;
  compare(project.config, before, after);
}
for (const directory of ["reflex", "reflex-async", "reflex-devtools", "reflex-dom", "reflex-framework", "reflex-runtime", "reflex-runtime-mcp", "reflex-scheduler", "reflex-store"]) {
  const file = "packages/" + directory + "/tsconfig.json";
  const options = (root) => {
    const filename = resolve(root, file);
    const parsed = ts.readConfigFile(filename, ts.sys.readFile);
    if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
    const config = ts.parseJsonConfigFileContent(parsed.config, ts.sys, dirname(filename), undefined, filename);
    if (config.errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(config.errors, { getCanonicalFileName: (file) => file, getCurrentDirectory: () => root, getNewLine: () => "\n" }));
    return normalize({ options: config.options, files: config.fileNames.sort() }, root);
  };
  compare(file, options(baseRoot), options(headRoot));
}
const evidence = { schemaVersion: 1, equivalent: differences.length === 0, baseRoot, headRoot, checks, differences,
  allowedDifferences: registry.allowedDiscoveryDifferences, generatedAt: new Date().toISOString() };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
console.log("Config equivalence: " + checks.filter((check) => check.passed).length + "/" + checks.length + " checks; " + output);
if (differences.length) { console.error(JSON.stringify(differences, null, 2)); process.exitCode = 1; }
