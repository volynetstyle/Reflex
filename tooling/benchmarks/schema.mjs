import { fingerprint } from "./io.mjs";
const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
const positive = x => typeof x === "number" && Number.isFinite(x) && x > 0;
const nonnegative = x => typeof x === "number" && Number.isFinite(x) && x >= 0;
const string = x => typeof x === "string" && x.length > 0;
function ensure(ok, message) { if (!ok) throw new Error(message); }

export function assertRaw(report, source = "report") {
  ensure(object(report) && Array.isArray(report.files) && report.files.length > 0, source + ": expected Vitest files[]");
  const ids = new Set();
  for (const file of report.files) {
    ensure(Array.isArray(file.groups) && file.groups.length > 0, source + ": missing groups[]");
    for (const group of file.groups) {
      ensure(string(group.fullName) && Array.isArray(group.benchmarks) && group.benchmarks.length > 0, source + ": invalid group");
      for (const bench of group.benchmarks) {
        const id = group.fullName + " > " + bench.name;
        ensure(string(bench.name) && positive(bench.mean) && nonnegative(bench.rme) && Number.isInteger(bench.sampleCount) && bench.sampleCount > 0, source + ": invalid mean/rme/sampleCount for " + id);
        for (const key of ["hz", "median", "p75", "p99", "p999", "min", "max"]) ensure(bench[key] == null || nonnegative(bench[key]), source + ": invalid " + key);
        ensure(!ids.has(id), source + ": duplicate benchmark " + id); ids.add(id);
      }
    }
  }
  return report;
}
export function flattenRaw(report, source) { assertRaw(report, source); return new Map(report.files.flatMap(file => file.groups.flatMap(group => group.benchmarks.map(bench => [group.fullName + " > " + bench.name, bench])))); }
export function assertNormalized(report, source = "report") {
  ensure(object(report) && report.schemaVersion === 1 && string(report.suite) && object(report.env), source + ": expected normalized schemaVersion 1, suite and env");
  ensure(Array.isArray(report.benchmarks) && report.benchmarks.length > 0, source + ": empty benchmark set");
  const ids = new Set();
  for (const b of report.benchmarks) {
    ensure(string(b.id) && positive(b.meanMs), source + ": invalid id/meanMs");
    ensure(!ids.has(b.id), source + ": duplicate benchmark " + b.id); ids.add(b.id);
    for (const key of ["p99Ms", "p999Ms", "medianMs", "p75Ms", "minMs", "maxMs", "hz", "rme"]) ensure(b[key] == null || nonnegative(b[key]), source + ": invalid " + key);
    ensure(b.samples == null || (Number.isInteger(b.samples) && b.samples > 0), source + ": invalid samples");
    ensure(object(b.work) && Object.values(b.work).every(nonnegative), source + ": invalid work counters");
  }
  return report;
}
export function assertEnvelope(value, source = "envelope") {
  ensure(object(value) && value.format === "reflex-benchmark-run" && value.schemaVersion === 1, source + ": invalid envelope version");
  ensure(string(value.runId) && string(value.suite?.id) && Number.isFinite(Date.parse(value.createdAt)), source + ": missing identity/timestamp");
  ensure(object(value.provenance) && ["complete", "partial"].includes(value.provenance.status) && Array.isArray(value.provenance.unknownFields), source + ": invalid provenance");
  ensure(object(value.environment) && string(value.environment.fingerprint), source + ": missing environment fingerprint");
  ensure(string(value.protocol?.sampleDefinition) && ["passed", "failed", "unverified"].includes(value.validation?.status), source + ": missing protocol/validation");
  ensure(Array.isArray(value.artifacts), source + ": missing artifacts");
  for (const a of value.artifacts) ensure(string(a.path) && /^[a-f\d]{64}$/.test(a.sha256) && Number.isInteger(a.bytes) && a.bytes >= 0, source + ": invalid artifact");
  if (value.dataKind === "normalized-runtime") assertNormalized(value.data, source);
  else if (value.dataKind === "vitest-raw") assertRaw(value.data, source);
  else ensure(["legacy-experiment"].includes(value.dataKind) && object(value.data), source + ": unknown data kind");
  return value;
}
export function makeEnvelope(data, context = {}) {
  const env = context.environment ?? data.env ?? data.metadata ?? {};
  return assertEnvelope({
    format: "reflex-benchmark-run", schemaVersion: 1, runId: context.runId,
    suite: { id: context.suite ?? data.suite ?? "legacy-experiment", protocolHash: context.protocolHash ?? null },
    createdAt: context.createdAt ?? new Date().toISOString(),
    provenance: { sourceCommit: context.sourceCommit ?? data.commit ?? null, baselineCommit: data.metadata?.baselineCommit ?? null, status: "partial", unknownFields: ["original-process-design", "source-working-tree", "complete-build-inputs"], ...context.provenance },
    environment: { ...env, fingerprint: fingerprint(env) },
    build: context.build ?? { mode: "unknown", instrumented: null },
    protocol: { sampleDefinition: "legacy-provider-samples", operationDefinition: "unknown", ...context.protocol },
    validation: context.validation ?? { status: "unverified", failures: [] },
    artifacts: context.artifacts ?? [],
    dataKind: context.dataKind ?? (data.benchmarks ? "normalized-runtime" : data.files ? "vitest-raw" : "legacy-experiment"), data
  });
}
export function normalizedInput(input, source) {
  if (input?.format === "reflex-benchmark-run") { assertEnvelope(input, source); ensure(input.dataKind === "normalized-runtime", source + ": comparator requires normalized-runtime"); ensure(input.validation.status !== "failed", source + ": failed validation"); return { report: assertNormalized(input.data, source), envelope: input }; }
  return { report: assertNormalized(input, source), envelope: null };
}
export function sameScenarioSet(base, head) {
  const a = [...base].sort(), b = [...head].sort();
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Benchmark set changed: removed=[" + a.filter(id => !b.includes(id)).join(", ") + "]; added=[" + b.filter(id => !a.includes(id)).join(", ") + "]");
}
export function assertGateSummary(s, source = "summary") {
  ensure(object(s) && [3, 4].includes(s.schemaVersion) && string(s.suite) && string(s.scope) && string(s.protocolHash), source + ": invalid gate summary identity");
  ensure(string(s.commits?.base) && string(s.commits?.head) && object(s.environment), source + ": missing commits/environment");
  ensure(Number.isFinite(Date.parse(s.measuredAt)) && Array.isArray(s.benchmarks) && s.benchmarks.length > 0, source + ": missing timestamp/benchmarks");
  const ids = new Set();
  for (const b of s.benchmarks) { ensure(string(b.id) && !ids.has(b.id) && positive(b.comparison?.ratio), source + ": duplicate/invalid benchmark"); ensure(["valid", "unstable", "insufficient-samples"].includes(b.measurement?.status), source + ": invalid measurement"); ids.add(b.id); }
  return s;
}
