import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { checksFor, repoRoot, selectedPackages } from "../quality-registry.mjs";

const child = promisify(execFile);
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "reflex-quality-contract-"));
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  for (const entry of selectedPackages("pr")) {
    await mkdir(join(directory, entry.id));
    const checks = [];
    for (const check of checksFor(entry, "pr")) {
      const text = entry.id + ":" + check.id + "\n";
      await writeFile(join(directory, entry.id, check.id.replace(/[^a-zA-Z0-9._-]/g, "_") + ".log"), text);
      checks.push({ id: check.id, status: "passed", exitCode: 0, durationMs: 1, logSha256: createHash("sha256").update(text).digest("hex") });
    }
    await writeFile(join(directory, entry.id + ".json"), JSON.stringify({ schemaVersion: 1, id: entry.id, package: entry.name, phase: "pr", status: "passed", completedAt: new Date().toISOString(), requiredChecks: checks.map((check) => check.id), checks }));
  }
  return directory;
}
const aggregate = (directory, extra = []) => child(process.execPath, [resolve(repoRoot, "tooling/configs/aggregate-checks.mjs"), "--input-dir", directory, "--output", join(directory, "summary.json"), ...extra], { cwd: repoRoot });
async function withFixture(fn) {
  const directory = await fixture();
  try { await fn(directory); } finally { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
}
async function rejection(directory, extra = []) {
  await assert.rejects(aggregate(directory, extra), (error) => error.code === 1);
  return JSON.parse(await readFile(join(directory, "summary.json"), "utf8"));
}

test("complete required evidence passes", () => withFixture(async (directory) => {
  await aggregate(directory);
  assert.equal(JSON.parse(await readFile(join(directory, "summary.json"), "utf8")).status, "passed");
}));

test("cached evidence must match the current registry input fingerprints", () => withFixture(async (directory) => {
  const include = selectedPackages("pr").map(entry => ({ id: entry.id, fingerprint: "input-" + entry.id }));
  for (const entry of include) {
    const file = join(directory, entry.id + ".json");
    const report = JSON.parse(await readFile(file, "utf8"));
    report.inputFingerprint = entry.fingerprint;
    await writeFile(file, JSON.stringify(report));
  }
  const needs = join(directory, "needs.json");
  await writeFile(needs, JSON.stringify({ registry: { result: "success", outputs: { matrix: JSON.stringify({ include }) } } }));
  await aggregate(directory, ["--needs-json", needs]);
  const file = join(directory, "runtime.json");
  const report = JSON.parse(await readFile(file, "utf8"));
  report.inputFingerprint = "stale-input";
  await writeFile(file, JSON.stringify(report));
  assert((await rejection(directory, ["--needs-json", needs])).failures.some(message => message.includes("runtime: evidence input fingerprint differs")));
}));
test("a missing package report cannot become a valid skip", () => withFixture(async (directory) => {
  await rm(join(directory, "runtime.json"));
  const summary = await rejection(directory);
  assert(summary.failures.some((message) => message.includes("runtime: expected exactly one report")));
}));
test("a missing required check cannot pass an otherwise green package", () => withFixture(async (directory) => {
  const file = join(directory, "runtime.json");
  const report = JSON.parse(await readFile(file, "utf8")); report.checks.pop();
  await writeFile(file, JSON.stringify(report));
  assert((await rejection(directory)).failures.some((message) => message.includes("incomplete or duplicate checks")));
}));
test("failure and timeout verdicts are not accepted", () => withFixture(async (directory) => {
  const file = join(directory, "runtime.json");
  const report = JSON.parse(await readFile(file, "utf8")); report.checks[0].status = "timed_out";
  await writeFile(file, JSON.stringify(report));
  assert((await rejection(directory)).failures.some((message) => message.includes("build did not pass")));
}));
test("changed logs invalidate evidence", () => withFixture(async (directory) => {
  await writeFile(join(directory, "runtime", "build.log"), "changed");
  assert((await rejection(directory)).failures.some((message) => message.includes("log hash differs")));
}));
test("a skipped required GitHub job fails even with complete package reports", () => withFixture(async (directory) => {
  const file = join(directory, "needs.json");
  await writeFile(file, JSON.stringify({ quality: { result: "skipped" } }));
  assert((await rejection(directory, ["--needs-json", file])).failures.some((message) => message.includes("Required job quality: skipped")));
}));
