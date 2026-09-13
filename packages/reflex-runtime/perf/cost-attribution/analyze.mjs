// Reads bench-results/cost-attribution/{structural,timing}/*.json, joins them
// by config key, and reports:
//   1. structural-work scaling: how each counter bucket's event count per
//      iteration grows across an axis's grid, and which bucket has the most
//      events at each grid point (event-count dominance, NOT cost dominance);
//   2. wall-clock ns/op across the same grid, measured completely separately
//      (non-profile build);
//   3. regime notes: where the event-count-dominant bucket changes, and
//      whether the wall-clock curve shows a corroborating inflection nearby.
//
// This script deliberately does not compute "% of runtime" per bucket. Doing
// so would require an independently validated per-event cost model, which
// this pass does not have. Structural counts and timing are reported as two
// separate measurements; the reader is left to see whether they move
// together, not told a fabricated cost split.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const STRUCTURAL_DIR = join(ROOT, "bench-results/cost-attribution/structural");
const TIMING_DIR = join(ROOT, "bench-results/cost-attribution/timing");
const REPORT_PATH = join(ROOT, "bench-results/cost-attribution/REPORT.md");

const BUCKETS = {
  write: ["writeCalls"],
  push: [
    "pushDirectEdgesVisited",
    "pushTransitiveEdgesVisited",
    "pushOnceEdgesVisited",
  ],
  pull: ["pullEdgesVisited", "pullDescents", "pullStableSiblingScans"],
  trackingFast: [
    "trackingCursorHit",
    "trackingNextHit",
    "trackingAppendAfterCursor",
    "trackingPrefixDuplicate",
    "trackingOneHopReorder",
    "trackingTwoHopReorder",
    "trackingLastEdgeShortcut",
    "trackingInitialCreate",
    "trackingInitialFirstHit",
    "trackingInitialLastEdgeShortcut",
  ],
  trackingReconcile: [
    "trackingOutgoingProbeHit1",
    "trackingOutgoingProbeMiss",
    "trackingSuffixHeadHit",
    "trackingSuffixReuseHit",
    "trackingSuffixLinkNew",
    "trackingSuffixEdgesScanned",
    "trackingEdgeMoved",
    "trackingSuffixEagerDetach",
    "trackingSlowPath",
    "trackingSlowPathBlocked",
  ],
  advance: [
    "advanceComputeRuns",
    "advanceChanged",
    "advanceUnchanged",
    "advanceCleanupRuns",
  ],
  watcher: ["watcherExecutions", "watcherCleanups", "watcherDisposals"],
  cleanup: ["cleanupEdgesDropped"],
};

function readJsonDir(dir) {
  if (!existsSync(dir)) return new Map();
  const bySweep = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const records = JSON.parse(readFileSync(join(dir, file), "utf8"));
    bySweep.set(file.replace(/\.json$/, ""), records);
  }
  return bySweep;
}

function bucketCountsPerOp(counters, iterations) {
  const out = {};
  for (const [bucket, names] of Object.entries(BUCKETS)) {
    let sum = 0;
    for (const name of names) sum += counters[name] ?? 0;
    out[bucket] = sum / iterations;
  }
  return out;
}

function argmaxBucket(perOp, excluding = ["write"]) {
  let best = null;
  let bestValue = -Infinity;
  for (const [bucket, value] of Object.entries(perOp)) {
    if (excluding.includes(bucket)) continue;
    if (value > bestValue) {
      bestValue = value;
      best = bucket;
    }
  }
  return { bucket: best, value: bestValue };
}

