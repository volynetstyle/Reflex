import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COUNTERS, FRAMEWORKS, FRAMEWORK_LABELS } from "./frameworks.mjs";
import { DAG, WORKLOADS, paramLabel } from "./workloads.mjs";

// Liveness comparison: Reflex (persistent bidirectional graph) vs Angular and
// Preact (live/non-live subscriptions + global version polling) under an
// identical lifetime contract.
//
//   node bench/liveness/run.mjs [--trials 5] [--skip-structural]
//
// Timing: production builds, one fresh process per (framework, workload,
// param, trial), framework order rotated per trial. Structural: one
// deterministic vitest pass (structural.test.mjs).

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "../..");
const OUTPUT_DIR = join(here, "../../../../bench-results/liveness");

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const trials = Number(option("trials", 5));
const skipStructural = argv.includes("--skip-structural");

mkdirSync(OUTPUT_DIR, { recursive: true });

if (!skipStructural) {
  const vitest = spawnSync(
    process.execPath,
    [
      join(packageRoot, "../../node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      join(here, "vitest.structural.config.ts"),
    ],
    { cwd: packageRoot, stdio: "inherit" },
  );
  if (vitest.status !== 0) throw new Error("structural pass failed");
}
const structural = JSON.parse(
  readFileSync(join(OUTPUT_DIR, "structural.json"), "utf8"),
);

// ------------------------------------------------------------------ timing

const samples = [];
const combos = [];
for (const [workload, spec] of Object.entries(WORKLOADS)) {
  spec.params.forEach((_, paramIndex) => combos.push({ workload, paramIndex }));
}

for (let trial = 0; trial < trials; trial++) {
  for (const [comboIndex, combo] of combos.entries()) {
    const shift = (trial + comboIndex) % FRAMEWORKS.length;
    const order = [...FRAMEWORKS.slice(shift), ...FRAMEWORKS.slice(0, shift)];
    for (const framework of order) {
      const child = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          join(here, "worker.mjs"),
          framework,
          combo.workload,
          String(combo.paramIndex),
          "1",
        ],
        { cwd: packageRoot, encoding: "utf8" },
      );
      if (child.status !== 0) {
        throw new Error(
          `${framework} ${combo.workload}#${combo.paramIndex}: ${child.stderr}`,
        );
      }
      const sample = JSON.parse(child.stdout.trim().split("\n").pop());
      if (sample.mismatches !== 0) {
        throw new Error(
          `${framework} ${combo.workload}#${combo.paramIndex}: ${sample.mismatches} wrong values`,
        );
      }
      samples.push({ ...sample, trial });
    }
  }
  console.log(`[liveness] trial ${trial + 1}/${trials} done`);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const timing = [];
for (const combo of combos) {
  for (const framework of FRAMEWORKS) {
    const rows = samples.filter(
      (s) =>
        s.framework === framework &&
        s.workload === combo.workload &&
        s.paramIndex === combo.paramIndex,
    );
    timing.push({
      framework,
      workload: combo.workload,
      paramIndex: combo.paramIndex,
      param: paramLabel(WORKLOADS[combo.workload].params[combo.paramIndex]),
      phases: rows[0].phases.map((phase, index) => {
        const values = rows.map((r) => r.phases[index].nsPerOp);
        return {
          name: phase.name,
          ops: phase.ops,
          nsPerOpMedian: median(values),
          nsPerOpMin: Math.min(...values),
          nsPerOpMax: Math.max(...values),
        };
      }),
      retainedHeapMedian: median(rows.map((r) => r.retainedHeap)),
    });
  }
}

const meta = {
  date: new Date().toISOString(),
  node: process.version,
  trials,
  frameworks: FRAMEWORK_LABELS,
  dag: DAG,
};
writeFileSync(
  join(OUTPUT_DIR, "timing.json"),
  `${JSON.stringify({ meta, timing, samples }, null, 2)}\n`,
);
const report = render(meta, timing, structural);
writeFileSync(join(OUTPUT_DIR, "report.md"), report);
console.log(report);

// ------------------------------------------------------------------ report

function fmt(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} ms`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} µs`;
  return `${value.toFixed(0)} ns`;
}

function render(meta, timing, structural) {
  const lines = [
    "# Liveness comparison: Reflex vs Angular vs Preact",
    "",
    `${meta.date} · node ${meta.node} · ${meta.trials} fresh-process trials per cell (median, [min–max]).`,
    "",
    Object.values(meta.frameworks).map((label) => `- ${label}`).join("\n"),
    "",
    `DAG: ${meta.dag.producers} producers, ${meta.dag.layers}×${meta.dag.width} computeds (fan-in ${meta.dag.fanIn}), ` +
      `${meta.dag.watchers} watchers × ${meta.dag.readsPerWatcher} top-layer reads, ${meta.dag.unrelated} unrelated signals. ` +
      "Same lifetime contract everywhere: computed handles live for the whole run, effects are disposed explicitly. " +
      "Every run is checked against a plain-JS reference; observed sums must match across frameworks.",
    "",
    "Structural counters, per operation: `alloc` dependency links allocated; `sub`/`unsub` insertions/removals in subscriber lists " +
      "(for Reflex every edge is a subscriber-list member); `poll` dependency links inspected for freshness " +
      "(Reflex: pull/frontier edges); `notify` subscriber links visited by propagation; `computes`/`effects` user callbacks.",
    "",
  ];
  for (const [workload, spec] of Object.entries(WORKLOADS)) {
    lines.push(`## ${workload}`, "");
    lines.push(
      "| param | phase | framework | time/op | alloc | sub | unsub | poll | notify | computes | effects |",
      "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    );
    spec.params.forEach((_, paramIndex) => {
      const phaseNames = timing.find(
        (t) => t.workload === workload && t.paramIndex === paramIndex,
      ).phases;
      phaseNames.forEach((phaseInfo, phaseIndex) => {
        for (const framework of FRAMEWORKS) {
          const t = timing.find(
            (row) =>
              row.workload === workload &&
              row.paramIndex === paramIndex &&
              row.framework === framework,
          );
          const s = structural.find(
            (row) =>
              row.workload === workload &&
              row.paramIndex === paramIndex &&
              row.framework === framework,
          );
          const phase = t.phases[phaseIndex];
          const sp = s.phases[phaseIndex];
          const per = (value) => {
            const v = value / sp.ops;
            return Number.isInteger(v) ? String(v) : v.toFixed(1);
          };
          lines.push(
            `| ${t.param} | ${phase.name} | ${framework} | ${fmt(phase.nsPerOpMedian)} [${fmt(phase.nsPerOpMin)}–${fmt(phase.nsPerOpMax)}] | ` +
              `${COUNTERS.map((name) => per(sp.counters[name])).join(" | ")} | ${per(sp.computes)} | ${per(sp.effectRuns)} |`,
          );
        }
      });
    });
    lines.push("");
  }
  return lines.join("\n");
}
