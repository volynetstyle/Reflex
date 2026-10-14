// Branch census: how often each kernel branch runs per workload step.
//
//   node bench/census.mjs [--workloads <regex>] [--steps 2000] [--ref source|<commit>]
//        [--family tracking|push|pull|advance|watcher|all] [--json <file>]
//
// Builds a PROFILE bundle (projection events enabled) and counts semantic
// projection events while each workload runs `steps` measured steps after its
// setup. Counts are reported per step. This is the statistical evidence for
// specialized paths: a fast path is justified by how often it is taken, not
// by a timing result alone. Timings from a PROFILE bundle are meaningless and
// are not reported.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { workloads } from "./workloads.mjs";

const packageRoot = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const pattern = new RegExp(option("--workloads", ".*"));
const steps = Number(option("--steps", 2000));
const ref = option("--ref", "source");
const family = option("--family", "all");

const flags = ["--profile"];
if (ref === "source")
  flags.push(
    "--source",
    "--out",
    path.join(packageRoot, ".cache/bench/census"),
  );
else flags.push("--commit", ref);
const out = execFileSync(
  process.execPath,
  [path.join(packageRoot, "scripts/build-baseline-oracle.mjs"), ...flags],
  { cwd: packageRoot, encoding: "utf8" },
).trim();
const rt = await import(
  pathToFileURL(path.join(path.resolve(packageRoot, out), "runtime.mjs")).href
);

const prefix = "projection.semantic.";
const counts = new Map();
rt.setRuntimeProjectionObserver((observation) => {
  counts.set(observation.id, (counts.get(observation.id) ?? 0) + 1);
});

const report = {};
for (const workload of workloads.filter((w) => pattern.test(w.id))) {
  const { step } = workload.setup(rt);
  counts.clear();
  for (let i = 0; i < steps; i++) step(i);
  const perStep = {};
  for (const [id, n] of [...counts].sort()) {
    const name = id.startsWith(prefix) ? id.slice(prefix.length) : id;
    if (family !== "all" && !name.startsWith(family)) continue;
    perStep[name] = Number((n / steps).toFixed(3));
  }
  report[workload.id] = perStep;
}
rt.setRuntimeProjectionObserver(undefined);

const json = option("--json");
if (json) writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
for (const [id, perStep] of Object.entries(report)) {
  process.stdout.write(`\n== ${id}\n`);
  for (const [name, n] of Object.entries(perStep)) {
    process.stdout.write(`  ${String(n).padStart(10)}  ${name}\n`);
  }
}
