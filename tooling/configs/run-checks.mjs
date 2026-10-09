import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { argument, artifactPath, checksFor, repoRoot, selectedPackages, validateRegistry } from "./quality-registry.mjs";

const args = process.argv.slice(2);
const phase = argument(args, "--phase", "pr");
await validateRegistry();
const entries = selectedPackages(phase);
if (args.includes("--list")) {
  console.log(JSON.stringify({ include: entries.map(({ id, name, requiresBrowser }) => ({ id, package: name, browser: Boolean(requiresBrowser) })) }));
} else {
  const name = argument(args, "--package");
  if (!name) {
    const output = artifactPath(argument(args, "--output-dir", "artifacts/checks"));
    await mkdir(output, { recursive: true });
    const jobs = {};
    for (const selected of entries) {
      const result = await new Promise((done) => {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--package", selected.id, "--phase", phase, "--output-dir", output], { cwd: repoRoot, env: process.env, windowsHide: true, stdio: "inherit" });
        child.once("error", () => done(1)); child.once("close", (code) => done(code));
      });
      jobs[selected.id] = { result: result === 0 ? "success" : "failure" };
    }
    const needs = join(output, "invocation-results.json");
    await writeFile(needs, JSON.stringify(jobs, null, 2) + "\n");
    const result = await new Promise((done) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL("./aggregate-checks.mjs", import.meta.url)), "--phase", phase, "--input-dir", output, "--output", join(output, "summary.json"), "--needs-json", needs], { cwd: repoRoot, env: process.env, windowsHide: true, stdio: "inherit" });
      child.once("error", () => done(1)); child.once("close", (code) => done(code));
    });
    if (result !== 0) process.exitCode = 1;
  } else {
  const entry = entries.find((candidate) => candidate.name === name || candidate.id === name);
  if (!entry) throw new Error("Unknown or unselected quality package: " + name);
  const cli = process.env.REFLEX_PNPM_CLI ?? process.env.npm_execpath;
  if (!cli || !/\.(?:cjs|mjs|js)$/.test(cli)) throw new Error("Run through pnpm quality:check or set REFLEX_PNPM_CLI to the pinned pnpm CLI file.");
  const output = artifactPath(argument(args, "--output-dir", "artifacts/checks"));
  if (await stat(join(output, entry.id + ".json")).then(() => true, (error) => { if (error.code === "ENOENT") return false; throw error; })) throw new Error("Evidence already exists; choose a fresh --output-dir to preserve every attempt.");
  await mkdir(join(output, entry.id), { recursive: true });
  const report = { schemaVersion: 1, package: entry.name, id: entry.id, phase, node: process.version, inputFingerprint: process.env.QUALITY_FINGERPRINT,
    startedAt: new Date().toISOString(), requiredChecks: checksFor(entry, phase).map((check) => check.id), checks: [] };
  for (const check of checksFor(entry, phase)) {
    const filename = check.id.replace(/[^a-zA-Z0-9._-]/g, "_") + ".log";
    const logPath = join(output, entry.id, filename);
    const log = createWriteStream(logPath);
    const startedAt = new Date().toISOString();
    const started = performance.now();
    console.log(entry.id + ": " + check.id);
    const outcome = await new Promise((done) => {
      const child = spawn(process.execPath, [cli, ...check.args], { cwd: repoRoot, env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, check.timeoutMs ?? 1_200_000);
      child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
      child.once("error", (error) => { log.write(String(error) + "\n"); clearTimeout(timer); done({ status: "failed", exitCode: null, error: String(error) }); });
      child.once("close", (exitCode, signal) => { clearTimeout(timer); done({ status: timedOut ? "timed_out" : exitCode === 0 ? "passed" : "failed", exitCode, signal }); });
    });
    await new Promise((done) => log.end(done));
    const bytes = await readFile(logPath);
    report.checks.push({ id: check.id, command: ["pnpm", ...check.args], startedAt, durationMs: Math.round(performance.now() - started),
      ...outcome, logPath: relative(repoRoot, logPath).replaceAll("\\", "/"), logSha256: createHash("sha256").update(bytes).digest("hex") });
    await writeFile(join(output, entry.id + ".json"), JSON.stringify(report, null, 2) + "\n");
    if (outcome.status !== "passed") console.error(bytes.toString("utf8").slice(-6000));
  }
  report.completedAt = new Date().toISOString();
  report.status = report.checks.every((check) => check.status === "passed") ? "passed" : "failed";
  await writeFile(join(output, entry.id + ".json"), JSON.stringify(report, null, 2) + "\n");
  if (report.status !== "passed") process.exitCode = 1;
  }
}
