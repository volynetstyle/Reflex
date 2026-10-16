import { performance } from "node:perf_hooks";

import { loadFramework } from "./frameworks.mjs";
import { WORKLOADS } from "./workloads.mjs";

// One timing measurement in a fresh process:
//   node --expose-gc worker.mjs <framework> <workload> <paramIndex> <seed>
// Prints one JSON line.

const [framework, workloadName, paramIndex, seedArg] = process.argv.slice(2);
const workload = WORKLOADS[workloadName];
const param = workload.params[Number(paramIndex)];
const seed = Number(seedArg ?? 1);

const gc = () => {
  if (typeof globalThis.gc !== "function") throw new Error("--expose-gc");
  for (let i = 0; i < 4; i++) globalThis.gc();
};

const adapter = await loadFramework(framework, "timing");

// Warm-up: a full instance on a different seed, discarded.
{
  const warm = workload.build(adapter.session(), param, seed + 1000);
  for (const phase of warm.phases) phase.run();
}

gc();
const baseline = process.memoryUsage().heapUsed;
const instance = workload.build(adapter.session(), param, seed);
gc();
const builtHeap = process.memoryUsage().heapUsed - baseline;

const phases = [];
for (const phase of instance.phases) {
  const start = performance.now();
  phase.run();
  const ns = (performance.now() - start) * 1e6;
  phases.push({ name: phase.name, ops: phase.ops, ns, nsPerOp: ns / phase.ops });
}
gc();
const retainedHeap = process.memoryUsage().heapUsed - baseline;
const mismatches = instance.verify();

process.stdout.write(
  `${JSON.stringify({
    framework,
    workload: workloadName,
    paramIndex: Number(paramIndex),
    seed,
    phases,
    builtHeap,
    retainedHeap,
    mismatches,
    stats: instance.stats,
  })}\n`,
);
