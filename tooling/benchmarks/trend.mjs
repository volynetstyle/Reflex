// Anchored performance trend: history → statistical baseline → boundary → verdict.
//
//   node tooling/benchmarks/trend.mjs ingest --store DIR --summary FILE [--report FILE] [--recent-days 14] [--now ISO]
//   node tooling/benchmarks/trend.mjs judge  --store DIR --summary FILE [--report FILE]
//   node tooling/benchmarks/trend.mjs site   --store DIR --out DIR
//
// A point is one gate summary measured directly against the fixed anchor in
// tooling/benchmarks/anchor.json: the median paired process log-ratio
// log(head / anchor) per scenario. The anchor runs in the same job on the same
// machine, so points stay comparable across hosted-runner hardware. Edge
// ratios against changing bases are never used here.
//
// Two time scales: points from the last `recentDays` days stay per commit for
// causality; older days are compacted to a daily median with p25/p75.
// Re-anchoring needs no extra runs: when the new anchor is a main commit that
// already has a point against the old anchor, that point is the bridge.
import { existsSync, mkdirSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { options, required, numberOption, readJson, fingerprint } from "./io.mjs";
import { assertGateSummary } from "./schema.mjs";
import { median, quantile } from "./statistics.mjs";

export const TREND_SCHEMA = 1;
const DAY_MS = 86_400_000;
const dayOf = iso => new Date(iso).toISOString().slice(0, 10);
export const DEFAULTS = Object.freeze({ recentDays: 14, window: 20, minPoints: 5, k: 3, minBudget: 0.03 });

/** Points are comparable inside one cohort: same suite, harness, anchor and toolchain. */
export function cohortIdentity(s) {
  const nodeMajor = /^v?(\d+)/.exec(s.environment.node ?? "")?.[1] ?? "unknown";
  return { suite: s.suite, protocolHash: s.protocolHash, anchorCommit: s.anchorCommit, node: nodeMajor, vitest: s.vitestVersion ?? s.environment.vitest ?? null };
}
export const cohortId = identity => fingerprint(identity).slice(0, 16);

export function pointFromSummary(original) {
  const s = assertGateSummary(original);
  if (!s.anchorCommit || s.anchorCommit !== s.commits.base) throw new Error("Trend points must be measured directly against their fixed anchor");
  const scenarios = {};
  for (const b of s.benchmarks) {
    const interval = b.comparison.interval;
    scenarios[b.id] = {
      logRatio: b.comparison.medianLogRatio ?? Math.log(b.comparison.ratio),
      mad: b.comparison.logRatioMad ?? null,
      lower: interval?.lower ?? null, upper: interval?.upper ?? null,
      valid: b.measurement.status === "valid",
    };
  }
  return { sha: s.commits.head, measuredAt: new Date(s.measuredAt).toISOString(), commitTimestamp: s.commitTimestamp ?? null, runId: s.workflowRunId + ":" + (s.workflowRunAttempt ?? "legacy"), qualification: s.qualification ?? "legacy-screening", scenarios };
}

export const emptyStore = () => ({ schemaVersion: TREND_SCHEMA, cohorts: new Map() });

export function loadStore(dir) {
  const store = emptyStore();
  const cohorts = join(dir, "cohorts");
  if (!existsSync(cohorts)) return store;
  for (const file of readdirSync(cohorts).filter(name => name.endsWith(".json")).sort()) {
    const cohort = readJson(join(cohorts, file));
    if (cohort.schemaVersion !== TREND_SCHEMA) throw new Error("Unsupported trend cohort schema in " + file);
    store.cohorts.set(cohort.id, cohort);
  }
  return store;
}

export function saveStore(dir, store) {
  mkdirSync(join(dir, "cohorts"), { recursive: true });
  const index = { schemaVersion: TREND_SCHEMA, cohorts: [] };
  for (const cohort of [...store.cohorts.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    writeFileSync(join(dir, "cohorts", cohort.id + ".json"), JSON.stringify(cohort, null, 1) + "\n");
    index.cohorts.push({ id: cohort.id, identity: cohort.identity, createdAt: cohort.createdAt, bridge: cohort.bridge, recent: cohort.recent.length, days: cohort.daily.length });
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 1) + "\n");
}

/** The newest valid observation per commit, newest first. */
function recentValues(cohort, id) {
  const seen = new Set(), values = [];
  for (let i = cohort.recent.length - 1; i >= 0; --i) {
    const point = cohort.recent[i], scenario = point.scenarios[id];
    if (!scenario?.valid || seen.has(point.sha)) continue;
    seen.add(point.sha); values.push({ sha: point.sha, value: scenario.logRatio });
  }
  return values;
}

/** Robust center and spread from recent commits, topped up with daily medians. */
export function baseline(cohort, id, config = {}) {
  const { window, minPoints } = { ...DEFAULTS, ...config };
  const values = recentValues(cohort, id).slice(0, window).map(item => item.value);
  let source = "recent";
  for (let i = cohort.daily.length - 1; i >= 0 && values.length < window; --i) {
    const day = cohort.daily[i].scenarios[id];
    if (day) { values.push(day.median); source = "recent+daily"; }
  }
  if (values.length < minPoints) return null;
  const center = median(values);
  return { center, sigma: 1.4826 * median(values.map(v => Math.abs(v - center))), n: values.length, source };
}

export function boundary(base, config = {}) {
  const { k, minBudget } = { ...DEFAULTS, ...config };
  const width = Math.max(k * base.sigma, Math.log1p(minBudget));
  return { center: base.center, upper: base.center + width, lower: base.center - width };
}

/**
 * Regression needs the run's own evidence above the boundary: the interval's
 * lower bound when the run has one, its median otherwise. One exceeding commit
 * is a candidate; it becomes a regression when the previous commit exceeds the
 * same boundary too, which ties a real shift to the first commit after it.
 */
export function judge(point, cohort, config = {}) {
  const scenarios = {}, counts = { regression: 0, candidate: 0, improvement: 0, within: 0, invalid: 0, "insufficient-history": 0 };
  for (const [id, observed] of Object.entries(point.scenarios)) {
    let result;
    if (!observed.valid) result = { status: "invalid" };
    else {
      const base = cohort ? baseline(cohort, id, config) : null;
      if (!base) result = { status: "insufficient-history", logRatio: observed.logRatio };
      else {
        const bound = boundary(base, config), low = observed.lower ?? observed.logRatio, high = observed.upper ?? observed.logRatio;
        const previous = recentValues(cohort, id).find(item => item.sha !== point.sha);
        let status = "within";
        if (low > bound.upper) status = previous && previous.value > bound.upper ? "regression" : "candidate";
        else if (high < bound.lower) status = "improvement";
        result = { status, logRatio: observed.logRatio, deltaFromBaseline: Math.expm1(observed.logRatio - bound.center), ...bound, n: base.n, source: base.source };
      }
    }
    scenarios[id] = result; counts[result.status]++;
  }
  return { sha: point.sha, scenarios, counts };
}

export function compact(cohort, now, recentDays = DEFAULTS.recentDays) {
  const cutoff = dayOf(new Date(Date.parse(now) - recentDays * DAY_MS).toISOString());
  const old = cohort.recent.filter(point => dayOf(point.measuredAt) < cutoff);
  if (!old.length) return 0;
  cohort.recent = cohort.recent.filter(point => dayOf(point.measuredAt) >= cutoff);
  const days = new Map();
  for (const point of old) { const day = dayOf(point.measuredAt); if (!days.has(day)) days.set(day, []); days.get(day).push(point); }
  for (const [day, points] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    if (cohort.daily.some(entry => entry.day === day)) throw new Error("Day " + day + " is already compacted in cohort " + cohort.id);
    const scenarios = {};
    for (const id of new Set(points.flatMap(point => Object.keys(point.scenarios)))) {
      const values = points.map(point => point.scenarios[id]).filter(s => s?.valid).map(s => s.logRatio);
      if (values.length) scenarios[id] = { median: median(values), p25: quantile(values, 0.25), p75: quantile(values, 0.75), n: values.length };
    }
    cohort.daily.push({ day, points: points.length, firstSha: points[0].sha, lastSha: points.at(-1).sha, scenarios });
  }
  cohort.daily.sort((a, b) => a.day.localeCompare(b.day));
  return old.length;
}

/** A re-anchored cohort links to the cohort that measured its anchor commit. */
function findBridge(store, identity) {
  for (const parent of store.cohorts.values()) {
    if (parent.identity.anchorCommit === identity.anchorCommit || !sameExceptAnchor(parent.identity, identity)) continue;
    const point = [...parent.recent].reverse().find(p => p.sha === identity.anchorCommit);
    if (!point) continue;
    const offsets = Object.fromEntries(Object.entries(point.scenarios).filter(([, s]) => s.valid).map(([id, s]) => [id, s.logRatio]));
    return { parent: parent.id, sha: point.sha, offsets };
  }
  return null;
}
function sameExceptAnchor(a, b) {
  return a.suite === b.suite && a.protocolHash === b.protocolHash && a.node === b.node && a.vitest === b.vitest;
}

export function ingest(store, summary, { now = new Date().toISOString(), ...config } = {}) {
  const point = pointFromSummary(summary), identity = cohortIdentity(assertGateSummary(summary)), id = cohortId(identity);
  let cohort = store.cohorts.get(id);
  if (!cohort) {
    cohort = { schemaVersion: TREND_SCHEMA, id, identity, createdAt: point.measuredAt, bridge: findBridge(store, identity), recent: [], daily: [] };
    store.cohorts.set(id, cohort);
  }
  if (cohort.recent.some(existing => existing.runId === point.runId && existing.sha === point.sha)) return { cohortId: id, verdict: null, duplicate: true, compacted: 0 };
  const verdict = judge(point, cohort, config);
  cohort.recent.push(point);
  cohort.recent.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt) || a.runId.localeCompare(b.runId));
  return { cohortId: id, verdict, duplicate: false, compacted: compact(cohort, now, config.recentDays) };
}

