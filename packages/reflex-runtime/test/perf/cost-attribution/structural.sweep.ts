import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  profileRuntime,
  setRuntimeProfilingEnabled,
  type RuntimeProfileCounters,
  type RuntimeProfileTopology,
} from "../../runtime.test_utils";
import { allSweepConfigs, WARMUP_ITERATIONS, type SweepConfig } from "./configs";

/**
 * Structural run: captures full RuntimeProfileCounters + topology per config.
 * Must run under vite.dev.config.ts (__PROFILE__: true) so profileRuntime is
 * live. Wall-clock timing from *this* run is not trustworthy (see
 * timing.sweep.ts) — this file writes counters/topology only.
 */

type StructuralRecord = {
  key: string;
  sweep: string;
  axis: string;
  axisValue: number | string;
  secondaryAxis?: string;
  secondaryValue?: number | string;
  iterations: number;
  counters: RuntimeProfileCounters;
  topology: RuntimeProfileTopology;
  observedRatio?: number;
  ratioDeviation?: number;
};

const OUTPUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../bench-results/cost-attribution/structural",
);

function runConfig(config: SweepConfig): StructuralRecord {
  const built = config.build();
  // A single counter spans warmup and the profiled loop. Restarting the
  // iteration index at 0 for the profiled loop would make it replay the same
  // deterministic step() values warmup already used — for any config where
  // profiled iterations < WARMUP_ITERATIONS (true once width/fanout grids
  // reach ~1024+, where iterationsFor() scales iterations down), every
  // "profiled" write would then repeat a value already committed during
  // warmup and silently no-op.
  let counter = 0;

  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    built.case.step(counter);
    counter += 1;
  }

  built.resetObservedRatio?.();
  setRuntimeProfilingEnabled(false);

  const { counters, topology } = profileRuntime(() => {
    for (let i = 0; i < config.iterations; i += 1) {
      built.case.step(counter);
      counter += 1;
    }
  });

  const record: StructuralRecord = {
    key: config.key,
    sweep: config.sweep,
    axis: config.axis,
    axisValue: config.axisValue,
    secondaryAxis: config.secondaryAxis,
    secondaryValue: config.secondaryValue,
    iterations: config.iterations,
    counters,
    topology,
  };

  if (built.getObservedRatio) {
    const observed = built.getObservedRatio();
    const target = typeof config.axisValue === "number" ? config.axisValue : 0;
    record.observedRatio = observed;
    record.ratioDeviation = Math.abs(observed - target);
  }

  return record;
}

describe("cost-attribution structural sweep", () => {
  it("collects counters + topology for every sweep config", () => {
    const configs = allSweepConfigs();
    const bySweep = new Map<string, StructuralRecord[]>();

    for (const config of configs) {
      const record = runConfig(config);

      if (
        record.ratioDeviation !== undefined &&
        record.ratioDeviation > 0.05
      ) {
        throw new Error(
          `${record.key}: semantic-change ratio deviated from target ` +
            `(target=${record.axisValue}, observed=${record.observedRatio})`,
        );
      }

      const list = bySweep.get(config.sweep) ?? [];
      list.push(record);
      bySweep.set(config.sweep, list);
    }

    mkdirSync(OUTPUT_DIR, { recursive: true });

    for (const [sweep, records] of bySweep) {
      writeFileSync(
        join(OUTPUT_DIR, `${sweep}.json`),
        JSON.stringify(records, null, 2),
      );
    }

    process.stdout.write(
      `\n[cost-attribution] wrote structural data for ${bySweep.size} sweeps to ${OUTPUT_DIR}\n`,
    );
  });
});
