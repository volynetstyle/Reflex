import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonical, fingerprint, options, numberOption, readJson } from "./io.mjs";
import { normalizedInput, sameScenarioSet } from "./schema.mjs";

export function compareReports(baseInput, headInput, { threshold = 0.1, diagnostic = false } = {}) {
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error("Invalid comparison threshold");
  const base = normalizedInput(baseInput, "base"), head = normalizedInput(headInput, "head");
  if (base.report.suite !== head.report.suite) throw new Error("Suite changed");
  sameScenarioSet(base.report.benchmarks.map(b => b.id), head.report.benchmarks.map(b => b.id));
  if (!diagnostic && [base.report.env, head.report.env].some(env => ["node", "platform", "arch", "cpu"].some(key => !env[key] || env[key] === "unknown"))) throw new Error("Unknown original environment; use --diagnostic only");
  const comparableEnvironment = fingerprint(base.report.env) === fingerprint(head.report.env);
  if (!comparableEnvironment && !diagnostic) throw new Error("Environment changed; use --diagnostic for a non-gating report");
  if (Boolean(base.envelope) !== Boolean(head.envelope) && !diagnostic) throw new Error("Envelope/legacy evidence cannot form a strict comparison");
  if (base.envelope && head.envelope) {
    if (base.envelope.suite.protocolHash !== head.envelope.suite.protocolHash) throw new Error("Protocol hash changed");
    if (canonical(base.envelope.protocol) !== canonical(head.envelope.protocol)) throw new Error("Operation/sample definitions changed");
    if (canonical(base.envelope.build) !== canonical(head.envelope.build)) throw new Error("Build mode or instrumentation changed");
  }
  const previous = new Map(base.report.benchmarks.map(b => [b.id, b]));
  const rows = head.report.benchmarks.map(next => {
    const prev = previous.get(next.id), sameWork = canonical(prev.work) === canonical(next.work);
    if (!sameWork && !diagnostic) throw new Error("Scenario work changed: " + next.id);
    // A missing tail is unknown, never a fabricated zero delta.
    if ((prev.p99Ms == null) !== (next.p99Ms == null) && !diagnostic) throw new Error("Tail metric availability changed: " + next.id);
    const meanDelta = next.meanMs / prev.meanMs - 1;
    const p99Delta = prev.p99Ms > 0 && next.p99Ms != null ? next.p99Ms / prev.p99Ms - 1 : null;
    return { id: next.id, baseMeanMs: prev.meanMs, headMeanMs: next.meanMs, meanDelta, p99Delta, sameWork, regression: meanDelta > threshold || (p99Delta != null && p99Delta > threshold) };
  });
  return { mode: diagnostic ? "diagnostic" : "strict-descriptive", inference: "none-single-provider-run", comparableEnvironment, threshold, rows, passed: !rows.some(row => row.regression) };
}

export function main(argv = process.argv.slice(2)) {
  const opts = options(argv, ["--base", "--head", "--threshold"], ["--fail", "--diagnostic", "--summary-only"]);
  if (opts.fail && (opts.diagnostic || opts["summary-only"])) throw new Error("--fail cannot be combined with non-gating modes");
  const head = readJson(opts.head ?? "bench-results/runtime/latest.json");
  if (opts["summary-only"]) { console.log(JSON.stringify(normalizedInput(head, "head").report, null, 2)); return; }
  const base = readJson(opts.base ?? "bench-results/runtime/main-latest.json");
  const result = compareReports(base, head, { threshold: numberOption(opts, "threshold", 0.1), diagnostic: opts.diagnostic ?? false });
  console.log(JSON.stringify(result, null, 2));
  if (opts.fail && !result.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
