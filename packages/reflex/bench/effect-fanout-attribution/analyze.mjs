import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ATTRIBUTION = join(ROOT, "bench-results/effect-fanout-attribution");
const COMPETITORS = join(ROOT, "bench-results/reflex-competitors");

const structuralBefore = readJson(
  join(ATTRIBUTION, "structural.baseline.json"),
);
const structuralAfter = readJson(join(ATTRIBUTION, "structural.json"));
const timing = readJson(join(ATTRIBUTION, "timing.json"));
const externalBefore = readCsv(join(COMPETITORS, "fanout-crossover.csv"));
const externalAfter = readCsv(
  join(COMPETITORS, "effect-fanout-scheduled-ownership.csv"),
);
const bodyCost = readCsv(join(COMPETITORS, "effect-fanout-body-cost.csv"));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readCsv(path) {
  const [headerLine, ...lines] = readFileSync(path, "utf8")
    .trim()
    .split(/\r?\n/);
  const headers = headerLine.split(",");
  const summary = lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(
      headers.map((header, index) => {
        const value = values[index] ?? "";
        const numeric = Number(value);
        return [
          header,
          value !== "" && Number.isFinite(numeric) ? numeric : value,
        ];
      }),
    );
  });
  return { summary };
}

function fixed(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function structuralRow(records, width) {
  const row = records.find(
    (record) => record.width === width && record.prewarmQueueCapacity === 0,
  );
  if (!row) throw new Error(`Missing structural width ${width}`);
  const runtime = row.runtime;
  const scheduler = row.scheduler;
  const perOp = (value) => value / row.iterations;
  return {
    attempts: perOp(runtime.watcherScheduleAttempts),
    successes: perOp(runtime.watcherScheduleSuccesses),
    dedup: perOp(runtime.watcherScheduleDedupSkipped),
    deliverySkip: perOp(runtime.pushOnceScheduledWatcherDeliverySkipped ?? 0),
    enqueues: perOp(scheduler.queueEnqueues),
    dequeues: perOp(scheduler.queueDequeues),
    grows: perOp(scheduler.queueGrows),
    passes: perOp(scheduler.flushPasses),
    executions: perOp(runtime.watcherExecutions),
    frontier: perOp(runtime.watcherFrontierEdgesVisited),
  };
}

function summaryRow(report, scenario, size, framework) {
  const row = report.summary.find(
    (entry) =>
      entry.scenario === scenario &&
      entry.size === size &&
      entry.framework === framework,
  );
  if (!row) {
    throw new Error(`Missing ${scenario}/${size}/${framework}`);
  }
  return row;
}

function timingRow(family, width, predicate = () => true) {
  const row = timing.find(
    (entry) =>
      entry.family === family && entry.width === width && predicate(entry),
  );
  if (!row) throw new Error(`Missing timing ${family}/${width}`);
  return row;
}

const widths = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
const structuralWidths = [8, 16, 32, 64, 256];
const pipelineWidths = [8, 16, 32, 64];
const pipelineLegs = [
  "claim-release",
  "queue-roundtrip",
  "empty-wrapper",
  "direct-source",
  "scheduler-bypass",
  "shared-derived",
];
const bodySizes = [1, 4, 16, 64, 256, 1024];

const pipelineSchedulerBounds = pipelineWidths.map((width) => {
  const shared = timingRow(
    "pipeline",
    width,
    (entry) => entry.leg === "shared-derived",
  ).nsPerCallbackMedian;
  const bypass = timingRow(
    "pipeline",
    width,
    (entry) => entry.leg === "scheduler-bypass",
  ).nsPerCallbackMedian;
  return shared - bypass;
});
const topologyRatios = pipelineWidths.map((width) => {
  const fanout = timingRow(
    "execution-topology",
    width,
    (entry) => entry.topology === "fanout",
  ).nsPerCallbackMedian;
  const serial = timingRow(
    "execution-topology",
    width,
    (entry) => entry.topology === "serial",
  ).nsPerCallbackMedian;
  return serial / fanout;
});
const sharedCallback = timingRow(
  "callback-shape",
  32,
  (entry) => entry.callbackMode === "shared",
).nsPerCallbackMedian;
const closureCallback = timingRow(
  "callback-shape",
  32,
  (entry) => entry.callbackMode === "closures",
).nsPerCallbackMedian;
const callbackShapeDifference =
  (Math.abs(sharedCallback - closureCallback) /
    Math.min(sharedCallback, closureCallback)) *
  100;

const lines = [
  "# Effect fan-out attribution",
  "",
  "> Scope: Reflex watcher fan-out through one shared derived value. Structural",
  "> counters and wall-clock timings are separate experiments. Event counts are",
  "> exact work attribution; they are not converted into invented percentages of",
  "> CPU time. The internal timing probes use the Vite source build and must not",
  "> be compared numerically with the production-build competitor results.",
  "",
  "## Result",
  "",
  "The medium-width gap is not caused by queue growth, extra flush passes, or",
  "super-linear watcher work. The only structurally redundant term found was a",
  "second delivery attempt to watchers that already owned a scheduler slot:",
  "",
  "```text",
  "before: schedule attempts = 2N - 1; successful = N; dedup = N - 1",
  "after:  schedule attempts = N;     successful = N; dedup = 0",
  "        owned-delivery skips = N - 1",
  "```",
  "",
  "The specialization preserves `Changed` evidence but skips the invalidation",
  "hook when `Scheduled` already proves that the scheduler owns delivery. Queue",
  "entries, watcher executions, frontier checks, and observable callbacks remain",
  "exactly N per operation.",
  "",
  "## Structural proof",
  "",
  "| N | attempts before | dedup before | attempts after | owned skips after | enqueue/dequeue after | executions/frontier after | flush passes | queue grows |",
  "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
];

for (const width of structuralWidths) {
  const before = structuralRow(structuralBefore, width);
  const after = structuralRow(structuralAfter, width);
  lines.push(
    `| ${width} | ${before.attempts} | ${before.dedup} | ${after.attempts} | ${after.deliverySkip} | ${after.enqueues}/${after.dequeues} | ${after.executions}/${after.frontier} | ${after.passes} | ${after.grows} |`,
  );
}

lines.push(
  "",
  "This rules out the ring-buffer capacity hypothesis for steady state: the queue",
  "retains its backing storage after warm-up, and measured operations record zero",
  "growths. Prewarming the queue to 1024 changes internal timings in both",
  "directions, with no regime transition. Production `RuntimePhase` wrappers are",
  "also not on this path; they are development-only.",
  "",
  "## Production-build crossover after specialization",
  "",
  "Each framework/scenario/size/trial ran in a fresh Node process. The ratio is",
  "the median paired Alien/Reflex throughput ratio. Positive excess means Reflex",
  "spent more nanoseconds per operation; dividing by N exposes the remaining",
  "per-watcher term.",
  "",
  "| watchers | Alien / Reflex | Reflex ns/op | Alien ns/op | Reflex excess ns/watcher |",
  "| ---: | ---: | ---: | ---: | ---: |",
);

for (const width of widths) {
  const reflex = summaryRow(externalAfter, "effect-fanout", width, "reflex");
  const alien = summaryRow(externalAfter, "effect-fanout", width, "alien");
  const excess =
    (reflex.medianNsPerOperation - alien.medianNsPerOperation) / width;
  lines.push(
    `| ${width} | ${fixed(alien.throughputVsReflex, 3)}x | ${fixed(reflex.medianNsPerOperation)} | ${fixed(alien.medianNsPerOperation)} | ${fixed(excess)} |`,
  );
}

lines.push(
  "",
  "At 8-64 watchers the remaining gap is approximately 5-8 ns per watcher. It",
  "does not grow with N and is near zero by 512-1024. This is a relative-cost",
  "hump from a small per-watcher tax, not evidence of a worse fan-out coefficient.",
  "The before/after production runs were separate, so their wall-clock deltas are",
  "not claimed as a paired speedup; the exact win is the removed structural work.",
  "",
  "## Body-cost amortization",
  "",
  "The benchmark holds fan-out at 32 and increases callback work. The gap falls",
  "from roughly 18-22% for tiny bodies to 0-5% for meaningful bodies. The",
  "body=16 point is a non-monotonic JIT threshold and should not be read as an",
  "algorithmic transition.",
  "",
  "| synthetic body iterations | Alien / Reflex |",
  "| ---: | ---: |",
);

for (const size of bodySizes) {
  const alien = summaryRow(bodyCost, "effect-fanout-body", size, "alien");
  lines.push(`| ${size} | ${fixed(alien.throughputVsReflex, 3)}x |`);
}

lines.push(
  "",
  "## Internal pipeline probes",
  "",
  "These numbers are source-build diagnostic timings in ns per watcher. They are",
  "useful only as cumulative attribution inside this run. `scheduler-bypass` runs",
  "the known watcher array directly and deliberately lacks queue ownership, dedup,",
  "failure, and reentrancy guarantees; it is a lower-bound diagnostic, never a",
  "competitor result.",
  "",
  `| N | ${pipelineLegs.join(" | ")} |`,
  `| ---: | ${pipelineLegs.map(() => "---:").join(" | ")} |`,
);

for (const width of pipelineWidths) {
  const values = pipelineLegs.map((leg) =>
    fixed(
      timingRow("pipeline", width, (entry) => entry.leg === leg)
        .nsPerCallbackMedian,
      1,
    ),
  );
  lines.push(`| ${width} | ${values.join(" | ")} |`);
}

lines.push(
  "",
  "The full shared-derived path exceeds direct execution without scheduler",
  `semantics by about ${fixed(Math.min(...pipelineSchedulerBounds), 0)}-${fixed(Math.max(...pipelineSchedulerBounds), 0)} source-build ns per watcher across N=8-64. That`,
  "difference bounds the scheduling protocol cost, but does not prove it is all",
  "removable: the bypass omits guarantees that Reflex intentionally provides.",
  `One watcher flushed N times costs about ${fixed(Math.min(...topologyRatios), 1)}-${fixed(Math.max(...topologyRatios), 1)}x more per callback than N`,
  "watchers in one flush, so batching amortizes rather than creates the hump.",
  `Shared versus distinct callback identities differ by about ${fixed(callbackShapeDifference, 1)}%, which rejects`,
  "callback polymorphism as the primary explanation in this workload.",
  "",
  "## Interpretation and next target",
  "",
  "Proven and implemented:",
  "",
  "- `Scheduled` is a scheduler-ownership certificate for an already queued",
  "  watcher. Re-delivering the same invalidation hook cannot add observable work.",
  "- The specialization removes N-1 scheduler claims/dedup checks while retaining",
  "  the state transition and all side fan-out.",
  "- Validation-error recovery preserves `Scheduled`: queue ownership survives a",
  "  failed reentrant validation and the retry is deferred to the next drain.",
  "- `WatcherCleanupPending` makes cleanup lifecycle pay-for-play: the normal",
  "  watcher avoids a payload load, `typeof`, and redundant undefined store.",
  "- Targeted reentrant and side-invalidation tests pass, as do the complete",
  "  runtime and scheduler suites.",
  "",
  "Not proven removable:",
  "",
  "- the one required claim/release, enqueue/dequeue, frontier validation, tracking",
  "  context enter/restore, cleanup check, and callback wrapper per watcher;",
  "- bookkeeping required by Reflex's stronger reentrant scheduling semantics.",
  "",
  "The no-cleanup specialization is now implemented. Any next watcher change",
  "must isolate the remaining tracking/frontier/reentrancy term with an adversarial",
  "differential suite rather than removing the scheduler or frontier wholesale.",
  "Queue redesign, bitmap queues, and V3 frontier certificates are not justified",
  "by these measurements.",
  "",
  "## Reproduction",
  "",
  "```sh",
  "pnpm --filter @volynets/reflex bench:effect-fanout",
  "pnpm --filter @volynets/reflex bench:effect-fanout:analyze",
  "```",
  "",
  "External artifacts used by this report:",
  "",
  "- `bench-results/reflex-competitors/fanout-crossover.csv` (pre-specialization)",
  "- `bench-results/reflex-competitors/effect-fanout-scheduled-ownership.csv`",
  "- `bench-results/reflex-competitors/effect-fanout-body-cost.csv`",
  "",
);

// Keep the baseline dependency explicit: the report deliberately refuses to
// render if the original crossover artifact no longer contains the scenario.
summaryRow(externalBefore, "effect-fanout", 8, "reflex");

writeFileSync(
  join(ATTRIBUTION, "REPORT.md"),
  `${lines.join("\n").trimEnd()}\n`,
);
console.log(`Wrote ${join(ATTRIBUTION, "REPORT.md")}`);
