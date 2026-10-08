import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { packageRegistry, readPackage, repoRoot } from "../build/package-registry.mjs";

export { repoRoot };
export const qualityRegistry = JSON.parse(await readFile(new URL("./quality-checks.json", import.meta.url), "utf8"));
export function selectedPackages(phase = "pr") {
  if (!["pr", "deep", "release"].includes(phase)) throw new Error("Unknown quality phase: " + phase);
  return qualityRegistry.packages.filter((entry) => phase !== "pr" || entry.phase === "pr");
}
export function checksFor(entry, phase = "pr") {
  const checks = entry.buildDependencies ? [{ id: "build", args: ["--filter", entry.name + "...", "build"] }] : [];
  for (const check of entry.checks) checks.push({ ...check, args: check.args ?? ["--filter", entry.name, "run", check.script] });
  if (phase !== "pr") {
    for (const check of qualityRegistry.deepChecks.filter((check) => check.package === entry.id)) {
      checks.push({ ...check, args: ["--filter", entry.name, "run", check.script] });
    }
  }
  return checks;
}
export async function validateRegistry() {
  if (qualityRegistry.schemaVersion !== 1) throw new Error("Unsupported quality registry schema");
  const names = new Set(), ids = new Set();
  for (const entry of qualityRegistry.packages) {
    if (names.has(entry.name) || ids.has(entry.id) || !/^[a-z0-9-]+$/.test(entry.id)) throw new Error("Duplicate or unsafe quality entry: " + entry.id);
    names.add(entry.name); ids.add(entry.id);
    const registered = packageRegistry.find((candidate) => candidate.name === entry.name);
    if (!registered) throw new Error("Quality package is not in the maintained registry: " + entry.name);
    const manifest = await readPackage(registered);
    for (const check of checksFor(entry, "release")) {
      if (check.script && !manifest.scripts?.[check.script]) throw new Error("Missing required script " + entry.name + ":" + check.script);
      if (!Array.isArray(check.args) || check.args.length === 0 || check.args.some((arg) => typeof arg !== "string")) throw new Error("Invalid command: " + check.id);
    }
    const checkIds = checksFor(entry, "release").map((check) => check.id);
    if (new Set(checkIds).size !== checkIds.length) throw new Error("Duplicate quality check IDs: " + entry.id);
  }
  for (const entry of packageRegistry) {
    if (!names.has(entry.name)) throw new Error("Maintained package has no quality coverage: " + entry.name);
  }
  return qualityRegistry;
}
export function argument(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Missing value for " + name);
  return args[index + 1];
}
export function artifactPath(directory) { return resolve(repoRoot, directory); }
