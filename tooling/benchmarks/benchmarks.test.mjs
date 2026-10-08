import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { medianInterval } from "./statistics.mjs";
import { assertRaw, makeEnvelope } from "./schema.mjs";
import { compareReports } from "./compare.mjs";
import { evaluatePairs } from "./quality-gate.mjs";
import { buildHistory } from "./history.mjs";
import { protocolManifest } from "./protocol.mjs";
import { transplantProtocol } from "./migrate-protocol.mjs";
import { writeJson } from "./io.mjs";

const env = { node: "v24.1", v8: "13", platform: "linux", arch: "x64", cpu: "fixture" };
const normalized = (benchmarks = [{ id: "a", meanMs: 1, p99Ms: 2, samples: 30, work: { reads: 1 } }]) => ({ schemaVersion: 1, suite: "fixture", env, benchmarks });
const raw = (mean = 1) => ({ files: [{ groups: [{ fullName: "fixture", benchmarks: [{ name: "work", mean, rme: 1, sampleCount: 50 }] }] }] });
function fixture(fn) { const root = mkdtempSync(join(tmpdir(), "reflex-bench-test-")); try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); } }

test("schema rejects missing, duplicate and non-finite measurements", () => {
  assert.throws(() => assertRaw({ files: [] }), /files/);
  const duplicate = raw(); duplicate.files[0].groups[0].benchmarks.push(duplicate.files[0].groups[0].benchmarks[0]);
  assert.throws(() => assertRaw(duplicate), /duplicate/);
  assert.throws(() => assertRaw(raw(NaN)), /mean/);
  const fraction = raw(); fraction.files[0].groups[0].benchmarks[0].sampleCount = 1.5;
  assert.throws(() => assertRaw(fraction), /sampleCount/);
});
test("strict compare rejects removed as well as added scenarios", () => {
  assert.throws(() => compareReports(normalized(), normalized([{ id: "b", meanMs: 1, work: {} }])), /removed=\[a\].*added=\[b\]/);
});
test("strict compare rejects work, environment and tail availability drift", () => {
  assert.throws(() => compareReports(normalized(), { ...normalized(), env: { ...env, cpu: "other" } }), /Environment/);
  assert.throws(() => compareReports(normalized(), normalized([{ id: "a", meanMs: .5, p99Ms: 2, work: { reads: 0 } }])), /work changed/);
  assert.throws(() => compareReports(normalized(), normalized([{ id: "a", meanMs: 1, work: { reads: 1 } }])), /availability/);
});
test("all strict scenarios gate; no four-scenario allowlist hides regressions", () => {
  assert.equal(compareReports(normalized(), normalized([{ id: "a", meanMs: 1.5, p99Ms: 3, work: { reads: 1 } }])).passed, false);
});
test("adapter preserves unknown provenance and protocol mismatch cannot gate", () => {
  const a = makeEnvelope(normalized(), { runId: "a", protocolHash: "old" });
  const b = makeEnvelope(normalized(), { runId: "b", protocolHash: "new" });
  assert.equal(a.provenance.status, "partial");
  assert.throws(() => compareReports(a, b), /Protocol/);
});
test("immutable writer refuses to overwrite a retained result", () => fixture(root => {
  const path = join(root, "result.json"); writeJson(path, { first: true });
  assert.throws(() => writeJson(path, { first: false }), /EEXIST/);
  assert.deepEqual(JSON.parse(readFileSync(path)), { first: true });
}));
test("two process pairs never create confidence from large within-process samples", () => {
  const result = evaluatePairs([raw(), raw()], [raw(), raw()], { requireInference: true });
  assert.equal(result.passed, false); assert.equal(result.qualification, "screening-only");
  assert.equal(result.benchmarks[0].comparison.interval, null);
});
test("median interval has conservative exact coverage for n=20", () => {
  const ci = medianInterval(Array.from({ length: 20 }, (_, i) => i));
  assert.equal(ci.lower, 5); assert.equal(ci.upper, 14);
  // The sign-count endpoints correspond to P(B<=5) and P(B>=15).
  let choose = 1, lowerTail = 0;
  for (let k = 0; k <= 5; k++) { if (k > 0) choose *= (21 - k) / k; lowerTail += choose / 2 ** 20; }
  assert.ok(1 - 2 * lowerTail >= .95);
  const simultaneous = medianInterval(Array.from({ length: 20 }, (_, i) => i), { familySize: 100 });
  assert.ok(simultaneous.lower < ci.lower && simultaneous.upper > ci.upper);
});
test("paired inference distinguishes passing, failing and overlapping budgets", () => {
  const bases = Array.from({ length: 20 }, () => raw()), config = { pairDesign: "independent", requireInference: true };
  assert.equal(evaluatePairs(bases, bases, config).passed, true);
  assert.equal(evaluatePairs(bases, bases.map(() => raw(1.4)), config).benchmarks[0].performance.status, "regression");
  const overlap = bases.map((_, i) => raw(i < 10 ? 1.1 : 1.3));
  const result = evaluatePairs(bases, overlap, config); assert.equal(result.passed, false); assert.equal(result.benchmarks[0].performance.status, "inconclusive");
});
test("gate rejects scenario drift and marks unstable measurements separately", () => {
  const changed = raw(); changed.files[0].groups[0].benchmarks[0].name = "other";
  assert.throws(() => evaluatePairs([raw(), raw()], [raw(), changed]), /set changed/);
  const noisy = raw(); noisy.files[0].groups[0].benchmarks[0].rme = 80;
  const result = evaluatePairs([raw(), raw()], [noisy, raw()]);
  assert.equal(result.passed, false); assert.equal(result.benchmarks[0].measurement.status, "unstable");
});
const summary = (extra = {}) => ({ schemaVersion: 4, suite: "s", scope: "branch", protocolHash: "p", commits: { base: "base", head: "head" }, environment: env, measuredAt: "2026-10-08T12:00:00Z", workflowRunId: "1", benchmarks: [{ id: "a", comparison: { ratio: 1.1 }, measurement: { status: "valid" } }], ...extra });
test("history separates protocol/environment and retains distinct rerun attempts", () => {
  const input = [summary(), summary({ measuredAt: "2026-10-08T13:00:00Z" }), summary({ protocolHash: "changed" }), summary({ environment: { ...env, cpu: "other" } })];
  const result = buildHistory(input, { suite: "s", scope: "branch" });
  assert.equal(result.cohorts.length, 3); assert.equal(result.cohorts.reduce((n, c) => n + c.points.length, 0), 4);
  assert.match(result.metric, /not cumulative/);
});
test("fixed-anchor history excludes changing or merely inferred baseline", () => {
  const result = buildHistory([summary(), summary({ anchorCommit: "base" }), summary({ anchorCommit: "other", commits: { base: "other", head: "h2" } })], { suite: "s", scope: "branch", mode: "fixed-anchor", anchorCommit: "base" });
  assert.equal(result.excluded.length, 2); assert.equal(result.cohorts[0].points.length, 1);
});
test("transitive protocol catches helper edits and excludes subject implementation", () => fixture(root => {
  mkdirSync(join(root, "packages/demo/src"), { recursive: true });
  writeFileSync(join(root, "entry.ts"), 'import "./helper.js"; import "./packages/demo/src/subject.js";');
  writeFileSync(join(root, "helper.js"), "export const n=1;");
  writeFileSync(join(root, "packages/demo/src/subject.js"), "export const subject=1;");
  const before = protocolManifest(root, ["entry.ts"]);
  writeFileSync(join(root, "packages/demo/src/subject.js"), "export const subject=2;");
  assert.equal(protocolManifest(root, ["entry.ts"]).protocolHash, before.protocolHash);
  writeFileSync(join(root, "helper.js"), "export const n=2;");
  assert.notEqual(protocolManifest(root, ["entry.ts"]).protocolHash, before.protocolHash);
}));
test("audited migration copies harness but never baseline subject", () => fixture(root => {
  const base = join(root, "base"), head = join(root, "head");
  for (const dir of [base, head]) {
    mkdirSync(join(dir, "packages/demo/src"), { recursive: true });
    writeFileSync(join(dir, "entry.ts"), 'import "./helper.js"; import "./packages/demo/src/subject.js";');
    writeFileSync(join(dir, "helper.js"), dir === base ? "export const n=1;" : "export const n=2;");
    writeFileSync(join(dir, "packages/demo/src/subject.js"), dir === base ? "export const subject=1;" : "export const subject=2;");
  }
  const evidence = { schemaVersion: 1, equivalent: true, baseRoot: base, headRoot: head, checks: [{ name: "flags", passed: true }] };
  const result = transplantProtocol({ baseRoot: base, headRoot: head, entries: ["entry.ts"], configEvidence: evidence });
  assert.equal(result.baselineMigration, true);
  assert.equal(readFileSync(join(base, "packages/demo/src/subject.js"), "utf8"), "export const subject=1;");
  assert.equal(readFileSync(join(base, "helper.js"), "utf8"), "export const n=2;");
  assert.throws(() => transplantProtocol({ baseRoot: base, headRoot: head, entries: ["entry.ts"], configEvidence: { ...evidence, equivalent: false } }), /equivalence/);
}));

test("exact interval remains finite and conservative beyond probability underflow", () => {
  const interval = medianInterval(Array.from({ length: 2000 }, (_, i) => i));
  assert.ok(interval.lower < 980 && interval.upper > 1020);
  assert.throws(() => evaluatePairs([raw(), raw()], [raw(), raw()], { confidence: 1.2 }), /Confidence/);
});
