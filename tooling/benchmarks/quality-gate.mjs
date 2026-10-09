import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, arch, platform, release } from "node:os";
import { readFileSync } from "node:fs";
import { options, required, numberOption, readJson, writeJson, writeImmutable, fingerprint, sha256, escapeXml } from "./io.mjs";
import { flattenRaw, sameScenarioSet } from "./schema.mjs";
import { median, medianInterval } from "./statistics.mjs";

export function evaluatePairs(baseReports, headReports, config = {}) {
  const { threshold = 0.2, anomalyThreshold = 0.5, maxRme = 0.1, maxLogRatioMad = 0.1, minSamples = 20, minReplicates = 20, pairDesign = "balanced-block", requireInference = false, confidence = 0.95 } = config;
  for (const value of [threshold, anomalyThreshold, maxRme, maxLogRatioMad]) if (!Number.isFinite(value) || value < 0) throw new Error("Invalid gate threshold");
  if (!(confidence > 0 && confidence < 1)) throw new Error("Confidence must be between zero and one");
  if (!Number.isInteger(minSamples) || minSamples < 1 || !Number.isInteger(minReplicates) || minReplicates < 8) throw new Error("Invalid sample/replicate budget");
  if (!["independent", "balanced-block"].includes(pairDesign)) throw new Error("Unknown pair design");
  if (baseReports.length !== headReports.length || baseReports.length < 2) throw new Error("At least two matched process pairs are required");
  const bases = baseReports.map((r, i) => flattenRaw(r, "base " + i)), heads = headReports.map((r, i) => flattenRaw(r, "head " + i)), ids = [...bases[0].keys()].sort();
  for (const report of [...bases, ...heads]) sameScenarioSet(ids, report.keys());
  const eligible = pairDesign === "independent" && bases.length >= minReplicates;
  const benchmarks = ids.map(id => {
    const base = bases.map(r => r.get(id)), head = heads.map(r => r.get(id));
    const logRatios = head.map((b, i) => Math.log(b.mean / base[i].mean)), logMedian = median(logRatios), ratio = Math.exp(logMedian), delta = ratio - 1;
    const mad = median(logRatios.map(n => Math.abs(n - logMedian))), observedRme = Math.max(...base.map(b => b.rme), ...head.map(b => b.rme)) / 100, samples = Math.min(...base.map(b => b.sampleCount), ...head.map(b => b.sampleCount));
    const issues = [];
    if (samples < minSamples) issues.push("Insufficient within-process samples");
    if (observedRme > maxRme) issues.push("Within-process RME exceeds budget");
    if (mad > maxLogRatioMad) issues.push("Between-pair log-ratio MAD exceeds budget");
    const measurementStatus = samples < minSamples ? "insufficient-samples" : issues.length ? "unstable" : "valid";
    const interval = eligible ? medianInterval(logRatios, { confidence, familySize: ids.length }) : null;
    const finiteInterval = interval?.lower != null && interval?.upper != null;
    let status = eligible ? "inconclusive" : "screening-ok";
    const reasons = [];
    if (measurementStatus !== "valid") status = "invalid";
    else if (delta < -anomalyThreshold) { status = "suspicious-shift"; reasons.push("Large speedup requires semantic/work validation"); }
    else if (finiteInterval) {
      if (Math.exp(interval.lower) - 1 > threshold) status = "regression";
      else if (Math.exp(interval.upper) - 1 <= threshold) status = "ok";
      else reasons.push("Confidence interval crosses regression budget");
    } else if (!eligible && delta > threshold) status = "regression";
    if (!eligible) reasons.push("Screening only: insufficient independent process pairs; no confidence claim");
    if (eligible && !finiteInterval) reasons.push("Finite simultaneous interval unavailable at this sample/family size");
    return {
      id,
      base: { medianMeanMs: median(base.map(b => b.mean)), meansMs: base.map(b => b.mean) },
      head: { medianMeanMs: median(head.map(b => b.mean)), meansMs: head.map(b => b.mean) },
      comparison: { ratio, delta, medianLogRatio: logMedian, logRatioMad: mad, pairedRatios: logRatios.map(Math.exp), interval: interval ? { ...interval, lowerDelta: interval.lower == null ? null : Math.exp(interval.lower) - 1, upperDelta: interval.upper == null ? null : Math.exp(interval.upper) - 1 } : null },
      measurement: { status: measurementStatus, replicates: base.length, maxRme: observedRme, minSamples: samples, issues },
      performance: { status, reasons }
    };
  });
  const counts = { benchmarks: benchmarks.length, regressions: benchmarks.filter(b => b.performance.status === "regression").length, suspicious: benchmarks.filter(b => b.performance.status === "suspicious-shift").length, invalidMeasurements: benchmarks.filter(b => b.measurement.status !== "valid").length, inconclusive: benchmarks.filter(b => b.performance.status === "inconclusive").length };
  const passed = counts.regressions === 0 && counts.suspicious === 0 && counts.invalidMeasurements === 0 && (requireInference ? eligible && counts.inconclusive === 0 : true);
  return { benchmarks, counts, passed, qualification: eligible ? "independent-pair-inference" : "screening-only", inferenceRequired: requireInference, inferenceAvailable: eligible, statisticalMethod: eligible ? "exact-binomial-median-order-statistics-bonferroni" : "none-descriptive-paired-median", thresholds: { regression: threshold, suspiciousShift: anomalyThreshold, maxRme, maxLogRatioMad, minSamples, minReplicates, confidence } };
}
function chart(summary) {
  const rows = summary.benchmarks.map((b, i) => '<text x="16" y="' + (70 + 24 * i) + '" font-size="12">' + escapeXml(b.id + ": " + (b.comparison.delta * 100).toFixed(1) + "%; " + b.performance.status) + "</text>").join("");
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="' + (100 + summary.benchmarks.length * 24) + '"><rect width="100%" height="100%" fill="white"/><text x="16" y="28">' + escapeXml(summary.suite + " — " + summary.qualification) + "</text>" + rows + "</svg>";
}
export function main(argv = process.argv.slice(2)) {
  const opts = options(argv, ["--suite", "--base-commit", "--head-commit", "--head-timestamp", "--workflow-run-id", "--scope", "--protocol-hash", "--vitest-version", "--pnpm-version", "--base-files", "--head-files", "--json", "--markdown", "--chart", "--threshold", "--anomaly-threshold", "--max-rme", "--max-log-ratio-mad", "--min-samples", "--min-replicates", "--pair-design", "--confidence", "--anchor-commit", "--migration-manifest"], ["--require-inference"]);
  const provider = required(opts, "vitest-version");
  if (!/^vitest\/4\./.test(provider)) throw new Error("This adapter requires Vitest 4.x");
  const basePaths = required(opts, "base-files").split(","), headPaths = required(opts, "head-files").split(",");
  const result = evaluatePairs(basePaths.map(readJson), headPaths.map(readJson), {
    threshold: numberOption(opts, "threshold", .2), anomalyThreshold: numberOption(opts, "anomaly-threshold", .5),
    maxRme: numberOption(opts, "max-rme", .1), maxLogRatioMad: numberOption(opts, "max-log-ratio-mad", .1),
    minSamples: numberOption(opts, "min-samples", 20, 1), minReplicates: numberOption(opts, "min-replicates", 20, 8),
    confidence: numberOption(opts, "confidence", .95), pairDesign: opts["pair-design"] ?? "balanced-block", requireInference: opts["require-inference"] ?? false
  });
  const baseCommit = required(opts, "base-commit"), anchor = opts["anchor-commit"] ?? null;
  if (anchor && anchor !== baseCommit) throw new Error("Fixed anchor must equal the measured base commit");
  const migration = opts["migration-manifest"] ? readJson(opts["migration-manifest"]) : null;
  if (migration && (migration.schemaVersion !== 1 || migration.protocolHash !== opts["protocol-hash"] || typeof migration.cohortMigrationHash !== "string")) throw new Error("Incompatible protocol migration evidence");
  const environment = { node: process.version, v8: process.versions.v8, pnpm: required(opts, "pnpm-version"), vitest: provider, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? "unknown", cpuCount: cpus().length, runnerImage: process.env.ImageOS ?? "unknown", runnerImageVersion: process.env.ImageVersion ?? "unknown" };
  const summary = {
    baselineMigration: migration?.baselineMigration ?? false, cohortMigrationHash: migration?.baselineMigration ? migration.cohortMigrationHash : null,
    schemaVersion: 4, benchmarkProvider: "vitest", rawSchemaVersion: 4, vitestVersion: provider,
    suite: required(opts, "suite"), scope: required(opts, "scope"), protocolHash: required(opts, "protocol-hash"),
    workflowRunId: required(opts, "workflow-run-id"), workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "local",
    measuredAt: new Date().toISOString(), commitTimestamp: required(opts, "head-timestamp"),
    commits: { base: baseCommit, head: required(opts, "head-commit") }, anchorCommit: anchor,
    environment, environmentFingerprint: fingerprint(environment),
    protocol: { pairDesign: opts["pair-design"] ?? "balanced-block", order: opts["pair-design"] === "independent" ? "caller-declared-balanced-AB-BA" : "B1 H1 H2 B2", replicates: basePaths.length, sampleUnit: "process-pair", sampleBudget: "fixed-before-run" },
    rawArtifacts: [...basePaths, ...headPaths].map(path => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha256(bytes) }; }), ...result
  };
  const lines = ["# Benchmark quality gate: " + summary.suite, "", "**" + (summary.passed ? "PASS" : "FAIL") + "** — " + summary.qualification, "", "Base " + summary.commits.base + " → head " + summary.commits.head, "", "Method: " + summary.statisticalMethod + ". Within-process sample counts do not count as independent process replications.", "", "| Benchmark | Measurement | Performance | Delta | Interval delta |", "| --- | --- | --- | ---: | --- |", ...summary.benchmarks.map(b => "| " + b.id.replaceAll("|", "\\|") + " | " + b.measurement.status + " | " + b.performance.status + " | " + (b.comparison.delta * 100).toFixed(2) + "% | " + (b.comparison.interval ? JSON.stringify([b.comparison.interval.lowerDelta, b.comparison.interval.upperDelta]) : "unavailable; descriptive only") + " |")];
  writeJson(required(opts, "json"), summary);
  writeImmutable(required(opts, "markdown"), lines.join("\n") + "\n");
  writeImmutable(required(opts, "chart"), chart(summary));
  console.log(lines.join("\n")); if (!summary.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
