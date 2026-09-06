import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { allSweepConfigs, WARMUP_ITERATIONS, type SweepConfig } from "./configs";

/**
 * Timing run: wall-clock ns/op only, deliberately run under vite.config.ts
 * (__PROFILE__: false) so profileRuntimeCounter's `if (__PROFILE__ && ...)`
 * checks are dead-code-eliminated at build time rather than merely disabled
 * at runtime — a disabled-but-present branch at every hot-path call site can
 * still perturb inlining/JIT behavior, so this file intentionally does not
 * import profiling.ts at all. Structural counters come from structural.sweep.ts
 * under vite.dev.config.ts instead; the two are joined by `key` in analysis.
 */

const TRIALS = 5;

type TimingRecord = {
  key: string;
  sweep: string;
  axis: string;
  axisValue: number | string;
  secondaryAxis?: string;
  secondaryValue?: number | string;
  iterations: number;
  nsPerOpMedian: number;
  nsPerOpTrials: number[];
};

const OUTPUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../bench-results/cost-attribution/timing",
);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function timeTrial(config: SweepConfig): number {
  const built = config.build();
  // See structural.sweep.ts's runConfig for why this counter must not reset
  // between warmup and the timed loop.
  let counter = 0;

  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    built.case.step(counter);
    counter += 1;
  }

  const start = performance.now();
  for (let i = 0; i < config.iterations; i += 1) {
    built.case.step(counter);
    counter += 1;
  }
  const elapsedMs = performance.now() - start;

  return (elapsedMs * 1_000_000) / config.iterations;
}

function runConfig(config: SweepConfig): TimingRecord {
  const trials: number[] = [];

  for (let trial = 0; trial < TRIALS; trial += 1) {
    trials.push(timeTrial(config));
  }

  return {
    key: config.key,
    sweep: config.sweep,
    axis: config.axis,
    axisValue: config.axisValue,
    secondaryAxis: config.secondaryAxis,
    secondaryValue: config.secondaryValue,
    iterations: config.iterations,
    nsPerOpMedian: median(trials),
    nsPerOpTrials: trials,
  };
}

describe("cost-attribution timing sweep", () => {
  it("collects wall-clock ns/op for every sweep config", () => {
    const configs = allSweepConfigs();
    const bySweep = new Map<string, TimingRecord[]>();

    for (const config of configs) {
      const record = runConfig(config);
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
      `\n[cost-attribution] wrote timing data for ${bySweep.size} sweeps to ${OUTPUT_DIR}\n`,
    );
  });
});
