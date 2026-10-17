import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

import * as reflexSource from "../../src/index.ts";
import {
  readRuntimeProfileCounters,
  resetRuntimeProfileCounters,
  setRuntimeProfilingEnabled,
} from "../../../reflex-runtime/src/profiling.ts";
import {
  COUNTERS,
  FRAMEWORKS,
  loadFramework,
  reflexAdapter,
} from "./frameworks.mjs";
import { WORKLOADS, paramLabel } from "./workloads.mjs";

// Deterministic structural counts for every (framework, workload, param,
// phase). Run through run.mjs, or directly:
//   pnpm exec vitest run --config bench/liveness/vitest.structural.config.ts

const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../bench-results/liveness/structural.json",
);

function reflexCounters() {
  const lv = (globalThis.__LV_reflex ??= {});
  const c = readRuntimeProfileCounters();
  return {
    linkAlloc: lv.linkAlloc ?? 0,
    // Every Reflex edge is inserted into its producer's out-list on link.
    subscribe: lv.linkAlloc ?? 0,
    unsubscribe: lv.unlink ?? 0,
    pollVisits: c.pullEdgesVisited + c.watcherFrontierEdgesVisited,
    notifyVisits:
      c.pushDirectEdgesVisited +
      c.pushTransitiveEdgesVisited +
      c.pushOnceEdgesVisited,
  };
}

it("liveness structural counts", async () => {
  setRuntimeProfilingEnabled(true);
  resetRuntimeProfileCounters();

  const adapters = {
    reflex: reflexAdapter(reflexSource, reflexCounters),
    angular: await loadFramework("angular", "structural"),
    preact: await loadFramework("preact", "structural"),
  };

  const rows = [];
  for (const [workloadName, workload] of Object.entries(WORKLOADS)) {
    for (let index = 0; index < workload.params.length; index++) {
      const param = workload.params[index];
      for (const framework of FRAMEWORKS) {
        const adapter = adapters[framework];
        let before = adapter.counters();
        const instance = workload.build(adapter.session(), param, 1);
        const setup = diff(adapter.counters(), before);
        const phases = [];
        for (const phase of instance.phases) {
          before = adapter.counters();
          const computes = instance.stats.computes;
          const effectRuns = instance.stats.effectRuns;
          phase.run();
          phases.push({
            name: phase.name,
            ops: phase.ops,
            counters: diff(adapter.counters(), before),
            computes: instance.stats.computes - computes,
            effectRuns: instance.stats.effectRuns - effectRuns,
          });
        }
        const mismatches = instance.verify();
        if (mismatches !== 0) {
          throw new Error(
            `${framework} ${workloadName} ${paramLabel(param)}: ${mismatches} wrong values`,
          );
        }
        rows.push({
          framework,
          workload: workloadName,
          paramIndex: index,
          param: paramLabel(param),
          setup,
          phases,
          sink: instance.stats.sink,
        });
      }
      // Same operations must observe the same values everywhere.
      const sinks = new Set(
        rows
          .filter((r) => r.workload === workloadName && r.paramIndex === index)
          .map((r) => r.sink),
      );
      if (sinks.size !== 1) {
        throw new Error(
          `${workloadName} ${paramLabel(param)}: observed sums differ across frameworks`,
        );
      }
    }
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(rows, null, 2)}\n`);
});

function diff(after, before) {
  return Object.fromEntries(
    COUNTERS.map((name) => [name, (after[name] ?? 0) - (before[name] ?? 0)]),
  );
}
