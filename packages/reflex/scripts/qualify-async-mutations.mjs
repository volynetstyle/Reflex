import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { asyncMutations } from "./async-mutations.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const vitest = fileURLToPath(new URL("../../../node_modules/vitest/vitest.mjs", import.meta.url));
const outputDir = resolve(packageRoot, ".cache/async-mutations");
mkdirSync(outputDir, { recursive: true });

function run(id, tests, testName) {
  const outputFile = resolve(outputDir, `${id}.json`);
  // A child that fails before reporting must not reuse a previous run's result.
  writeFileSync(outputFile, "");
  const args = [vitest, "run", "--config", "vite.async-mutation.config.ts", ...tests,
    "--reporter=json", `--outputFile=${outputFile}`];
  if (testName) args.push("--testNamePattern", testName);
  const child = spawnSync(process.execPath, args, {
    cwd: packageRoot,
    env: { ...process.env, REFLEX_ASYNC_MUTANT: id },
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  let report;
  try { report = JSON.parse(readFileSync(outputFile, "utf8")); } catch { /* report infra failure below */ }
  const failures = report?.testResults.flatMap((suite) => suite.assertionResults
    .filter((assertion) => assertion.status === "failed")) ?? [];
  const message = failures[0]?.failureMessages.join("\n") ?? "";
  const applied = `${child.stdout}${child.stderr}`.includes(`ASYNC_MUTATION_APPLIED:${id}`);
  const infrastructureFailure = child.error !== undefined || report === undefined ||
    (id !== "control" && !applied) || message.includes("ASYNC_MUTATION_ANCHOR_ERROR") ||
    (child.status !== 0 && failures.length === 0);
  const status = infrastructureFailure ? "invalid" : id === "control" ?
    (child.status === 0 && report.numFailedTests === 0 ? "passed" : "failed") :
    (child.status !== 0 && failures.length > 0 ? "killed" : "survived");
  const replay = message.match(/\{ seed: (-?\d+), path: "([^"]+)"/);
  const result = {
    id, status, applied, exitCode: child.status,
    totalTests: report?.numTotalTests,
    failedTests: report?.numFailedTests,
    witness: failures[0]?.fullName,
    counterexample: message.match(/Counterexample: ([^\n]+)/)?.[1] ?? null,
    replay: replay === null ? null : { seed: Number(replay[1]), path: replay[2] },
    reason: status === "invalid" ? `${child.error ?? ""}\n${child.stdout}\n${child.stderr}` : undefined,
  };
  console.log(`${id}: ${status}${result.witness ? ` (${result.witness})` : ""}`);
  if (result.counterexample) console.log(`  counterexample: ${result.counterexample}`);
  return result;
}

const control = run("control", ["tests/reflex.async.property.test.ts", "tests/reflex.async.qualification.test.ts"]);
if (control.status !== "passed") throw new Error("Async mutation control must pass before qualifying mutants.");
const results = asyncMutations.map((mutation) => run(mutation.id, mutation.tests, mutation.testName));
const hash = (path) => createHash("sha256").update(readFileSync(resolve(packageRoot, path))).digest("hex");
const summary = {
  control,
  inputs: {
    "src/unstable/async.ts": hash("src/unstable/async.ts"),
    ...Object.fromEntries(["source", "attempt", "frontier", "evaluation", "errors", "types", "wait", "failure"].map(name => { const path = `src/unstable/async/${name}.ts`; return [path, hash(path)]; })),
    "tests/async.contract-harness.ts": hash("tests/async.contract-harness.ts"),
    "tests/reflex.async.property.test.ts": hash("tests/reflex.async.property.test.ts"),
    "tests/reflex.async.qualification.test.ts": hash("tests/reflex.async.qualification.test.ts"),
    "scripts/async-mutations.mjs": hash("scripts/async-mutations.mjs"),
    "scripts/qualify-async-mutations.mjs": hash("scripts/qualify-async-mutations.mjs"),
    "vite.async-mutation.config.ts": hash("vite.async-mutation.config.ts"),
  },
  results,
};
writeFileSync(resolve(outputDir, "report.json"), `${JSON.stringify(summary, null, 2)}\n`);
if (results.some((result) => result.status !== "killed")) process.exitCode = 1;
