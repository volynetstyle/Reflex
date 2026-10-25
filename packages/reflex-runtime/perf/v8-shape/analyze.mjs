// Machine-code shape of a runtime bundle under the benchmark workloads.
//
//   node perf/v8-shape/analyze.mjs --bundle <runtime.mjs> [--node <node>]
//        [--workloads <regex>] [--out <file.json>] [--compare <other.json>]
//        [--ladder <regex> [--fanouts 3,128]]
//
// `--ladder` analyzes the rungs of scripts/tracking-ladder.mjs instead of the
// benchmark workloads, each in perf/tracking-ladder/time.mjs's measuring
// process.
//
// For every timed workload of bench/workloads.mjs, runs bench/worker.mjs in
// `time` mode under --print-opt-code --trace-deopt and records, per optimized
// (TurboFan) function: instruction count, code size, module cell loads
// (constants and function aliases), call-target checks, representation
// checks (Smi / overflow / map), and deoptimizations that actually happened.
//
// Use the Node.js version of the benchmark runner (the V8 version decides
// inlining and code shape). The tool measures shape, not time: a change is
// accepted only together with the paired timing comparison (bench/compare.mjs).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { workloads } from "../../bench/workloads.mjs";
import { ladderCases } from "../../../../scripts/tracking-ladder.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const bundle = path.resolve(option("--bundle"));
const node = option("--node", process.execPath);
const pattern = new RegExp(option("--workloads", ".*"));
const out = option("--out");
const compareTo = option("--compare");
const packageRoot = path.resolve(import.meta.dirname, "../..");

const ladder = option("--ladder");
const timed = ladder
  ? ladderCases({
      rungs: new RegExp(ladder),
      fanouts: option("--fanouts", "3,128").split(",").map(Number),
    })
  : workloads.filter((w) => w.level !== "E" && pattern.test(w.id));

/** Parses --print-opt-code / --trace-deopt output into per-function records. */
function parse(text) {
  const functions = new Map();
  let current = null;
  let pendingKind = "";
  let inCode = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("kind = ")) {
      pendingKind = line.slice(7).trim();
      continue;
    }
    if (line.startsWith("name = ")) {
      current = { name: line.slice(7).trim() || "<anonymous>", kind: pendingKind };
      inCode = false;
      continue;
    }
    if (current === null) continue;
    if (line.startsWith("Instructions (size = ")) {
      current.size = Number(line.match(/size = (\d+)/)[1]);
      current.instructions = 0;
      current.cellConstants = 0;
      current.cellFunctions = 0;
      current.contextLoads = 0;
      current.callTargetChecks = 0;
      current.smiChecks = 0;
      current.overflowChecks = 0;
      current.mapChecks = 0;
      current.truthinessChecks = 0;
      inCode = true;
      continue;
    }
    if (!inCode) continue;
    if (line.trim() === "") {
      if (current.kind === "TURBOFAN_JS" || current.kind === "TURBOFAN") {
        const known = functions.get(current.name);
        // Keep the largest optimized version seen for a name.
        if (!known || known.size < current.size)
          functions.set(current.name, current);
      }
      inCode = false;
      current = null;
      continue;
    }
    if (/^[0-9A-Fa-f]{8,}\s+[0-9a-f]+\s+[0-9a-f]+\s+/.test(line))
      current.instructions++;
    if (/<Cell value=\s*(0x[0-9a-f]+\s*)?<JSFunction/.test(line))
      current.cellFunctions++;
    else if (/<Cell value=/.test(line)) current.cellConstants++;
    if (/<(ModuleContext|FunctionContext|ScriptContext)\[/.test(line))
      current.contextLoads++;
    if (/deopt reason 'wrong call target'/.test(line)) current.callTargetChecks++;
    if (/deopt reason '(not a Smi|Smi)'/.test(line)) current.smiChecks++;
    if (/deopt reason 'overflow'/.test(line)) current.overflowChecks++;
    if (/deopt reason 'wrong map'/.test(line)) current.mapChecks++;
    // Generic ToBoolean of a value of unknown type compares it with each
    // falsy root; the empty-string compare marks one such sequence.
    if (/\(root \(empty_string\)\)/.test(line)) current.truthinessChecks++;
  }
  const deopts = [];
  for (const match of text.matchAll(
    /bailout \(kind: ([^,]+), reason: ([^)]+)\): begin\. deoptimizing [^<]*<JSFunction ([^ >(]*)/g,
  ))
    deopts.push({ fn: match[3] || "<anonymous>", kind: match[1], reason: match[2] });
  return { functions, deopts };
}

function analyze(workload) {
  const result = spawnSync(
    node,
    [
      "--expose-gc",
      "--predictable",
      "--print-opt-code",
      "--code-comments",
      "--trace-deopt",
      ...(ladder
        ? [
            path.join(packageRoot, "perf/tracking-ladder/time.mjs"),
            "--measure",
            bundle,
            JSON.stringify({ ...workload, warmupMs: 150, batchMs: 30 }),
          ]
        : [path.join(packageRoot, "bench/worker.mjs"), bundle, workload.id, "time"]),
    ],
    { encoding: "utf8", maxBuffer: 1 << 30 },
  );
  if (result.status !== 0)
    throw new Error(`${workload.id}: ${result.stderr || result.stdout}`);
  return parse(result.stdout + result.stderr);
}

const report = { bundle, node: spawnSync(node, ["--version"], { encoding: "utf8" }).stdout.trim(), workloads: {} };
for (const workload of timed) {
  const { functions, deopts } = analyze(workload);
  report.workloads[workload.id] = {
    functions: Object.fromEntries(
      [...functions].map(([name, f]) => [
        name,
        {
          instructions: f.instructions,
          size: f.size,
          cellConstants: f.cellConstants,
          cellFunctions: f.cellFunctions,
          contextLoads: f.contextLoads,
          callTargetChecks: f.callTargetChecks,
          smiChecks: f.smiChecks,
          overflowChecks: f.overflowChecks,
          mapChecks: f.mapChecks,
          truthinessChecks: f.truthinessChecks,
        },
      ]),
    ),
    deopts,
  };
  process.stderr.write(`  ${workload.id}\n`);
}
if (out) writeFileSync(out, JSON.stringify(report, null, 2));

// Totals per workload: what the optimized code of that workload contains.
const total = (w) => {
  const sum = { instructions: 0, cellConstants: 0, cellFunctions: 0, contextLoads: 0, callTargetChecks: 0, smiChecks: 0, overflowChecks: 0, mapChecks: 0, truthinessChecks: 0, deopts: w.deopts.length };
  for (const f of Object.values(w.functions))
    for (const key of Object.keys(sum)) if (key !== "deopts") sum[key] += f[key];
  return sum;
};
const other = compareTo ? JSON.parse(readFileSync(compareTo, "utf8")) : null;
const keys = ["instructions", "cellConstants", "cellFunctions", "contextLoads", "callTargetChecks", "smiChecks", "overflowChecks", "mapChecks", "truthinessChecks", "deopts"];
console.log(["workload", ...keys].join("\t"));
for (const [id, w] of Object.entries(report.workloads)) {
  const t = total(w);
  const o = other?.workloads[id] ? total(other.workloads[id]) : null;
  console.log([id, ...keys.map((k) => (o ? `${o[k]}->${t[k]}` : String(t[k])))].join("\t"));
}
