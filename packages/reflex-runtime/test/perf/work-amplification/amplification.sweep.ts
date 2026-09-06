import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  profileRuntime,
  readConsumer,
  setRuntimeProfilingEnabled,
  type RuntimeProfileCounters,
  type RuntimeProfileTopology,
} from "../../runtime.test_utils";
import {
  allAmplificationConfigs,
  WARMUP_ITERATIONS,
  type AmplificationConfig,
} from "./configs";

/**
 * Work-amplification sweep: for every config, measures semantic delta (how
 * many independently-observable sinks actually changed value, read via the
 * public API — not derived from internal counters) and structural work
 * (RuntimeProfileCounters) separately, over the same iterations. Semantic
 * delta is a correctness/counting measurement, not a timing measurement, so
 * this runs entirely under the __PROFILE__ build; there is no separate
 * non-profile timing leg for this study (wall-clock is secondary here per
 * the research brief, and analyze.mjs cross-references the existing
 * cost-attribution timing data for structurally comparable axes instead of
 * re-collecting it).
 */

type AmplificationRecord = {
  key: string;
  sweep: string;
  axis: string;
  axisValue: number | string;
  iterations: number;
  sinkCount: number;
  semanticDelta: number;
  expectedDeltaPerWrite?: number;
  counters: RuntimeProfileCounters;
  topology: RuntimeProfileTopology;
};

const OUTPUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../bench-results/work-amplification",
);

function runConfig(config: AmplificationConfig): AmplificationRecord {
  const built = config.build();
  const sinks = built.case.sinks;
  let previous = sinks.map((sink) => readConsumer(sink));

  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    built.case.step(i);
    previous = sinks.map((sink) => readConsumer(sink));
  }

  setRuntimeProfilingEnabled(false);

  let semanticDelta = 0;

  const { counters, topology } = profileRuntime(() => {
    for (let i = 0; i < config.iterations; i += 1) {
      built.case.step(i);

      for (let s = 0; s < sinks.length; s += 1) {
        const value = readConsumer(sinks[s]!);
        if (value !== previous[s]) {
          semanticDelta += 1;
          previous[s] = value;
        }
      }
    }
  });

  return {
    key: config.key,
    sweep: config.sweep,
    axis: config.axis,
    axisValue: config.axisValue,
    iterations: config.iterations,
    sinkCount: sinks.length,
    semanticDelta,
    expectedDeltaPerWrite: built.expectedDeltaPerWrite,
    counters,
    topology,
  };
}

describe("work-amplification sweep", () => {
  it("collects structural work and semantic delta for every config", () => {
    const configs = allAmplificationConfigs();
    const bySweep = new Map<string, AmplificationRecord[]>();

    for (const config of configs) {
      const record = runConfig(config);

      if (record.expectedDeltaPerWrite !== undefined) {
        const expectedTotal = record.expectedDeltaPerWrite * record.iterations;
        if (record.semanticDelta !== expectedTotal) {
          throw new Error(
            `${record.key}: semantic delta mismatch (expected ${expectedTotal} ` +
              `= ${record.expectedDeltaPerWrite}/write * ${record.iterations} writes, ` +
              `observed ${record.semanticDelta})`,
          );
        }
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
      `\n[work-amplification] wrote data for ${bySweep.size} sweeps to ${OUTPUT_DIR}\n`,
    );
  });
});
