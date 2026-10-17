import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

import { runChurn, type ChurnResult, type ChurnVariant } from "./churn";
import { runDag, type DagResult, type DagVariant } from "./dag";
import { envInt } from "./harness";
import {
  runReactivation,
  type ReactivationResult,
  type ReactivationVariant,
  type WriteMix,
} from "./reactivation";

/**
 * Long-lived lifetime experiments. See README.md next to this file.
 *
 *   pnpm --filter @volynets/reflex-runtime bench:lifetime-churn
 *
 * Scale with LIFETIME_CYCLES, LIFETIME_WINDOW, LIFETIME_DAG_WATCHERS,
 * LIFETIME_ONLY=A,B,C,D. D writes reactivation.{json,md}; A-C write
 * latest.json and report.md.
 */

const OUTPUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../bench-results/lifetime-churn",
);

const only = new Set(
  (process.env.LIFETIME_ONLY ?? "A,B,C,D").split(",").map((s) => s.trim()),
);
const cycles = envInt("LIFETIME_CYCLES", 10_000);
const window = envInt("LIFETIME_WINDOW", 200);
const checkpoints = envInt("LIFETIME_CHECKPOINTS", 20);
const writes = envInt("LIFETIME_PROBE_WRITES", 32);
const dagWatchers = envInt("LIFETIME_DAG_WATCHERS", 4096);

const churnVariants: [string, ChurnVariant, number][] = [
  ["A", "managed", cycles],
  ["A", "raw-manual-dispose", cycles],
  ["B", "raw-dispose-watcher", cycles],
  // No disposal at all keeps every effect running: quadratic, so shorter.
  ["B", "raw-no-dispose", Math.max(window * 2, Math.floor(cycles / 4))],
];

const dagVariants: DagVariant[] = ["retain", "oracle-prune"];

const reactivationVariants: ReactivationVariant[] = [
  "retain",
  "suspend-conservative",
  "suspend-oracle",
  "dispose-recreate",
];
const sleepWrites = [0, 1, 10, 100, 1000];
const writeMixes: WriteMix[] = ["shared", "foreign"];