/** Page data: cohorts chained through bridges into one series per suite and scenario. */
export function buildSeries(store, config = {}) {
  const suites = {};
  const offsetOf = (cohort, id, depth = 0) => {
    if (!cohort.bridge || depth > 64) return { offset: 0, reference: cohort.identity.anchorCommit };
    const parent = store.cohorts.get(cohort.bridge.parent), step = cohort.bridge.offsets[id];
    if (!parent || step === undefined) return { offset: 0, reference: cohort.identity.anchorCommit };
    const up = offsetOf(parent, id, depth + 1);
    return { offset: up.offset + step, reference: up.reference };
  };
  for (const cohort of [...store.cohorts.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const suite = (suites[cohort.identity.suite] ??= { suite: cohort.identity.suite, anchors: [], scenarios: {} });
    suite.anchors.push({ cohort: cohort.id, anchor: cohort.identity.anchorCommit, since: cohort.createdAt, bridged: !!cohort.bridge, protocolHash: cohort.identity.protocolHash });
    const ids = new Set([...cohort.recent.flatMap(p => Object.keys(p.scenarios)), ...cohort.daily.flatMap(d => Object.keys(d.scenarios))]);
    for (const id of ids) {
      const { offset, reference } = offsetOf(cohort, id);
      const series = (suite.scenarios[id] ??= { id, segments: [] });
      let segment = series.segments.at(-1);
      if (!segment || segment.reference !== reference) series.segments.push(segment = { reference, daily: [], recent: [], boundary: null });
      for (const day of cohort.daily) { const s = day.scenarios[id]; if (s) segment.daily.push({ day: day.day, median: s.median + offset, p25: s.p25 + offset, p75: s.p75 + offset, n: s.n, firstSha: day.firstSha, lastSha: day.lastSha, cohort: cohort.id }); }
      for (const point of cohort.recent) { const s = point.scenarios[id]; if (s?.valid) segment.recent.push({ sha: point.sha, measuredAt: point.measuredAt, value: s.logRatio + offset, lower: s.lower == null ? null : s.lower + offset, upper: s.upper == null ? null : s.upper + offset, cohort: cohort.id }); }
      const base = baseline(cohort, id, config);
      if (base) { const b = boundary(base, config); segment.boundary = { center: b.center + offset, upper: b.upper + offset, lower: b.lower + offset, n: base.n }; }
    }
  }
  return suites;
}

const percent = log => (Math.expm1(log) * 100).toFixed(1) + "%";
export function report(verdict, title) {
  const rows = Object.entries(verdict.scenarios).sort(([a], [b]) => a.localeCompare(b)).map(([id, r]) => "| " + id.replaceAll("|", "\\|") + " | " + r.status + " | " + (r.logRatio == null ? "—" : percent(r.logRatio)) + " | " + (r.center == null ? "—" : percent(r.center) + " [" + percent(r.lower) + ", " + percent(r.upper) + "] n=" + r.n) + " | " + (r.deltaFromBaseline == null ? "—" : (r.deltaFromBaseline * 100).toFixed(1) + "%") + " |");
  const c = verdict.counts;
  return ["## " + title, "", "Commit " + verdict.sha + ": " + c.regression + " regressions, " + c.candidate + " candidates, " + c.improvement + " improvements, " + c["insufficient-history"] + " without history.", "", "| Scenario | Status | vs anchor | Baseline [boundary] | vs baseline |", "| --- | --- | ---: | --- | ---: |", ...rows, ""].join("\n");
}
function annotate(verdict, suite) {
  for (const [id, r] of Object.entries(verdict.scenarios)) {
    if (r.status === "regression" || r.status === "candidate") console.log(`::warning title=${suite} trend ${r.status}::${id}: ${(r.deltaFromBaseline * 100).toFixed(1)}% above the historical baseline (boundary ${percent(r.upper)} vs anchor)`);
  }
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === "site") {
    const opts = options(rest, ["--store", "--out"]);
    const store = loadStore(resolve(required(opts, "store"))), out = resolve(required(opts, "out"));
    mkdirSync(join(out, "data"), { recursive: true });
    const suites = buildSeries(store);
    for (const [name, suite] of Object.entries(suites)) writeFileSync(join(out, "data", name + ".json"), JSON.stringify(suite) + "\n");
    writeFileSync(join(out, "data", "index.json"), JSON.stringify({ schemaVersion: TREND_SCHEMA, generatedAt: new Date().toISOString(), recentDays: DEFAULTS.recentDays, suites: Object.keys(suites).sort() }) + "\n");
    copyFileSync(fileURLToPath(new URL("./site/index.html", import.meta.url)), join(out, "index.html"));
    console.log("Trend site: " + Object.keys(suites).length + " suites");
    return;
  }
  if (command !== "ingest" && command !== "judge") throw new Error("Usage: trend.mjs ingest|judge|site ...");
  const opts = options(rest, ["--store", "--summary", "--report", "--recent-days", "--now"]);
  const dir = resolve(required(opts, "store")), summary = readJson(required(opts, "summary")), store = loadStore(dir);
  const config = { recentDays: numberOption(opts, "recent-days", DEFAULTS.recentDays, 1) };
  let verdict;
  if (command === "ingest") {
    const result = ingest(store, summary, { ...config, now: opts.now ?? new Date().toISOString() });
    saveStore(dir, store); verdict = result.verdict;
    console.log("Cohort " + result.cohortId + (result.duplicate ? ": run already recorded" : ": recorded; compacted " + result.compacted + " points"));
  } else {
    const point = pointFromSummary(summary);
    verdict = judge(point, store.cohorts.get(cohortId(cohortIdentity(summary))), config);
  }
  if (!verdict) return;
  annotate(verdict, summary.suite);
  const text = report(verdict, summary.suite + " trend against anchor " + summary.anchorCommit.slice(0, 12));
  if (opts.report) writeFileSync(resolve(opts.report), text, { flag: "a" });
  console.log(text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
