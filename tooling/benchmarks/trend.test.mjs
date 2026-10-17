import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyStore, ingest, judge, pointFromSummary, compact, baseline, buildSeries, loadStore, saveStore, cohortId, cohortIdentity } from "./trend.mjs";

const DAY = 86_400_000;
const at = day => new Date(Date.UTC(2026, 9, 1) + day * DAY).toISOString();
let run = 0;
function summary({ head, day = 0, ratios = { a: 1 }, anchor = "anchor", protocolHash = "p", lower = null, status = "valid" }) {
  return {
    schemaVersion: 4, suite: "s", scope: "branch", protocolHash, vitestVersion: "vitest/4.1.5",
    commits: { base: anchor, head }, anchorCommit: anchor, environment: { node: "v24.3.0" },
    measuredAt: at(day), workflowRunId: String(++run), workflowRunAttempt: "1",
    benchmarks: Object.entries(ratios).map(([id, ratio]) => ({ id, comparison: { ratio, medianLogRatio: Math.log(ratio), logRatioMad: 0, interval: lower == null ? null : { lower: Math.log(lower), upper: Math.log(ratio) } }, measurement: { status } })),
  };
}
function history(store, values, { anchor = "anchor", from = 0 } = {}) {
  values.forEach((ratio, i) => ingest(store, summary({ head: anchor + "-c" + (from + i), day: from + i * 0.01, ratios: { a: ratio }, anchor }), { now: at(from) }));
}

test("points must be measured directly against the fixed anchor", () => {
  assert.throws(() => pointFromSummary({ ...summary({ head: "h" }), anchorCommit: null }), /fixed anchor/);
  assert.throws(() => pointFromSummary({ ...summary({ head: "h" }), commits: { base: "other", head: "h" } }), /fixed anchor/);
});

test("a short history gives no verdict", () => {
  const store = emptyStore();
  history(store, [1, 1, 1, 1]);
  const { verdict } = ingest(store, summary({ head: "next", ratios: { a: 2 } }), { now: at(0) });
  assert.equal(verdict.scenarios.a.status, "insufficient-history");
});

test("one commit above the boundary is a candidate, two in a row a regression", () => {
  const store = emptyStore();
  history(store, [1.00, 1.01, 0.99, 1.00, 1.02, 0.98]);
  assert.equal(ingest(store, summary({ head: "same", day: 1, ratios: { a: 1.01 } }), { now: at(0) }).verdict.scenarios.a.status, "within");
  assert.equal(ingest(store, summary({ head: "slow", day: 2, ratios: { a: 1.25 } }), { now: at(0) }).verdict.scenarios.a.status, "candidate");
  const second = ingest(store, summary({ head: "slow-2", day: 3, ratios: { a: 1.25 } }), { now: at(0) }).verdict.scenarios.a;
  assert.equal(second.status, "regression");
  assert.ok(Math.abs(second.deltaFromBaseline - 0.25 / 1.0) < 0.02);
  assert.equal(ingest(store, summary({ head: "fast", day: 4, ratios: { a: 0.7 } }), { now: at(0) }).verdict.scenarios.a.status, "improvement");
});

test("a silent history still allows the minimum budget", () => {
  const store = emptyStore();
  history(store, [1, 1, 1, 1, 1, 1]);
  const cohort = [...store.cohorts.values()][0];
  assert.equal(judge(pointFromSummary(summary({ head: "x", ratios: { a: 1.02 } })), cohort).scenarios.a.status, "within");
  assert.equal(judge(pointFromSummary(summary({ head: "y", ratios: { a: 1.05 } })), cohort).scenarios.a.status, "candidate");
});

test("a run's own interval must clear the boundary", () => {
  const store = emptyStore();
  history(store, [1, 1, 1, 1, 1, 1]);
  const cohort = [...store.cohorts.values()][0];
  assert.equal(judge(pointFromSummary(summary({ head: "x", ratios: { a: 1.3 }, lower: 1.01 })), cohort).scenarios.a.status, "within");
  assert.equal(judge(pointFromSummary(summary({ head: "y", status: "unstable", ratios: { a: 1.3 } })), cohort).scenarios.a.status, "invalid");
});

test("old points compact to daily medians and still feed the baseline", () => {
  const store = emptyStore();
  for (let day = 0; day < 20; ++day) for (let i = 0; i < 3; ++i) ingest(store, summary({ head: "d" + day + "-" + i, day: day + i * 0.1, ratios: { a: 1 + i * 0.01 } }), { now: at(day) });
  const cohort = [...store.cohorts.values()][0];
  assert.deepEqual(cohort.daily.map(d => d.day), Array.from({ length: 5 }, (_, i) => at(i).slice(0, 10)));
  assert.ok(cohort.recent.every(p => p.measuredAt >= at(5)));
  assert.equal(cohort.daily[0].points, 3);
  assert.ok(Math.abs(Math.exp(cohort.daily[0].scenarios.a.median) - 1.01) < 1e-9);
  assert.equal(cohort.daily[0].firstSha, "d0-0"); assert.equal(cohort.daily[0].lastSha, "d0-2");
  cohort.recent = [];
  assert.equal(baseline(cohort, "a").source, "recent+daily");
  assert.throws(() => { cohort.recent.push(...[{ sha: "late", measuredAt: at(0), runId: "x", scenarios: {} }]); compact(cohort, at(30)); }, /already compacted/);
});

test("a rerun of the same workflow attempt is recorded once", () => {
  const store = emptyStore(), input = summary({ head: "h" });
  ingest(store, input, { now: at(0) });
  assert.equal(ingest(store, input, { now: at(0) }).duplicate, true);
  assert.equal([...store.cohorts.values()][0].recent.length, 1);
});

test("re-anchoring bridges through the new anchor's own point", () => {
  const store = emptyStore();
  history(store, [1.0, 1.1, 1.2], { anchor: "old" });
  ingest(store, summary({ head: "release", ratios: { a: 1.5 }, anchor: "old", day: 1 }), { now: at(1) });
  ingest(store, summary({ head: "after", ratios: { a: 1.2 }, anchor: "release", day: 2 }), { now: at(2) });
  ingest(store, summary({ head: "other", ratios: { a: 1.0 }, anchor: "x", protocolHash: "changed", day: 3 }), { now: at(3) });
  const reanchored = store.cohorts.get(cohortId(cohortIdentity(summary({ head: "after", anchor: "release" }))));
  assert.equal(reanchored.bridge.sha, "release");
  const series = buildSeries(store).s.scenarios.a.segments;
  assert.equal(series.length, 2, "a changed protocol cannot be bridged");
  assert.equal(series[0].reference, "old");
  const after = series[0].recent.find(p => p.sha === "after");
  assert.ok(Math.abs(Math.exp(after.value) - 1.5 * 1.2) < 1e-9, "points are expressed against the oldest anchor");
  assert.equal(series[1].reference, "x");
});

test("the store round-trips through its directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "reflex-trend-"));
  try {
    const store = emptyStore();
    history(store, [1, 1.1]);
    saveStore(dir, store);
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
    assert.equal(index.cohorts.length, 1); assert.equal(index.cohorts[0].recent, 2);
    assert.deepEqual([...loadStore(dir).cohorts.values()], [...store.cohorts.values()]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
