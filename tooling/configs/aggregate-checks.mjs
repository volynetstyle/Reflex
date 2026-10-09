import { createHash } from "node:crypto";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { argument, artifactPath, checksFor, repoRoot, selectedPackages, validateRegistry } from "./quality-registry.mjs";

const args = process.argv.slice(2);
const phase = argument(args, "--phase", "pr");
await validateRegistry();
const directory = artifactPath(argument(args, "--input-dir", "artifacts/checks"));
const failures = [];
const needsFile = argument(args, "--needs-json");
const needs = needsFile ? JSON.parse(await readFile(resolve(repoRoot, needsFile), "utf8")) : null;
const planned = needs?.registry?.outputs?.matrix ? JSON.parse(needs.registry.outputs.matrix).include : null;
async function filesAt(path) {
  const result = [];
  try {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) result.push(...await filesAt(file));
      else if (entry.name.endsWith(".json")) result.push(file);
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return result;
}
const reports = [];
for (const file of await filesAt(directory)) {
  const report = JSON.parse(await readFile(file, "utf8"));
  if (report.schemaVersion === 1 && Array.isArray(report.requiredChecks)) reports.push({ ...report, file });
}
for (const entry of selectedPackages(phase)) {
  const matches = reports.filter((report) => report.id === entry.id);
  if (matches.length !== 1) { failures.push(entry.id + ": expected exactly one report, found " + matches.length); continue; }
  const report = matches[0];
  if (planned) {
    const input = planned.find(item => item.id === entry.id);
    if (!input?.fingerprint || report.inputFingerprint !== input.fingerprint) failures.push(entry.id + ": evidence input fingerprint differs from current plan");
  }
  if (report.package !== entry.name || report.phase !== phase || report.status !== "passed" || !report.completedAt) failures.push(entry.id + ": invalid or incomplete package verdict");
  const expected = checksFor(entry, phase).map((check) => check.id);
  if (JSON.stringify(report.requiredChecks) !== JSON.stringify(expected)) failures.push(entry.id + ": required check registry differs");
  if (report.checks.length !== expected.length || new Set(report.checks.map((check) => check.id)).size !== expected.length) failures.push(entry.id + ": incomplete or duplicate checks");
  for (const id of expected) {
    const check = report.checks.find((check) => check.id === id);
    if (!check || check.status !== "passed" || check.exitCode !== 0 || !(check.durationMs >= 0) || !check.logSha256) { failures.push(entry.id + ": " + id + " did not pass"); continue; }
    // Artifact layouts can add a download directory. Match the report's own log folder.
    const logFile = resolve(dirname(report.file), entry.id, id.replace(/[^a-zA-Z0-9._-]/g, "_") + ".log");
    try {
      const hash = createHash("sha256").update(await readFile(logFile)).digest("hex");
      if (hash !== check.logSha256) failures.push(entry.id + ": log hash differs for " + id);
    } catch { failures.push(entry.id + ": missing log for " + id); }
  }
}
if (needsFile) {
  for (const [name, result] of Object.entries(needs)) if (result.result !== "success") failures.push("Required job " + name + ": " + result.result);
}
const summary = { schemaVersion: 1, phase, status: failures.length ? "failed" : "passed", expectedPackages: selectedPackages(phase).map((entry) => entry.id), failures, generatedAt: new Date().toISOString() };
const output = artifactPath(argument(args, "--output", "artifacts/quality-summary.json"));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
