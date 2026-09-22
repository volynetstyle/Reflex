import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  readRuntimeProfileCounters,
  resetRuntimeProfileCounters,
  setRuntimeProfilingEnabled,
} from "../../src/debug";
import {
  readSchedulerPolicyCounters,
  resetSchedulerPolicyCounters,
  setSchedulerPolicyCountersEnabled,
} from "@volynets/reflex-scheduler";

import { createEffectFanoutCase, EFFECT_FANOUT_WIDTHS } from "./workload";

const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../bench-results/effect-fanout-attribution/structural.json",
);
const WARMUP = 50;
const ITERATIONS = 50;

describe("effect fanout structural attribution", () => {
  it("records scheduler and watcher events across the dense grid", () => {
    const records = [];

    for (const prewarmQueueCapacity of [0, 1024]) {
      for (const width of EFFECT_FANOUT_WIDTHS) {
        const workload = createEffectFanoutCase({
          width,
          prewarmQueueCapacity,
        });

        for (let index = 0; index < WARMUP; index += 1) workload.step();

        resetRuntimeProfileCounters();
        resetSchedulerPolicyCounters();
        setRuntimeProfilingEnabled(true);
        setSchedulerPolicyCountersEnabled(true);

        for (let index = 0; index < ITERATIONS; index += 1) workload.step();

        setSchedulerPolicyCountersEnabled(false);
        setRuntimeProfilingEnabled(false);
        workload.validate(WARMUP + ITERATIONS);

        records.push({
          width,
          prewarmQueueCapacity,
          iterations: ITERATIONS,
          runtime: readRuntimeProfileCounters(),
          scheduler: readSchedulerPolicyCounters(),
        });
        workload.dispose();
      }
    }

    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, `${JSON.stringify(records, null, 2)}\n`);

    for (const record of records) {
      expect(record.scheduler.queueGrows).toBe(0);
      expect(record.scheduler.queueEnqueues / ITERATIONS).toBe(record.width);
      expect(record.scheduler.queueDequeues / ITERATIONS).toBe(record.width);
      expect(record.runtime.watcherExecutions / ITERATIONS).toBe(record.width);
    }
  });
});
