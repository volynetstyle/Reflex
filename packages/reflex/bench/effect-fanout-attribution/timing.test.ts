import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createEffectFanoutCase,
  createSerialEffectCase,
  EFFECT_FANOUT_WIDTHS,
  readEffectAttributionSink,
  type CallbackMode,
  type EffectFanoutCase,
} from "./workload";
import { createCumulativeCase, type CumulativeLeg } from "./cumulative";

const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../bench-results/effect-fanout-attribution/timing.json",
);
const TRIALS = 5;
const MINIMUM_MS = 100;
const WARMUP_MS = 50;

type TimingRecord = {
  family:
    | "width"
    | "body"
    | "callback-shape"
    | "execution-topology"
    | "pipeline";
  width: number;
  prewarmQueueCapacity: number;
  callbackMode: CallbackMode;
  bodyIterations: number;
  topology: "fanout" | "serial";
  leg?: CumulativeLeg;
  callbacksPerOperation: number;
  nsPerOperationMedian: number;
  nsPerCallbackMedian: number;
  nsPerOperationTrials: number[];
};

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function timeCumulativeLeg(leg: CumulativeLeg, width: number): TimingRecord {
  const trials: number[] = [];

  for (let trial = 0; trial < TRIALS; trial += 1) {
    const workload = createCumulativeCase(leg, width);
    runForMilliseconds(workload.step, WARMUP_MS);
    const measured = runForMilliseconds(workload.step, MINIMUM_MS);
    trials.push((measured.elapsedMs * 1_000_000) / measured.operations);
    workload.dispose();
  }

  const nsPerOperationMedian = median(trials);
  return {
    family: "pipeline",
    width,
    prewarmQueueCapacity: 0,
    callbackMode: "shared",
    bodyIterations: 0,
    topology: "fanout",
    leg,
    callbacksPerOperation: width,
    nsPerOperationMedian,
    nsPerCallbackMedian: nsPerOperationMedian / width,
    nsPerOperationTrials: trials,
  };
}

function runForMilliseconds(
  run: () => void,
  minimumMilliseconds: number,
): { operations: number; elapsedMs: number } {
  const started = performance.now();
  let operations = 0;
  let elapsedMs = 0;
  do {
    for (let index = 0; index < 64; index += 1) run();
    operations += 64;
    elapsedMs = performance.now() - started;
  } while (elapsedMs < minimumMilliseconds);
  return { operations, elapsedMs };
}

function timeCase(
  family: TimingRecord["family"],
  options: {
    width: number;
    prewarmQueueCapacity?: number;
    callbackMode?: CallbackMode;
    bodyIterations?: number;
    topology?: TimingRecord["topology"];
  },
): TimingRecord {
  const topology = options.topology ?? "fanout";
  const callbacksPerOperation = options.width;
  const trials: number[] = [];

  for (let trial = 0; trial < TRIALS; trial += 1) {
    const workload =
      topology === "fanout"
        ? createEffectFanoutCase(options)
        : createSerialEffectCase(options.bodyIterations);
    let operations = 0;

    const aggregateRun =
      topology === "fanout"
        ? () => workload.step()
        : () => {
            for (let index = 0; index < options.width; index += 1) {
              workload.step();
            }
          };

    const warmup = runForMilliseconds(aggregateRun, WARMUP_MS);
    operations +=
      warmup.operations * (topology === "serial" ? options.width : 1);
    const measured = runForMilliseconds(aggregateRun, MINIMUM_MS);
    operations +=
      measured.operations * (topology === "serial" ? options.width : 1);

    workload.validate(operations);
    trials.push((measured.elapsedMs * 1_000_000) / measured.operations);
    workload.dispose();
  }

  const nsPerOperationMedian = median(trials);
  return {
    family,
    width: options.width,
    prewarmQueueCapacity: options.prewarmQueueCapacity ?? 0,
    callbackMode: options.callbackMode ?? "closures",
    bodyIterations: options.bodyIterations ?? 0,
    topology,
    callbacksPerOperation,
    nsPerOperationMedian,
    nsPerCallbackMedian: nsPerOperationMedian / callbacksPerOperation,
    nsPerOperationTrials: trials,
  };
}

describe("effect fanout timing attribution", () => {
  it("measures width, queue prewarm, body cost, callback shape, and topology", () => {
    const records: TimingRecord[] = [];

    for (const width of EFFECT_FANOUT_WIDTHS) {
      records.push(timeCase("width", { width }));
      records.push(timeCase("width", { width, prewarmQueueCapacity: 1024 }));
    }

    for (const bodyIterations of [0, 4, 16, 64, 256]) {
      records.push(timeCase("body", { width: 32, bodyIterations }));
    }

    for (const callbackMode of ["shared", "closures"] as const) {
      records.push(timeCase("callback-shape", { width: 32, callbackMode }));
    }

    for (const width of [8, 16, 32, 64]) {
      records.push(
        timeCase("execution-topology", { width, topology: "fanout" }),
      );
      records.push(
        timeCase("execution-topology", { width, topology: "serial" }),
      );
    }

    for (const width of [8, 16, 32, 64]) {
      for (const leg of [
        "claim-release",
        "queue-roundtrip",
        "empty-wrapper",
        "direct-source",
        "scheduler-bypass",
        "shared-derived",
      ] as const) {
        records.push(timeCumulativeLeg(leg, width));
      }
    }

    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, `${JSON.stringify(records, null, 2)}\n`);
    expect(readEffectAttributionSink()).toEqual(expect.any(Number));
  }, 120_000);
});
