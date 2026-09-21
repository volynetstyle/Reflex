import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [before, after, scenario] = process.argv.slice(2);
const validName = /^[a-z0-9-]+$/;
const validScenario = /^[a-z0-9-]+$/;

if (
  !before ||
  !after ||
  !scenario ||
  !validName.test(before) ||
  !validName.test(after) ||
  !validScenario.test(scenario)
) {
  throw new Error(
    "Usage: node scripts/qualify-stages.mjs <before> <after> <scenario>",
  );
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const compareScript = resolve(root, "scripts/compare-stages.mjs");
const semanticScript = resolve(root, "scripts/check-stages-semantics.mjs");
const run = (args) =>
  spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
const checkedJson = (args) => {
  const result = run(args);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Child process failed");
  }
  return JSON.parse(result.stdout.trim());
};

const semantic = run([semanticScript, "diff", before, after]);
const traces = {
  before: checkedJson([compareScript, "--trace", before, scenario]),
  after: checkedJson([compareScript, "--trace", after, scenario]),
};
const structural = {
  before: checkedJson([compareScript, "--inspect", before, scenario]),
  after: checkedJson([compareScript, "--inspect", after, scenario]),
};

const timing = run([compareScript, before, after, scenario]);
if (timing.status !== 0) {
  throw new Error(timing.stderr || timing.stdout || "Timing comparison failed");
}
const timingReport = JSON.parse(
  readFileSync(
    resolve(root, "temp/stages", `${before}-vs-${after}-${scenario}.json`),
  ),
);

const jitPattern =
  /(pull|advance|recompute|Inlining|Cannot consider|deopt|bailout|Instructions \(size|Bytecode length)/i;
const inspectJit = (variant) => {
  const result = run([
    "--no-concurrent-recompilation",
    "--trace-opt",
    "--trace-deopt",
    "--trace-turbo-inlining",
    compareScript,
    "--measure",
    variant,
    scenario,
  ]);
  const output = `${result.stdout}\n${result.stderr}`;
  return {
    status: result.status,
    lines: output
      .split(/\r?\n/)
      .filter((line) => jitPattern.test(line))
      .slice(0, 500),
  };
};

const traceEqual = isDeepStrictEqual(traces.before, traces.after);
const report = {
  schemaVersion: 1,
  node: process.version,
  before,
  after,
  scenario,
  differential: {
    status: semantic.status,
    passed: semantic.status === 0,
    stdout: semantic.stdout.trim(),
    stderr: semantic.stderr.trim(),
  },
  scenarioTrace: {
    equal: traceEqual,
    ...traces,
  },
  structural,
  timing: timingReport.scenarios[scenario],
  jit: {
    before: inspectJit(before),
    after: inspectJit(after),
  },
};

const outputPath = resolve(
  root,
  "temp/stages",
  `qualification-${before}-vs-${after}-${scenario}.json`,
);
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");

console.log(semantic.stdout.trim());
console.log(timing.stdout.trim());
console.log(`scenario trace: ${traceEqual ? "exact match" : "DIFFERENCE"}`);
console.log(`qualification report: ${outputPath}`);

if (semantic.status !== 0 || !traceEqual) process.exitCode = 1;