it("lifetime experiments", async () => {
  const churn: ChurnResult[] = [];
  const dag: DagResult[] = [];

  for (const [experiment, variant, variantCycles] of churnVariants) {
    if (!only.has(experiment)) continue;
    const started = Date.now();
    churn.push(
      await runChurn({
        variant,
        cycles: variantCycles,
        window,
        checkpoints,
        probeWrites: writes,
      }),
    );
    console.log(`[lifetime] ${variant}: ${Date.now() - started} ms`);
  }

  if (only.has("C")) {
    for (const variant of dagVariants) {
      const started = Date.now();
      dag.push(
        await runDag({
          variant,
          seed: 0x5eed,
          producers: 64,
          layers: 4,
          width: 512,
          fanIn: 3,
          watchers: dagWatchers,
          readsPerWatcher: 3,
          removalSteps: 32,
          probeWrites: writes,
        }),
      );
      console.log(`[lifetime] dag ${variant}: ${Date.now() - started} ms`);
    }
  }

  const reactivation: ReactivationResult[] = [];
  if (only.has("D")) {
    const started = Date.now();
    for (const mix of writeMixes) {
      for (const writesWhileAsleep of sleepWrites) {
        for (const variant of reactivationVariants) {
          const result = await runReactivation({
            variant,
            mix,
            sleepWrites: writesWhileAsleep,
            seed: 0xd0d0,
            sharedProducers: 16,
            foreignProducers: 48,
            layers: 4,
            width: 128,
            fanIn: 3,
            watchers: 512,
            readsPerWatcher: 3,
            cycles: envInt("LIFETIME_REACTIVATION_CYCLES", 3),
          });
          if (result.mismatches !== 0) {
            throw new Error(
              `D ${variant}/${mix}/W=${writesWhileAsleep}: ${result.mismatches} stale values`,
            );
          }
          if (result.activeRegionEdges.min !== result.activeRegionEdges.max) {
            throw new Error(
              `D ${variant}/${mix}/W=${writesWhileAsleep}: region edges drift ` +
                `${result.activeRegionEdges.min}..${result.activeRegionEdges.max}`,
            );
          }
          reactivation.push(result);
        }
      }
    }
    console.log(`[lifetime] reactivation: ${Date.now() - started} ms`);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const meta = {
    date: new Date().toISOString(),
    node: process.version,
    flags: "profile-test (__PROFILE__=true, __DEV__=false)",
  };
  if (reactivation.length !== 0) {
    writeFileSync(
      join(OUTPUT_DIR, "reactivation.json"),
      `${JSON.stringify({ meta, reactivation }, null, 2)}\n`,
    );
    const report = renderReactivation(meta, reactivation);
    writeFileSync(join(OUTPUT_DIR, "reactivation.md"), report);
    console.log(report);
  }
  if (churn.length === 0 && dag.length === 0) return;
  writeFileSync(
    join(OUTPUT_DIR, "latest.json"),
    `${JSON.stringify({ meta, churn, dag }, null, 2)}\n`,
  );
  const report = renderReport(meta, churn, dag);
  writeFileSync(join(OUTPUT_DIR, "report.md"), report);
  console.log(report);
});

// ------------------------------------------------------------------ report

const fmt = (value: number, digits = 1) =>
  Number.isInteger(value) ? String(value) : value.toFixed(digits);
const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KiB`;

function slope(points: [number, number][]): number {
  // Least squares over the second half: steady-state growth only.
  const tail = points.slice(Math.floor(points.length / 2));
  const n = tail.length;
  if (n < 2) return 0;
  const mx = tail.reduce((s, [x]) => s + x, 0) / n;
  const my = tail.reduce((s, [, y]) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of tail) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function renderChurn(result: ChurnResult): string {
  const { options, checkpoints: rows } = result;
  const last = rows[rows.length - 1]!;
  const first = rows.find((row) => row.cycle >= options.window) ?? rows[0]!;
  const heapSlope = slope(rows.map((r) => [r.cycle, r.heapBytes]));
  const edgeSlope = slope(rows.map((r) => [r.cycle, r.graph.edges]));
  const pushSlope = slope(
    rows.map((r) => [r.cycle, r.write.pushEdgesPerWrite]),
  );
  const lines = [
    `### ${result.experiment} · ${options.variant}`,
    "",
    `cycles=${options.cycles}, window=${options.window}. Steady-state slopes (second half): ` +
      `heap ${fmt(heapSlope, 1)} B/cycle, edges ${fmt(edgeSlope, 3)}/cycle, ` +
      `push edges/write ${fmt(pushSlope, 3)}/cycle.`,
    "",
    `From cycle ${first.cycle} (window full) to ${last.cycle}: ` +
      `edges ${first.graph.edges} → ${last.graph.edges}, ` +
      `push edges/write ${fmt(first.write.pushEdgesPerWrite)} → ${fmt(last.write.pushEdgesPerWrite)}, ` +
      `ns/write ${fmt(first.write.nsPerWrite, 0)} → ${fmt(last.write.nsPerWrite, 0)}.`,
    "",
    "| cycle | heap | retained/released | nodes (P/C/W) | edges | dead nodes | dead edges | push edges/write | dirty skips/write | pull edges/write | computes/write | watcher runs/write | ns/write | ns/cycle |",
    "|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of rows) {
    const g = row.graph;
    const w = row.write;
    lines.push(
      `| ${row.cycle} | ${kb(row.heapBytes)} | ${row.retainedObjects}/${row.releasedObjects} | ` +
        `${g.nodes} (${g.producers}/${g.consumers}/${g.watchers}) | ${g.edges} | ${g.deadNodes} | ${g.deadEdges} | ` +
        `${fmt(w.pushEdgesPerWrite)} | ${fmt(w.pushDirtySkipsPerWrite)} | ${fmt(w.pullEdgesPerWrite)} | ` +
        `${fmt(w.computeRunsPerWrite)} | ${fmt(w.watcherRunsPerWrite)} | ${fmt(w.nsPerWrite, 0)} | ${fmt(row.cycleNs, 0)} |`,
    );
  }
  return lines.join("\n");
}

