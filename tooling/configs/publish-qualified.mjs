import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { packagesInScope, repoRoot } from "../build/package-registry.mjs";
import { verifyArchive } from "../build/verify-artifacts.mjs";
import { argument, selectedPackages } from "./quality-registry.mjs";

const args = process.argv.slice(2);
const qualification = argument(args, "--qualification");
if (!qualification) throw new Error("--qualification PATH is required; publishing never rebuilds or repacks.");
const filename = resolve(qualification), directory = dirname(filename);
const report = JSON.parse(await readFile(filename, "utf8"));
if (report.schemaVersion !== 1 || report.kind !== "release-qualification" || report.status !== "passed" || report.consumerQualification !== "passed" || report.packOnly || !report.completedAt) throw new Error("Full successful consumer qualification is required.");
if (!Array.isArray(report.checks) || report.checks.length === 0 || report.checks.some((check) => check.status !== "passed" || check.exitCode !== 0)) throw new Error("Qualification contains incomplete or failed checks.");
const expected = packagesInScope("publish").map((entry) => entry.name).sort();
const actual = report.packages.map((entry) => entry.name).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Qualified package set differs from the declared publication registry.");
for (const check of report.checks) {
  const file = resolve(directory, check.logPath);
  const distance = relative(directory, file);
  if (!distance || distance.startsWith("..") || isAbsolute(distance)) throw new Error("Invalid qualification log path");
  if (createHash("sha256").update(await readFile(file)).digest("hex") !== check.logSha256) throw new Error("Qualification log hash differs: " + check.id);
}
const required = ["consumer.install", ...["esm", "esm-development", "cjs", "cjs-development"].map((mode) => "consumer.identity." + mode), ...["production", "development"].map((mode) => "consumer.composition." + mode), "consumer.ssr", "consumer.mixed-declarations", "consumer.mcp.graph", "consumer.mcp.bin", ...["NodeNext", "ESNext"].flatMap((mode) => ["consumer.types." + mode, "consumer.cjs-types." + mode, "consumer.standalone-types." + mode]), "consumer.browser", "consumer.active-divergences", ...report.packages.map((entry) => "pack." + entry.name.replaceAll("/", "_"))];
for (const id of required) if (report.checks.filter((check) => check.id === id).length !== 1) throw new Error("Missing or duplicate required consumer evidence: " + id);
const qualityFile = argument(args, "--quality-summary");
if (args.includes("--publish") && !qualityFile) throw new Error("--quality-summary PATH is required before publication.");
if (qualityFile) {
  const quality = JSON.parse(await readFile(resolve(qualityFile), "utf8"));
  if (quality.schemaVersion !== 1 || quality.status !== "passed" || quality.failures?.length || JSON.stringify(quality.expectedPackages) !== JSON.stringify(selectedPackages(quality.phase).map((entry) => entry.id))) throw new Error("Complete successful quality aggregation is required.");
}
const accessPolicy = JSON.parse(await readFile(resolve(repoRoot, ".changeset/config.json"), "utf8")).access;
const archives = [];
for (const entry of report.packages) {
  const file = resolve(directory, entry.archive), distance = relative(directory, file);
  if (!distance || distance.startsWith("..") || isAbsolute(distance)) throw new Error("Archive escapes the qualification directory: " + entry.name);
  const bytes = await readFile(file);
  if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Qualified archive hash differs: " + entry.name);
  const verified = await verifyArchive(file, { expectedName: entry.name });
  if (verified.manifest.version !== entry.version) throw new Error("Qualified version differs: " + entry.name);
  const access = verified.manifest.publishConfig?.access ?? accessPolicy;
  if (!["public", "restricted"].includes(access)) throw new Error("Publication access must be explicit: " + entry.name);
  archives.push({ ...entry, file, access });
}
const tag = argument(args, "--tag", "latest");
if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(tag)) throw new Error("Invalid npm dist-tag");
const result = { schemaVersion: 1, kind: "qualified-publication", qualification: filename, qualificationSha256: createHash("sha256").update(await readFile(filename)).digest("hex"), tag,
  mode: args.includes("--publish") ? "publish" : "verify", packages: archives.map(({ name, version, sha256, access }) => ({ name, version, sha256, access })), attempts: [], status: "verified" };
if (args.includes("--publish")) {
  let npmCli = argument(args, "--npm-cli", process.env.REFLEX_NPM_CLI);
  if (!npmCli) {
    for (const candidate of [resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")]) {
      if (await stat(candidate).then((value) => value.isFile(), () => false)) { npmCli = candidate; break; }
    }
  }
  if (!npmCli) throw new Error("Cannot locate npm CLI; set REFLEX_NPM_CLI.");
  const output = resolve(argument(args, "--output-dir", "artifacts/publication"), new Date().toISOString().replaceAll(":", "-") + "-" + process.pid);
  await mkdir(output, { recursive: true });
  result.status = "running";
  for (const entry of archives) {
    // Recheck immediately before the side effect to forbid artifact drift.
    if (createHash("sha256").update(await readFile(entry.file)).digest("hex") !== entry.sha256) throw new Error("Archive changed before publish: " + entry.name);
    const code = await new Promise((done) => {
      const child = spawn(process.execPath, [npmCli, "publish", entry.file, "--ignore-scripts", "--access", entry.access, "--tag", tag], { cwd: output, windowsHide: true, stdio: "inherit" });
      child.once("error", () => done(-1)); child.once("close", (code) => done(code));
    });
    result.attempts.push({ name: entry.name, sha256: entry.sha256, exitCode: code, completedAt: new Date().toISOString() });
    result.status = code === 0 ? "running" : "failed";
    await writeFile(join(output, "publication.json"), JSON.stringify(result, null, 2) + "\n");
    if (code !== 0) throw new Error("Publication failed; previous attempts remain recorded: " + entry.name);
  }
  result.status = "published";
  await writeFile(join(output, "publication.json"), JSON.stringify(result, null, 2) + "\n");
}
console.log(JSON.stringify(result, null, 2));