function fmt(n) {
  if (n === undefined || n === null) return "-";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function joinSweep(structuralRecords, timingBySweep) {
  const timingRecords = timingBySweep ?? [];
  const timingByKey = new Map(timingRecords.map((r) => [r.key, r]));

  return structuralRecords
    .map((s) => {
      const t = timingByKey.get(s.key);
      const perOp = bucketCountsPerOp(s.counters, s.iterations);
      return {
        key: s.key,
        axisValue: s.axisValue,
        secondaryValue: s.secondaryValue,
        perOp,
        dominant: argmaxBucket(perOp),
        maxPushDepth: s.topology?.push?.maxDepth ?? 0,
        maxPullDepth: s.topology?.pull?.maxDepth ?? 0,
        nsPerOp: t?.nsPerOpMedian,
        observedRatio: s.observedRatio,
      };
    })
    .sort((a, b) => {
      if (typeof a.axisValue === "number" && typeof b.axisValue === "number") {
        return a.axisValue - b.axisValue;
      }
      return String(a.axisValue).localeCompare(String(b.axisValue));
    });
}

function renderOfatSweep(name, rows) {
  const lines = [];
  lines.push(`### ${name}`, "");
  const bucketNames = Object.keys(BUCKETS).filter((b) => b !== "write");
  lines.push(
    `| axis value | ${bucketNames.join(" | ")} | dominant | ns/op | push depth | pull depth |`,
  );
  lines.push(`| --- | ${bucketNames.map(() => "---").join(" | ")} | --- | --- | --- | --- |`);

  for (const row of rows) {
    const perOpCells = bucketNames.map((b) => fmt(row.perOp[b]));
    lines.push(
      `| ${row.axisValue} | ${perOpCells.join(" | ")} | ${row.dominant.bucket} | ${fmt(row.nsPerOp)} | ${row.maxPushDepth} | ${row.maxPullDepth} |`,
    );
  }

  lines.push("");

  // Regime boundaries: where the event-count-dominant bucket changes.
  const boundaries = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (prev.dominant.bucket !== cur.dominant.bucket) {
      const nsRatio =
        prev.nsPerOp && cur.nsPerOp ? cur.nsPerOp / prev.nsPerOp : undefined;
      boundaries.push({ prev, cur, nsRatio });
    }
  }

  if (boundaries.length === 0) {
    lines.push(
      `No event-count-dominance change across this grid — ${rows[0]?.dominant.bucket ?? "n/a"} stays dominant throughout.`,
    );
  } else {
    lines.push("Regime boundaries (event-count dominance switch):", "");
    for (const b of boundaries) {
      const corroboration =
        b.nsRatio === undefined
          ? "no timing data to corroborate"
          : b.nsRatio > 1.15
            ? `ns/op grew ${b.nsRatio.toFixed(2)}x over the same interval — corroborates a real cost shift`
            : b.nsRatio < 0.9
              ? `ns/op fell ${b.nsRatio.toFixed(2)}x over the same interval — does not corroborate a cost increase`
              : `ns/op changed only ${b.nsRatio.toFixed(2)}x — weak/no timing corroboration`;
      lines.push(
        `- between axis=${b.prev.axisValue} and axis=${b.cur.axisValue}: dominant bucket switches ${b.prev.dominant.bucket} -> ${b.cur.dominant.bucket} (${corroboration})`,
      );
    }
  }

  // Non-monotonic ns/op (a later, structurally-heavier grid point timing
  // faster than an earlier, lighter one) is a measurement-noise flag, not a
  // finding — surface it instead of letting it sit silently in the table.
  const nonMonotonic = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (prev.nsPerOp !== undefined && cur.nsPerOp !== undefined && cur.nsPerOp < prev.nsPerOp) {
      nonMonotonic.push({ prev, cur });
    }
  }
  if (nonMonotonic.length > 0) {
    lines.push("", "Timing anomalies (ns/op decreased despite an equal-or-larger axis value — treat as measurement noise, not a finding):", "");
    for (const a of nonMonotonic) {
      lines.push(
        `- axis=${a.prev.axisValue} (${fmt(a.prev.nsPerOp)} ns/op) -> axis=${a.cur.axisValue} (${fmt(a.cur.nsPerOp)} ns/op)`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

function renderInteractionSweep(name, rows) {
  const lines = [];
  lines.push(`### ${name} (interaction)`, "");

  const bySecondary = new Map();
  for (const row of rows) {
    const list = bySecondary.get(row.secondaryValue) ?? [];
    list.push(row);
    bySecondary.set(row.secondaryValue, list);
  }

  for (const [secondary, subRows] of bySecondary) {
    subRows.sort((a, b) => Number(a.axisValue) - Number(b.axisValue));
    lines.push(`secondary axis = ${secondary}`, "");
    lines.push(
      `| axis value | dominant bucket | ns/op |`,
      `| --- | --- | --- |`,
    );
    for (const row of subRows) {
      lines.push(`| ${row.axisValue} | ${row.dominant.bucket} | ${fmt(row.nsPerOp)} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// --- Stack-capacity threshold investigation ------------------------------
//
// Directly reports the new pushStackTrim*/pullStackTrim* counters (see
// src/kernel/stages/first/push_iterator.ts and .../second/pull_iterator.ts)
// against ns/op, instead of going through the generic bucket table — the
// question here is specifically "does the trim/regrow event rate explain the
// timing cliff", which the generic buckets don't surface directly.
function joinCapacitySweep(structuralRecords, timingRecords, trimEventsKey, trimExcessKey, stackSide) {
  const timingByKey = new Map((timingRecords ?? []).map((r) => [r.key, r]));

  return structuralRecords
    .map((s) => {
      const t = timingByKey.get(s.key);
      const trimEvents = s.counters[trimEventsKey] ?? 0;
      const trimExcess = s.counters[trimExcessKey] ?? 0;
      return {
        key: s.key,
        axisValue: s.axisValue,
        trimEventsPerOp: trimEvents / s.iterations,
        avgExcessPerTrim: trimEvents === 0 ? 0 : trimExcess / trimEvents,
        peakStackUsage: s.topology?.[stackSide]?.maxStack ?? 0,
        nsPerOp: t?.nsPerOpMedian,
      };
    })
    .sort((a, b) => a.axisValue - b.axisValue);
}

function renderCapacitySweep(name, rows, theoreticalThreshold) {
  const lines = [];
  lines.push(`### ${name}`, "");
  lines.push(
    "| axis value | trim events/op | avg excess/trim | peak stack usage | ns/op | ns/op vs prev |",
    "| --- | --- | --- | --- | --- | --- |",
  );

  let prevNs;
  for (const row of rows) {
    const ratio = prevNs && row.nsPerOp ? (row.nsPerOp / prevNs).toFixed(2) + "x" : "-";
    lines.push(
      `| ${row.axisValue} | ${fmt(row.trimEventsPerOp)} | ${fmt(row.avgExcessPerTrim)} | ${row.peakStackUsage} | ${fmt(row.nsPerOp)} | ${ratio} |`,
    );
    prevNs = row.nsPerOp;
  }
  lines.push("");

  // Empirical crossing: first grid point where trim events/op crosses 0.5
  // (i.e. the backing array now needs to grow-then-be-truncated on
  // essentially every call).
  const crossing = rows.find((r) => r.trimEventsPerOp >= 0.5);
  if (crossing) {
    lines.push(
      `Empirical trim-onset: axis=${crossing.axisValue} is the first grid point where trim events/op >= 0.5 ` +
        `(source-level threshold constant = ${theoreticalThreshold}).`,
    );
  } else {
    lines.push("No grid point in this sweep reached a trim events/op >= 0.5.");
  }
  lines.push("");

  return lines.join("\n");
}

function renderSemanticFixedFanoutSweep(rows) {
  const lines = [];
  lines.push("### semanticFixedFanout1024", "");
  lines.push(
    "fanout is fixed at 1024 (> 512, so every point is already past the push-side",
    "trim threshold). If pushStackTrimEvents/op is ~constant across ratio here, the",
    "capacity-trim mechanism cannot be what makes ns/op vary with ratio — any",
    "variation has a different cause.",
    "",
  );
  lines.push(
    "| ratio | push trim events/op | ns/op | ns/op vs ratio=0 |",
    "| --- | --- | --- | --- |",
  );

  const baseline = rows.find((r) => r.axisValue === 0)?.nsPerOp;
  for (const row of rows) {
    const vsBaseline = baseline && row.nsPerOp ? (row.nsPerOp / baseline).toFixed(2) + "x" : "-";
    lines.push(
      `| ${row.axisValue} | ${fmt(row.trimEventsPerOp)} | ${fmt(row.nsPerOp)} | ${vsBaseline} |`,
    );
  }
  lines.push("");

  const trimSpread =
    Math.max(...rows.map((r) => r.trimEventsPerOp)) -
    Math.min(...rows.map((r) => r.trimEventsPerOp));
  lines.push(
    trimSpread < 0.1
      ? "Trim-event rate is constant (spread < 0.1) across ratio, as expected — " +
          "confirms the capacity mechanism is ratio-invariant here."
      : `Trim-event rate is NOT constant across ratio (spread=${trimSpread.toFixed(2)}) — ` +
          "unexpected, re-check before trusting the ns/op comparison.",
  );
  lines.push("");

  return lines.join("\n");
}

function main() {
  const structuralBySweep = readJsonDir(STRUCTURAL_DIR);
  const timingBySweep = readJsonDir(TIMING_DIR);

  if (structuralBySweep.size === 0) {
    console.error(
      `No structural data found in ${STRUCTURAL_DIR}. Run the structural sweep first.`,
    );
    process.exitCode = 1;
    return;
  }

  const OFAT_SWEEPS = [
    "depth",
    "fanout",
    "fanin",
    "width",
    "churn",
    "semantic",
    "locality",
  ];
  const INTERACTION_SWEEPS = ["churnByWidth", "fanoutBySemantic"];

  const sections = [];
  sections.push(
    "# Cost-attribution report",
    "",
    "Structural counters (event counts per iteration) and wall-clock ns/op are",
    "collected in separate runs — structural under a build with __PROFILE__",
    "compiled in, timing under a build with __PROFILE__ compiled out — and",
    "joined here by config key. Bucket columns are **event counts per",
    "operation**, not cost shares: no percentage in this report claims a",
    "fraction of runtime, because no per-event cost has been independently",
    "calibrated. 'Dominant' means the bucket with the most events at that grid",
    "point. Regime boundaries are reported where the dominant bucket changes,",
    "with the wall-clock ratio across the same interval noted as",
    "corroboration (or lack of it) — not as a cost split.",
    "",
  );

  for (const sweep of OFAT_SWEEPS) {
    const structuralRecords = structuralBySweep.get(sweep);
    if (!structuralRecords) continue;
    const rows = joinSweep(structuralRecords, timingBySweep.get(sweep));
    sections.push(renderOfatSweep(sweep, rows));
  }

  for (const sweep of INTERACTION_SWEEPS) {
    const structuralRecords = structuralBySweep.get(sweep);
    if (!structuralRecords) continue;
    const rows = joinSweep(structuralRecords, timingBySweep.get(sweep));
    sections.push(renderInteractionSweep(sweep, rows));
  }

  sections.push(
    "## Stack-capacity threshold investigation",
    "",
    "pull_iterator.ts truncates its walker stack back to STACK_TRIM_MIN_CAPACITY",
    "(256) after every top-level call that exceeded it; push_iterator.ts does the",
    "same to `propagateStack` at MAX_RETAINED_PROPAGATE_STACK (512). These are two",
    "separate arrays on two separate sides of the runtime (pull vs. push), not one",
    "shared structure — this section checks empirically whether a chain-depth",
    "cliff lands at 256 and a wide-fanout cliff lands at 512, or whether \"512\"",
    "generalizes across both.",
    "",
  );

  const depthCapacityRecords = structuralBySweep.get("depthPullThreshold");
  if (depthCapacityRecords) {
    const rows = joinCapacitySweep(
      depthCapacityRecords,
      timingBySweep.get("depthPullThreshold"),
      "pullStackTrimEvents",
      "pullStackTrimExcess",
      "pull",
    );
    sections.push(renderCapacitySweep("depthPullThreshold (chain depth, pull stack)", rows, 256));
  }

  const fanoutCapacityRecords = structuralBySweep.get("fanoutPushThreshold");
  if (fanoutCapacityRecords) {
    const rows = joinCapacitySweep(
      fanoutCapacityRecords,
      timingBySweep.get("fanoutPushThreshold"),
      "pushStackTrimEvents",
      "pushStackTrimExcess",
      "push",
    );
    sections.push(renderCapacitySweep("fanoutPushThreshold (fanout, push stack)", rows, 512));
  }

  const depthFineCliffRecords = structuralBySweep.get("depthFineCliff");
  if (depthFineCliffRecords) {
    const rows = joinCapacitySweep(
      depthFineCliffRecords,
      timingBySweep.get("depthFineCliff"),
      "pullStackTrimEvents",
      "pullStackTrimExcess",
      "pull",
    );
    sections.push(
      "### depthFineCliff (every integer depth 244-262, fixed 200 iterations)",
      "",
      "Re-measures the 252->254 jump seen in depthPullThreshold with iteration",
      "count held constant, since iterationsFor() itself changes (300 -> 80) at",
      "depth=256 in that sweep — a confound in the harness, not the runtime.",
      "",
    );
    sections.push(renderCapacitySweep("depthFineCliff", rows, 256));
  }

  const semanticFixedRecords = structuralBySweep.get("semanticFixedFanout1024");
  if (semanticFixedRecords) {
    const rows = joinCapacitySweep(
      semanticFixedRecords,
      timingBySweep.get("semanticFixedFanout1024"),
      "pushStackTrimEvents",
      "pushStackTrimExcess",
      "push",
    );
    sections.push(renderSemanticFixedFanoutSweep(rows));
  }

  writeFileSync(REPORT_PATH, sections.join("\n"));
  console.log(`Wrote ${REPORT_PATH}`);
}

main();
