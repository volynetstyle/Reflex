// Optional engine-level evidence for the annotated push and pull sites.
// A missing separate optimized function means this probe has no evidence: it
// does not prove that V8 failed to optimize an inlined copy.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return args[index + 1];
}

const node = option("--node", process.execPath);
const cache = path.join(root, ".cache", "jit-contracts");
const temporary = path.join(cache, "tmp");
const bundleDir = path.join(cache, "shape-bundle");
const output = path.resolve(
  root,
  option("--out", ".cache/jit-contracts/v8-shape.json"),
);
mkdirSync(temporary, { recursive: true });
mkdirSync(path.dirname(output), { recursive: true });
const env = {
  ...process.env,
  TEMP: temporary,
  TMP: temporary,
  TMPDIR: temporary,
};

execFileSync(
  node,
  [
    "scripts/build-baseline-oracle.mjs",
    "--source",
    "--production",
    "--readable",
    "--out",
    bundleDir,
  ],
  { cwd: root, env, stdio: "inherit" },
);
execFileSync(
  node,
  [
    "perf/v8-shape/analyze.mjs",
    "--node",
    node,
    "--bundle",
    path.join(bundleDir, "runtime.mjs"),
    "--workloads",
    "^B\\.chain\\.depth-100$|^B\\.fanout\\.width-100$",
    "--out",
    output,
  ],
  { cwd: root, env, stdio: "inherit" },
);

const report = JSON.parse(readFileSync(output, "utf8"));
const expected = {
  "B.chain.depth-100": ["pushIteratorCore", "pull_iterator"],
  "B.fanout.width-100": ["pushIteratorCore"],
};
for (const [workload, functions] of Object.entries(expected)) {
  const result = report.workloads[workload];
  if (!result) throw new Error(`Missing workload: ${workload}`);
  for (const name of functions) {
    const shape = result.functions[name];
    if (!shape)
      throw new Error(
        `No separate optimized ${name} observed in ${workload}; it may have been inlined.`,
      );
    console.log(
      `${workload}: ${name}, ${shape.instructions} instructions, ${shape.smiChecks} Smi and ${shape.overflowChecks} overflow checks`,
    );
  }
  console.log(`${workload}: ${result.deopts.length} observed deoptimizations`);
  for (const deopt of result.deopts)
    console.log(`  ${deopt.fn}: ${deopt.reason}`);
}
console.log(`Engine: ${report.node}; report: ${output}`);
