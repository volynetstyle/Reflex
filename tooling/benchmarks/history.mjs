import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { options, required, readJson, writeJson, writeImmutable, fingerprint, escapeXml } from "./io.mjs";
import { assertGateSummary } from "./schema.mjs";

export function buildHistory(summaries, { suite, scope, mode = "edge-delta", anchorCommit = null } = {}) {
  if (!["edge-delta", "fixed-anchor"].includes(mode)) throw new Error("Unknown history mode");
  if (mode === "fixed-anchor" && !anchorCommit) throw new Error("Fixed-anchor history needs --anchor-commit");
  const cohorts = new Map(), seen = new Set(), excluded = [];
  for (const original of summaries) {
    const s = assertGateSummary(original);
    if (s.suite !== suite || s.scope !== scope) continue;
    if (mode === "fixed-anchor" && (s.commits.base !== anchorCommit || s.anchorCommit !== anchorCommit)) { excluded.push({ commits: s.commits, reason: "not a direct measurement against the declared anchor" }); continue; }
    const evidenceHash = fingerprint(s);
    if (seen.has(evidenceHash)) continue; seen.add(evidenceHash);
    const environmentHash = s.environmentFingerprint ?? fingerprint(s.environment), scenarioSetHash = fingerprint(s.benchmarks.map(b => b.id).sort());
    const key = fingerprint({ suite, scope, protocolHash: s.protocolHash, environmentHash, scenarioSetHash, anchorCommit: mode === "fixed-anchor" ? anchorCommit : null, method: s.statisticalMethod ?? "legacy-descriptive", cohortMigrationHash: s.cohortMigrationHash ?? null, metric: "paired-head-base-ratio" });
    if (!cohorts.has(key)) cohorts.set(key, { id: key, protocolHash: s.protocolHash, environmentFingerprint: environmentHash, scenarioSetHash, anchorCommit: mode === "fixed-anchor" ? anchorCommit : null, points: [] });
    cohorts.get(key).points.push({
      runId: s.workflowRunId + ":" + (s.workflowRunAttempt ?? "legacy") + ":" + s.measuredAt,
      evidenceHash, headCommit: s.commits.head, baseCommit: s.commits.base,
      measuredAt: s.measuredAt, qualification: s.qualification ?? "legacy-screening",
      values: Object.fromEntries(s.benchmarks.filter(b => b.measurement.status === "valid").map(b => [b.id, b.comparison.ratio])),
      intervals: Object.fromEntries(s.benchmarks.map(b => [b.id, b.comparison.interval ?? null])),
      excludedMeasurements: s.benchmarks.filter(b => b.measurement.status !== "valid").map(b => ({ id: b.id, reason: b.measurement.status }))
    });
  }
  for (const cohort of cohorts.values()) cohort.points.sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt) || a.runId.localeCompare(b.runId));
  return { schemaVersion: 3, suite, scope, mode, anchorCommit: mode === "fixed-anchor" ? anchorCommit : null, metric: mode === "fixed-anchor" ? "direct head/fixed-anchor ratio" : "local head/measured-base ratio; not cumulative performance", policy: { cohorts: "protocol + environment + scenario set + method + anchor", attempts: "all distinct evidence retained", aggregation: "none; never median ratios with different baselines", legacy: "schema 3 retained in separate descriptive cohorts" }, cohorts: [...cohorts.values()], excluded };
}
function findSummaries(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const path = join(root, e.name);
    if (e.isDirectory()) files.push(...findSummaries(path));
    else if (e.name === "summary.json") files.push(path);
  }
  return files;
}
function chart(history, timeZone) {
  const count = history.cohorts.reduce((n, c) => n + c.points.length + 2, 0);
  let y = 65;
  const rows = history.cohorts.map(c => {
    const title = '<text x="16" y="' + y + '" font-size="13">' + escapeXml("Cohort " + c.id.slice(0, 12) + " · protocol " + c.protocolHash.slice(0, 12)) + "</text>"; y += 24;
    const points = c.points.map(p => {
      const label = new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(p.measuredAt)) + " · " + p.headCommit.slice(0, 8) + "/" + p.baseCommit.slice(0, 8) + " · " + Object.values(p.values).length + " valid scenarios · " + p.qualification;
      const row = '<text x="32" y="' + y + '" font-size="12">' + escapeXml(label) + "</text>"; y += 24; return row;
    }).join(""); y += 24; return title + points;
  }).join("");
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="' + (110 + count * 24) + '"><rect width="100%" height="100%" fill="white"/><text x="16" y="28">' + escapeXml(history.suite + " — " + history.metric) + "</text>" + rows + "</svg>";
}
export function main(argv = process.argv.slice(2)) {
  const opts = options(argv, ["--suite", "--scope", "--current", "--history-dir", "--json", "--chart", "--timezone", "--mode", "--anchor-commit"]);
  const current = assertGateSummary(readJson(required(opts, "current")));
  const inputs = [...findSummaries(required(opts, "history-dir")).map(readJson), current];
  const result = buildHistory(inputs, { suite: required(opts, "suite"), scope: required(opts, "scope"), mode: opts.mode ?? "edge-delta", anchorCommit: opts["anchor-commit"] ?? null });
  result.timeZone = opts.timezone ?? "UTC"; result.generatedAt = new Date().toISOString();
  writeJson(required(opts, "json"), result); writeImmutable(required(opts, "chart"), chart(result, result.timeZone));
  console.log(result.cohorts.length + " compatible cohorts; " + result.cohorts.reduce((n, c) => n + c.points.length, 0) + " immutable attempts. " + result.metric);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
