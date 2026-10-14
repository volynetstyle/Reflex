// Turns a bench/compare.mjs report into a GitHub job summary and annotations.
//
//   node bench/ci-report.mjs <report.json> --title <text> [--mode compare|calibrate]
//
// Hosted runners are a screening tier (docs/performance/BENCHMARK_PROTOCOL.md,
// "CI tiers"): verdicts are reported, never enforced. In compare mode a
// `slower`, `invalid` or `error` verdict becomes a warning and `faster` a
// notice. In calibrate mode (A/A, identical sources) any `faster`, `slower`
// or `invalid` verdict flags the method itself on this runner.
//
// Exits 1 only when the report is missing or unreadable.
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const file = args[0];
const title = option("--title", "Runtime benchmarks");
const mode = option("--mode", "compare");

const out = (text) => {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${text}\n`);
  else process.stdout.write(`${text}\n`);
};
// Workflow commands go to stdout, the summary to its file.
const annotate = (level, message) =>
  process.stdout.write(`::${level} title=${title}::${message}\n`);

if (file === undefined || !existsSync(file)) {
  out(`### ${title}\n\nNo report was produced; see the job log.`);
  annotate("error", "the benchmark harness produced no report");
  process.exit(1);
}

const report = JSON.parse(readFileSync(file, "utf8"));
const pct = (v) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);
const { baseline, candidate } = report.sides;
const identical = baseline.bundleSha256 === candidate.bundleSha256;

const lines = [
  `### ${title}`,
  "",
  `Mode \`${mode}\`: baseline \`${String(baseline.commit).slice(0, 12)}\`, candidate \`${String(candidate.commit).slice(0, 12)}\`` +
    (identical ? " (byte-identical bundles: an A/A run)" : ""),
  `${report.environment.cpu} ×${report.environment.cpuCount}, Node ${report.environment.node}, ${report.config.replicates} replicates, family ${report.config.family}, threshold ±${pct(report.config.threshold)}`,
  "",
  "Hosted runners are a screening tier: verdicts are reported, not enforced.",
  "",
  "| workload | baseline ns/op | Δ median | 95% interval | control Δ | verdict |",
  "| --- | ---: | ---: | --- | ---: | --- |",
];

const counts = {};
for (const r of report.results) {
  counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  if (r.candidate === undefined) {
    lines.push(`| ${r.id} | | | | | ${r.verdict} (${r.reason}) |`);
  } else {
    lines.push(
      `| ${r.id} | ${r.baselineNsPerOp.toFixed(2)} | ${pct(r.candidate.medianDelta)} | [${pct(r.candidate.lower)}, ${pct(r.candidate.upper)}] | ${pct(r.control.medianDelta)} | ${r.verdict} |`,
    );
  }

  const delta =
    r.candidate === undefined
      ? r.reason
      : `${pct(r.candidate.medianDelta)} [${pct(r.candidate.lower)}, ${pct(r.candidate.upper)}]`;
  if (mode === "calibrate" || identical) {
    if (["faster", "slower", "invalid", "error"].includes(r.verdict))
      annotate(
        "warning",
        `A/A ${r.id}: ${r.verdict} (${delta}); the method cannot resolve this workload on this runner`,
      );
  } else if (["slower", "invalid", "error"].includes(r.verdict)) {
    annotate("warning", `${r.id}: ${r.verdict} (${delta})`);
  } else if (r.verdict === "faster") {
    annotate("notice", `${r.id}: faster (${delta})`);
  }
}
for (const m of report.memory ?? []) {
  lines.push(
    `| ${m.id} (bytes/cycle) | ${m.baselineBytesPerStep.toFixed(1)} | ${m.candidateBytesPerStep.toFixed(1)} | | | memory |`,
  );
}
for (const [id, message] of Object.entries(report.errors ?? {})) {
  if (!report.results.some((r) => r.id === id))
    annotate("warning", `${id}: ${String(message).split("\n")[0]}`);
}

lines.push(
  "",
  Object.entries(counts)
    .map(([verdict, n]) => `${verdict}: ${n}`)
    .join(", "),
);
out(lines.join("\n"));