function renderDag(result: DagResult): string {
  const { options, checkpoints: rows } = result;
  const lines = [
    `### C · ${options.variant}`,
    "",
    `producers=${options.producers}, layers=${options.layers}×${options.width}, fanIn=${options.fanIn}, ` +
      `watchers=${options.watchers}×${options.readsPerWatcher} reads, ${options.removalSteps} removal steps. ` +
      `Build heap ${kb(result.buildHeapBytes)}, peak ${kb(Math.max(...rows.map((r) => r.peakHeapBytes)))}.`,
    "",
    "| step | live watchers | heap (gc) | peak heap | nodes | edges | unobserved nodes | unobserved edges | pruned | push edges/write | dirty skips/write | pull edges/write | computes/write | watcher runs/write | ns/write |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of rows) {
    const g = row.graph;
    const w = row.write;
    lines.push(
      `| ${row.step} | ${row.liveWatchers} | ${kb(row.heapBytes)} | ${kb(row.peakHeapBytes)} | ${g.nodes} | ${g.edges} | ` +
        `${g.deadNodes} | ${g.deadEdges} | ${row.pruned} | ${fmt(w.pushEdgesPerWrite)} | ${fmt(w.pushDirtySkipsPerWrite)} | ` +
        `${fmt(w.pullEdgesPerWrite)} | ${fmt(w.computeRunsPerWrite)} | ${fmt(w.watcherRunsPerWrite)} | ${fmt(w.nsPerWrite, 0)} |`,
    );
  }
  return lines.join("\n");
}

function renderReactivation(
  meta: Record<string, string>,
  results: ReactivationResult[],
): string {
  const o = results[0]!.options;
  const lines = [
    "# Experiment D: deactivate → W writes → reactivate",
    "",
    `${meta.date} · node ${meta.node} · ${meta.flags}`,
    "",
    `Regions A (always observed) and B (toggled), each ${o.layers}×${o.width} computeds, fan-in ${o.fanIn}, ` +
      `${o.watchers} watchers per region. ${o.sharedProducers} shared producers feed both regions, ` +
      `${o.foreignProducers} foreign producers feed only A. Means over ${o.cycles} measured cycles; ` +
      "every reactivation is checked against a plain-JS reference (0 mismatches required).",
    "",
    "`work` = push edges + pull edges + computes + edges created + edges removed over deactivate, sleep and reactivate. " +
      "`Δ vs retain` < 0 means the variant pays off. `identity` = share of B top-layer result objects that survive a cycle.",
    "",
  ];
  for (const mix of writeMixes) {
    lines.push(
      `## Writes to ${mix} producers`,
      "",
      "| W | variant | deactivate work | sleep push edges | sleep work | reactivate computes | reactivate edges created | reactivate work | work | Δ vs retain | ns total | sleeping B edges | sleeping heap | identity |",
      "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    );
    for (const w of sleepWrites) {
      const rows = results.filter(
        (r) => r.options.mix === mix && r.options.sleepWrites === w,
      );
      const base = rows.find((r) => r.options.variant === "retain")!;
      const work = (c: ReactivationResult["sleep"]) =>
        c.pushEdges + c.pullEdges + c.computes + c.edgesCreated + c.edgesRemoved;
      for (const r of rows) {
        const delta = r.totalWork - base.totalWork;
        lines.push(
          `| ${w} | ${r.options.variant} | ${fmt(work(r.deactivate), 0)} | ${fmt(r.sleep.pushEdges, 0)} | ` +
            `${fmt(work(r.sleep), 0)} | ${fmt(r.reactivate.computes, 0)} | ${fmt(r.reactivate.edgesCreated, 0)} | ` +
            `${fmt(work(r.reactivate), 0)} | ${fmt(r.totalWork, 0)} | ${delta > 0 ? "+" : ""}${fmt(delta, 0)} ` +
            `(${fmt((100 * delta) / base.totalWork, 1)}%) | ${fmt(r.totalNs / 1e6, 2)} ms | ` +
            `${fmt(r.sleepingRegionEdges, 0)} | ${kb(r.sleepingHeapBytes)} | ${fmt(100 * r.resultIdentityKept, 0)}% |`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderReport(
  meta: Record<string, string>,
  churn: ChurnResult[],
  dag: DagResult[],
): string {
  return [
    "# Lifetime experiments",
    "",
    `${meta.date} · node ${meta.node} · ${meta.flags}`,
    "",
    "Heap is heapUsed after forced GC relative to the pre-build baseline. " +
      "`retained/released`: objects of unmounted owners still reachable after GC. " +
      "`dead` (A/B): nodes of unmounted components still linked into the graph; " +
      "`unobserved` (C): computeds no live watcher can reach. Per-write columns " +
      "are means over the probe (write + flush), counters from the __PROFILE__ build; " +
      "ns/write comes from a separate counter-free pass.",
    "",
    "## A / B: create/dispose churn",
    "",
    ...churn.map(renderChurn).flatMap((s) => [s, ""]),
    "## C: shared dependencies",
    "",
    ...dag.map(renderDag).flatMap((s) => [s, ""]),
  ].join("\n");
}
