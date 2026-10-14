// Turns a quality-gate summary into CI annotations and an exit code.
//
//   node tooling/benchmarks/enforce-gate.mjs <summary.json> <suite>
//
// Hosted runners measure two process pairs: a screening run with no
// confidence claim, whose verdicts flip on identical code. Screening verdicts
// become warnings; only a statistically qualified run (independent-pair
// inference) fails on its verdict.
import { existsSync } from "node:fs";
import { readJson } from "./io.mjs";

const [file, suite = "benchmarks"] = process.argv.slice(2);
if (!file || !existsSync(file)) {
  console.log(`::error title=${suite} benchmark gate::the gate produced no summary; see the Evaluate step log`);
  process.exit(1);
}
const summary = readJson(file);
for (const b of summary.benchmarks) {
  const flagged = b.performance.status === "regression" || b.performance.status === "suspicious-shift" || b.measurement.status !== "valid";
  if (!flagged) continue;
  const issues = [b.performance.status, ...b.measurement.issues].join("; ");
  console.log(`::warning title=${suite} ${b.id}::${(b.comparison.delta * 100).toFixed(1)}% (${issues})`);
}
if (summary.passed) process.exit(0);
if (summary.qualification === "independent-pair-inference") {
  console.log(`::error title=${suite} benchmark gate::qualified verdict failed; see the job summary`);
  process.exit(1);
}
console.log(`::notice title=${suite} benchmark gate::screening verdicts reported only (${summary.qualification})`);
