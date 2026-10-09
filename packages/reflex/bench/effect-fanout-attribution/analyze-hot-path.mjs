import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const RESULTS = join(ROOT, "bench-results/reflex-competitors");
const OUTPUT = join(
  ROOT,
  "bench-results/effect-fanout-attribution/HOT_PATH.md",
);

function read(name) {
  const [headerLine, ...lines] = readFileSync(join(RESULTS, name), "utf8")
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

function ops(report, scenario, size = 1) {
  const row = report.summary.find(
    (entry) =>
      entry.framework === "reflex" &&
      entry.scenario === scenario &&
      entry.size === size,
  );
  if (!row) throw new Error(`Missing ${scenario}/${size}`);
  return row.medianOpsPerSecond;
}

function ratio(after, before) {
  return `${(after / before).toFixed(3)}x`;
}

const baseline = read("hot-path-watcher-baseline.csv");
const fused = read("hot-path-watcher-specialized.csv");
const cleanup = read("hot-path-watcher-cleanup-bit.csv");
const fusedRepeat = read("hot-path-watcher-fused-repeat.csv");
const cleanupRepeat = read("hot-path-watcher-cleanup-bit-repeat.csv");
const computedControl = read("hot-path-computed-cleanup-bit-control.csv");
const computedObjectIs = read("hot-path-computed-object-is.csv");

const lines = [
  "# Computed and watcher hot-path experiment",
  "",
  "> All rows are production builds. Each point is the median of seven fresh",
  "> processes with 150 ms minimum warmup and 500 ms minimum measurement.",
  "> Runs are sequential rather than same-process paired measurements, so the",
  "> repeated A/B bracket is the primary evidence and small deltas are treated",
  "> as noise.",
  "",
  "## Watcher specialization",
  "",
  "The retained specialization has two parts:",
  "",
  "1. fuse tracking epoch/context enter and restore into the existing tracking",
  "   helpers and avoid an unconditional `payload = undefined` store;",
  "2. represent cleanup ownership with `WatcherCleanupPending`, so the common",
  "   no-cleanup watcher does not load `payload` and run `typeof` before every",
  "   callback. Cleanup lifecycle becomes a pay-for-play branch.",
  "",
  "| watchers | initial fused/base | cleanup B1 / fused A1 | cleanup B2 / fused A2 |",
  "| ---: | ---: | ---: | ---: |",
];

for (const width of [8, 16, 32, 64]) {
  lines.push(
    `| ${width} | ${ratio(ops(fused, "effect-fanout", width), ops(baseline, "effect-fanout", width))} | ${ratio(ops(cleanup, "effect-fanout", width), ops(fused, "effect-fanout", width))} | ${ratio(ops(cleanupRepeat, "effect-fanout", width), ops(fusedRepeat, "effect-fanout", width))} |`,
  );
}

lines.push(
  "",
  "The cleanup ownership bit is positive in both A/B brackets at every width.",
  "The repeated bracket shows +4.7%, +10.8%, +4.7%, and +1.7% for widths",
  "8/16/32/64. The fused-context-only result is retained for its strictly smaller",
  "production path, but its standalone wall-clock delta is not claimed because",
  "the computed control showed comparable run-to-run drift.",
  "",
  "## Computed experiment",
  "",
  "The candidate replaced the imported comparator alias in `advance()` with a",
  "direct `Object.is` call. It was rejected and reverted:",
  "",
  "| scenario | direct Object.is / existing comparator | decision |",
  "| --- | ---: | --- |",
  `| equal-result | ${ratio(ops(computedObjectIs, "equal-result"), ops(computedControl, "equal-result"))} | reject |`,
  `| changed-result | ${ratio(ops(computedObjectIs, "changed-result"), ops(computedControl, "changed-result"))} | reject |`,
  "",
  "The existing comparator was 1.9% faster on equal-result and 3.2% faster on",
  "changed-result in the nearest sequential control. No computed specialization",
  "is retained: the true equal-result workload is already near Alien parity, and",
  "the attempted change did not clear the noise threshold.",
  "",
);

writeFileSync(OUTPUT, `${lines.join("\n").trimEnd()}\n`);
console.log(`Wrote ${OUTPUT}`);
