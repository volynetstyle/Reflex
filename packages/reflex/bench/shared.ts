import { afterAll, bench, describe } from "vitest";
import type { BenchmarkResult } from "vitest";

export type Read = () => number;
export type WriteInput = number | ((prev: number) => number);
export type Write = (value: WriteInput) => number | void;

export interface EffectMeta {
  label?: string;
  priority?: number;
}

export interface StepMetrics {
  wallTimeMs: number;
  recomputes: number;
  refreshes: number;
  schedulerOps: number;
  stepAllocations: number;
  maxFlushLatencyMs: number;
  uniqueDrainedEffects: number;
  enqueueRepeats: number | null;
  dedupeHits: number | null;
  dedupeMisses: number | null;
  enqueueAllocations: number | null;
  drainAllocations: number | null;
}

export interface BenchHarness {
  readonly metrics: HarnessMetrics;
  signal(initial: number, label?: string): readonly [Read, Write];
  memo(fn: () => number, label?: string): Read;
  effect(read: Read, meta?: EffectMeta): () => void;
  batch<T>(fn: () => T): T;
  flush(): void;
  resetRunMetrics(): void;
  beginStep(): void;
  endStep(wallTimeMs: number): StepMetrics;
  dispose(): void;
}

export interface BenchVariant {
  label: string;
  createHarness(): BenchHarness;
}

interface ScenarioInstance {
  runStep(): void;
}

interface ScenarioDefinition {
  id: string;
  title: string;
  bench: {
    iterations: number;
    warmupIterations: number;
  };
  build(harness: BenchHarness, seed: number): ScenarioInstance;
}

interface SummaryRow {
  variant: string;
  "mean ms": string;
  "p75 ms": string;
  "p99 ms": string;
  "throughput hz": string;
  "recompute/step": string;
  "refresh/step": string;
  "scheduler/step": string;
  "drain uniq/step": string;
  "enq repeat/w": string;
  "dedupe hit/step": string;
  "dedupe miss/step": string;
  "enq alloc/step": string;
  "drain alloc/step": string;
  "setup allocs": string;
  "step allocs/step": string;
  "max flush ms": string;
}

interface ScenarioMeasurement {
  readonly variant: string;
  readonly meanMs: number;
  readonly p99Ms: number;
  readonly throughputHz: number;
  readonly row: SummaryRow;
}

interface WinnerRow {
  Scenario: string;
  "Winner by mean": string;
  "Winner by p99": string;
  "Winner by throughput": string;
}

export class HarnessMetrics {
  setupAllocations = 0;
  private nextEffectId = 1;
  private recomputes = 0;
  private refreshes = 0;
  private schedulerOps = 0;
  private stepAllocations = 0;
  private maxFlushLatencyMs = 0;
  private stepStartMs = -1;
  private uniqueDrainedEffects = new Set<number>();
  private enqueuedEffects = new Map<number, number>();
  private queueMetricsAvailable = false;
  private enqueueRepeats = 0;
  private dedupeHits = 0;
  private dedupeMisses = 0;
  private enqueueAllocations = 0;
  private drainAllocations = 0;

  allocateEffectId(): number {
    return this.nextEffectId++;
  }

  recordSetupAllocation(count = 1): void {
    this.setupAllocations += count;
  }

  recordStepAllocation(count = 1): void {
    this.stepAllocations += count;
  }

  recordRecompute(count = 1): void {
    this.recomputes += count;
  }

  recordRefresh(count = 1): void {
    this.refreshes += count;
  }

  recordSchedulerOp(count = 1): void {
    this.schedulerOps += count;
  }

  recordEffectRun(effectId: number, now = performance.now()): void {
    this.uniqueDrainedEffects.add(effectId);

    if (this.stepStartMs < 0) return;

    const latency = now - this.stepStartMs;
    if (latency > this.maxFlushLatencyMs) {
      this.maxFlushLatencyMs = latency;
    }
  }

  recordEnqueue(effectId: number, accepted: boolean): void {
    this.queueMetricsAvailable = true;

    const attempts = (this.enqueuedEffects.get(effectId) ?? 0) + 1;
    this.enqueuedEffects.set(effectId, attempts);

    if (attempts > 1) {
      ++this.enqueueRepeats;
    }

    if (accepted) {
      ++this.dedupeMisses;
    } else {
      ++this.dedupeHits;
    }
  }

  recordDrain(effectId: number): void {
    this.queueMetricsAvailable = true;
    this.uniqueDrainedEffects.add(effectId);
  }

  recordEnqueueAllocation(count = 1): void {
    this.queueMetricsAvailable = true;
    this.enqueueAllocations += count;
    this.recordStepAllocation(count);
  }

  recordDrainAllocation(count = 1): void {
    this.queueMetricsAvailable = true;
    this.drainAllocations += count;
    this.recordStepAllocation(count);
  }

  beginStep(): void {
    this.stepStartMs = performance.now();
  }

  resetRunMetrics(): void {
    this.recomputes = 0;
    this.refreshes = 0;
    this.schedulerOps = 0;
    this.stepAllocations = 0;
    this.maxFlushLatencyMs = 0;
    this.stepStartMs = -1;
    this.uniqueDrainedEffects.clear();
    this.enqueuedEffects.clear();
    this.queueMetricsAvailable = false;
    this.enqueueRepeats = 0;
    this.dedupeHits = 0;
    this.dedupeMisses = 0;
    this.enqueueAllocations = 0;
    this.drainAllocations = 0;
  }

  endStep(wallTimeMs: number): StepMetrics {
    const snapshot: StepMetrics = {
      wallTimeMs,
      recomputes: this.recomputes,
      refreshes: this.refreshes,
      schedulerOps: this.schedulerOps,
      stepAllocations: this.stepAllocations,
      maxFlushLatencyMs: this.maxFlushLatencyMs,
      uniqueDrainedEffects: this.uniqueDrainedEffects.size,
      enqueueRepeats: this.queueMetricsAvailable ? this.enqueueRepeats : null,
      dedupeHits: this.queueMetricsAvailable ? this.dedupeHits : null,
      dedupeMisses: this.queueMetricsAvailable ? this.dedupeMisses : null,
      enqueueAllocations: this.queueMetricsAvailable
        ? this.enqueueAllocations
        : null,
      drainAllocations: this.queueMetricsAvailable
        ? this.drainAllocations
        : null,
    };

    this.resetRunMetrics();
    return snapshot;
  }
}

let sinkAcc = 0;

export function blackhole(value: number): void {
  sinkAcc = (sinkAcc * 100_019 + (value | 0)) | 0;
}

export function createRng(seed: number) {
  let state = seed | 0;

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(max: number) {
      return Math.floor(next() * max);
    },
    centered(max: number) {
      return next() * max * 2 - max;
    },
  };
}

export function createUniqueIndexSampler(max: number) {
  const marks = new Uint32Array(max);
  let epoch = 0;

  return (
    count: number,
    rng: ReturnType<typeof createRng>,
    out: number[],
  ): readonly number[] => {
    if (++epoch === 0) {
      marks.fill(0);
      epoch = 1;
    }

    out.length = 0;

    while (out.length < count) {
      const index = rng.int(max);
      if (marks[index] === epoch) continue;
      marks[index] = epoch;
      out.push(index);
    }

    return out;
  };
}

function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function formatOptional(
  value: number | null,
  digits = 2,
): string {
  return value === null ? "-" : formatNumber(value, digits);
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );

  return sorted[index]!;
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`Missing item at index ${index}`);
  }
  return value;
}

function createRunner(
  variant: BenchVariant,
  scenario: ScenarioDefinition,
  seed: number,
) {
  const harness = variant.createHarness();
  const instance = scenario.build(harness, seed);

  harness.flush();
  harness.resetRunMetrics();

  return {
    label: variant.label,
    setupAllocations: harness.metrics.setupAllocations,
    runStep() {
      harness.beginStep();
      const startedAt = performance.now();
      instance.runStep();
      return harness.endStep(performance.now() - startedAt);
    },
    dispose() {
      harness.dispose();
    },
  };
}

function measureScenario(
  variant: BenchVariant,
  scenario: ScenarioDefinition,
  seed: number,
): ScenarioMeasurement {
  const runner = createRunner(variant, scenario, seed);
  const measuredIterations = scenario.bench.iterations;

  let wallTimeMs = 0;
  const wallTimes: number[] = [];
  let recomputes = 0;
  let refreshes = 0;
  let schedulerOps = 0;
  let uniqueDrainedEffects = 0;
  let enqueueRepeats = 0;
  let dedupeHits = 0;
  let dedupeMisses = 0;
  let enqueueAllocations = 0;
  let drainAllocations = 0;
  let stepAllocations = 0;
  let maxFlushLatencyMs = 0;
  let hasQueueMetrics = false;

  try {
    for (
      let iteration = 0;
      iteration < scenario.bench.warmupIterations;
      ++iteration
    ) {
      runner.runStep();
    }

    for (
      let iteration = 0;
      iteration < measuredIterations;
      ++iteration
    ) {
      const step = runner.runStep();
      wallTimeMs += step.wallTimeMs;
      wallTimes.push(step.wallTimeMs);
      recomputes += step.recomputes;
      refreshes += step.refreshes;
      schedulerOps += step.schedulerOps;
      uniqueDrainedEffects += step.uniqueDrainedEffects;
      if (step.enqueueRepeats !== null) {
        hasQueueMetrics = true;
        enqueueRepeats += step.enqueueRepeats;
      }
      if (step.dedupeHits !== null) {
        hasQueueMetrics = true;
        dedupeHits += step.dedupeHits;
      }
      if (step.dedupeMisses !== null) {
        hasQueueMetrics = true;
        dedupeMisses += step.dedupeMisses;
      }
      if (step.enqueueAllocations !== null) {
        hasQueueMetrics = true;
        enqueueAllocations += step.enqueueAllocations;
      }
      if (step.drainAllocations !== null) {
        hasQueueMetrics = true;
        drainAllocations += step.drainAllocations;
      }
      stepAllocations += step.stepAllocations;
      if (step.maxFlushLatencyMs > maxFlushLatencyMs) {
        maxFlushLatencyMs = step.maxFlushLatencyMs;
      }
    }
  } finally {
    runner.dispose();
  }

  const meanMs = wallTimeMs / measuredIterations;
  const p75Ms = percentile(wallTimes, 0.75);
  const p99Ms = percentile(wallTimes, 0.99);
  const throughputHz = meanMs === 0 ? 0 : 1000 / meanMs;
  const avgUniqueDrains = uniqueDrainedEffects / measuredIterations;
  const repeatPerWatcher =
    hasQueueMetrics && avgUniqueDrains > 0
      ? enqueueRepeats / uniqueDrainedEffects
      : null;

  return {
    variant: variant.label,
    meanMs,
    p99Ms,
    throughputHz,
    row: {
      variant: variant.label,
      "mean ms": formatNumber(meanMs, 3),
      "p75 ms": formatNumber(p75Ms, 3),
      "p99 ms": formatNumber(p99Ms, 3),
      "throughput hz": formatNumber(throughputHz, 2),
      "recompute/step": formatNumber(recomputes / measuredIterations, 1),
      "refresh/step": formatNumber(refreshes / measuredIterations, 1),
      "scheduler/step": formatNumber(schedulerOps / measuredIterations, 1),
      "drain uniq/step": formatNumber(avgUniqueDrains, 1),
      "enq repeat/w": formatOptional(repeatPerWatcher, 2),
      "dedupe hit/step": formatOptional(
        hasQueueMetrics ? dedupeHits / measuredIterations : null,
        1,
      ),
      "dedupe miss/step": formatOptional(
        hasQueueMetrics ? dedupeMisses / measuredIterations : null,
        1,
      ),
      "enq alloc/step": formatOptional(
        hasQueueMetrics ? enqueueAllocations / measuredIterations : null,
        1,
      ),
      "drain alloc/step": formatOptional(
        hasQueueMetrics ? drainAllocations / measuredIterations : null,
        1,
      ),
      "setup allocs": String(runner.setupAllocations),
      "step allocs/step": formatNumber(stepAllocations / measuredIterations, 1),
      "max flush ms": formatNumber(maxFlushLatencyMs, 3),
    },
  };
}

function logScenarioSummary(
  libraryName: string,
  scenario: ScenarioDefinition,
  rows: readonly SummaryRow[],
): void {
  console.log(
    `\n[bench:${libraryName}] ${scenario.title} (${scenario.id}) metrics`,
  );
  console.table(rows);
}

function mergeBenchmarkResult(
  measured: ScenarioMeasurement,
  benchmark: BenchmarkResult | undefined,
): ScenarioMeasurement {
  if (benchmark === undefined) {
    return measured;
  }

  const p75Ms =
    benchmark.samples.length > 0
      ? percentile(benchmark.samples, 0.75)
      : benchmark.p75;

  return {
    variant: measured.variant,
    meanMs: benchmark.mean,
    p99Ms: benchmark.p99,
    throughputHz: benchmark.hz,
    row: {
      ...measured.row,
      "mean ms": formatNumber(benchmark.mean, 3),
      "p75 ms": formatNumber(p75Ms, 3),
      "p99 ms": formatNumber(benchmark.p99, 3),
      "throughput hz": formatNumber(benchmark.hz, 2),
    },
  };
}

function formatWinner(
  measurement: ScenarioMeasurement,
  value: number,
  unit: string,
): string {
  return `${measurement.variant} (${formatNumber(value, 3)} ${unit})`;
}

function pickWinner(
  rows: readonly ScenarioMeasurement[],
  select: (row: ScenarioMeasurement) => number,
  preferLower: boolean,
): ScenarioMeasurement {
  let winner = rows[0]!;
  let winnerValue = select(winner);

  for (let index = 1; index < rows.length; ++index) {
    const candidate = rows[index]!;
    const candidateValue = select(candidate);
    if (preferLower ? candidateValue < winnerValue : candidateValue > winnerValue) {
      winner = candidate;
      winnerValue = candidateValue;
    }
  }

  return winner;
}

function createWinnerRow(
  scenario: ScenarioDefinition,
  rows: readonly ScenarioMeasurement[],
): WinnerRow {
  const meanWinner = pickWinner(rows, (row) => row.meanMs, true);
  const p99Winner = pickWinner(rows, (row) => row.p99Ms, true);
  const throughputWinner = pickWinner(rows, (row) => row.throughputHz, false);

  return {
    Scenario: scenario.title,
    "Winner by mean": formatWinner(meanWinner, meanWinner.meanMs, "ms"),
    "Winner by p99": formatWinner(p99Winner, p99Winner.p99Ms, "ms"),
    "Winner by throughput": formatWinner(
      throughputWinner,
      throughputWinner.throughputHz,
      "hz",
    ),
  };
}

function logWinnerSummary(
  libraryName: string,
  rows: readonly WinnerRow[],
): void {
  console.log(`\n[bench:${libraryName}] Winner by scenario`);
  console.table(rows);
}

export function registerBenchFile(
  libraryName: string,
  variants: readonly BenchVariant[],
): void {
  const collectedScenarios: Array<{
    measuredRows: readonly ScenarioMeasurement[];
    runners: Array<ReturnType<typeof createRunner>>;
    scenario: ScenarioDefinition;
    suite: {
      suite?: {
        tasks: Array<{
          meta?: { benchmark?: boolean };
          name: string;
          result?: { benchmark?: BenchmarkResult };
        }>;
      };
    };
  }> = [];

  for (
    let scenarioIndex = 0;
    scenarioIndex < GRAPH_SCENARIOS.length;
    ++scenarioIndex
  ) {
    const scenario = GRAPH_SCENARIOS[scenarioIndex]!;
    const measuredRows = variants.map((variant, variantIndex) =>
      measureScenario(
        variant,
        scenario,
        0xa000 + scenarioIndex * 193 + variantIndex * 17,
      ),
    );

    const runners = variants.map((variant, variantIndex) =>
      createRunner(
        variant,
        scenario,
        0xa000 + scenarioIndex * 193 + variantIndex * 17,
      ),
    );

    const suite = describe(`${libraryName}: ${scenario.title}`, () => {
      for (const runner of runners) {
        bench(
          runner.label,
          () => {
            runner.runStep();
          },
          scenario.bench,
        );
      }
    });

    collectedScenarios[scenarioIndex] = {
      measuredRows,
      runners,
      scenario,
      suite,
    };
  }

  afterAll(() => {
    const winnerRows: WinnerRow[] = [];

    for (let index = 0; index < collectedScenarios.length; ++index) {
      const collected = collectedScenarios[index];
      if (collected === undefined) continue;

      const benchmarks = new Map<string, BenchmarkResult>();
      const tasks = collected.suite.suite?.tasks ?? [];

      for (let taskIndex = 0; taskIndex < tasks.length; ++taskIndex) {
        const task = tasks[taskIndex];
        if (task?.meta?.benchmark !== true) continue;
        if (task.result?.benchmark === undefined) continue;
        benchmarks.set(task.name, task.result.benchmark);
      }

      const finalRows = collected.measuredRows.map((row) =>
        mergeBenchmarkResult(row, benchmarks.get(row.variant)),
      );

      logScenarioSummary(
        libraryName,
        collected.scenario,
        finalRows.map((row) => row.row),
      );
      winnerRows.push(createWinnerRow(collected.scenario, finalRows));

      for (let runnerIndex = 0; runnerIndex < collected.runners.length; ++runnerIndex) {
        collected.runners[runnerIndex]!.dispose();
      }
    }

    logWinnerSummary(
      libraryName,
      winnerRows,
    );
  });
}

const GRAPH_SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: "linear-chain",
    title: "Linear chain",
    bench: { iterations: 220, warmupIterations: 40 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [source, setSource] = harness.signal(1, "chain:source");
      const layers: Read[] = [];
      let current = source;

      for (let depth = 0; depth < 192; ++depth) {
        const previous = current;
        current = harness.memo(
          () => previous() + ((depth & 3) + 1),
          `chain:memo:${depth}`,
        );
        layers.push(current);

        if ((depth + 1) % 48 === 0) {
          harness.effect(() => at(layers, depth)(), {
            label: `chain:tap:${depth}`,
            priority: depth + 1,
          });
        }
      }

      harness.effect(() => current(), { label: "chain:tail", priority: 256 });

      return {
        runStep() {
          setSource(source() + 1 + rng.int(3));
          harness.flush();
        },
      };
    },
  },
  {
    id: "wide-fan-out",
    title: "Wide fan-out",
    bench: { iterations: 180, warmupIterations: 35 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [source, setSource] = harness.signal(3, "fanout:source");
      const leaves = Array.from({ length: 192 }, (_, index) =>
        harness.memo(
          () => source() * ((index % 7) + 1) + index,
          `fanout:leaf:${index}`,
        ),
      );
      const aggregate = harness.memo(() => {
        let total = 0;
        for (let index = 0; index < leaves.length; ++index) {
          total += at(leaves, index)();
        }
        return total;
      }, "fanout:aggregate");

      for (let index = 0; index < leaves.length; index += 48) {
        harness.effect(() => at(leaves, index)(), {
          label: `fanout:tap:${index}`,
          priority: 96 + index,
        });
      }

      harness.effect(() => aggregate(), {
        label: "fanout:aggregate-effect",
        priority: 384,
      });

      return {
        runStep() {
          setSource(source() + 1 + rng.int(5));
          harness.flush();
        },
      };
    },
  },
  {
    id: "diamond-shared-deps",
    title: "Diamond / shared deps",
    bench: { iterations: 190, warmupIterations: 35 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [left, setLeft] = harness.signal(1, "diamond:left");
      const [right, setRight] = harness.signal(10, "diamond:right");
      const sharedSum = harness.memo(() => left() + right(), "diamond:sum");
      const sharedDiff = harness.memo(() => left() - right(), "diamond:diff");
      const branches = Array.from({ length: 96 }, (_, index) =>
        harness.memo(
          () =>
            ((index & 1) === 0 ? sharedSum() : sharedDiff()) *
            ((index % 5) + 1),
          `diamond:branch:${index}`,
        ),
      );
      const join = harness.memo(() => {
        let total = 0;
        for (let index = 0; index < branches.length; ++index) {
          total += at(branches, index)();
        }
        return total;
      }, "diamond:join");

      harness.effect(() => sharedSum(), {
        label: "diamond:sum-effect",
        priority: 64,
      });
      harness.effect(() => sharedDiff(), {
        label: "diamond:diff-effect",
        priority: 64,
      });

      for (let index = 0; index < branches.length; index += 32) {
        harness.effect(() => at(branches, index)(), {
          label: `diamond:branch-effect:${index}`,
          priority: 128 + index,
        });
      }

      harness.effect(() => join(), {
        label: "diamond:join-effect",
        priority: 320,
      });

      return {
        runStep() {
          let nextRight = right();

          harness.batch(() => {
            if ((rng.int(4) & 1) === 0) {
              setLeft(left() + 1 + rng.int(3));
            } else {
              nextRight += 1 + rng.int(5);
              setRight(nextRight);
            }

            if (rng.int(3) === 0) {
              nextRight += 1;
              setRight(nextRight);
            }
          });
          harness.flush();
        },
      };
    },
  },
  {
    id: "dynamic-deps",
    title: "Dynamic deps",
    bench: { iterations: 150, warmupIterations: 30 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [selector, setSelector] = harness.signal(0, "dynamic:selector");
      const sources = Array.from({ length: 18 }, (_, index) =>
        harness.signal(index * 3, `dynamic:source:${index}`),
      );
      const branches = Array.from({ length: 72 }, (_, branchIndex) =>
        harness.memo(() => {
          const mode = selector() % 3;
          let total = 0;

          for (let offset = 0; offset < 4; ++offset) {
            const sourceIndex =
              (branchIndex * 5 + offset + mode * 7) % sources.length;
            total += at(sources, sourceIndex)[0]();
          }

          return total;
        }, `dynamic:branch:${branchIndex}`),
      );
      const aggregate = harness.memo(() => {
        let total = selector();
        for (let index = 0; index < branches.length; ++index) {
          total += at(branches, index)();
        }
        return total;
      }, "dynamic:aggregate");

      for (let index = 0; index < branches.length; index += 24) {
        harness.effect(() => at(branches, index)(), {
          label: `dynamic:branch-effect:${index}`,
          priority: 96 + index,
        });
      }

      harness.effect(() => aggregate(), {
        label: "dynamic:aggregate-effect",
        priority: 320,
      });

      return {
        runStep() {
          harness.batch(() => {
            setSelector((selector() + 1) % 3);

            const firstIndex = rng.int(sources.length);
            const secondIndex = (firstIndex + 5 + rng.int(5)) % sources.length;

            const [firstRead, firstWrite] = at(sources, firstIndex);
            const [secondRead, secondWrite] = at(sources, secondIndex);

            firstWrite(firstRead() + 1 + rng.int(4));
            secondWrite(secondRead() + rng.centered(3));
          });
          harness.flush();
        },
      };
    },
  },
  {
    id: "many-effects-one-source",
    title: "Many effects from one source",
    bench: { iterations: 210, warmupIterations: 40 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [source, setSource] = harness.signal(1, "effects:source");
      const doubled = harness.memo(() => source() * 2, "effects:doubled");

      for (let index = 0; index < 96; ++index) {
        harness.effect(
          () => ((index & 1) === 0 ? source() + index : doubled() + index * 3),
          { label: `effects:sink:${index}`, priority: index },
        );
      }

      return {
        runStep() {
          setSource(source() + 1 + rng.int(4));
          harness.flush();
        },
      };
    },
  },
  {
    id: "many-sources-one-sink",
    title: "Many sources into one computed/effect",
    bench: { iterations: 140, warmupIterations: 28 },
    build(harness, seed) {
      const rng = createRng(seed);
      const sampler = createUniqueIndexSampler(128);
      const touched: number[] = [];
      const sources = Array.from({ length: 128 }, (_, index) =>
        harness.signal(index, `fanin:source:${index}`),
      );
      const total = harness.memo(() => {
        let sum = 0;
        for (let index = 0; index < sources.length; ++index) {
          sum += at(sources, index)[0]();
        }
        return sum;
      }, "fanin:total");

      harness.effect(() => total(), {
        label: "fanin:total-effect",
        priority: 512,
      });
      harness.effect(
        () => {
          let sum = 0;
          for (let index = 0; index < sources.length; index += 16) {
            sum += at(sources, index)[0]();
          }
          return sum;
        },
        { label: "fanin:direct-effect", priority: 256 },
      );

      return {
        runStep() {
          harness.batch(() => {
            for (const index of sampler(8, rng, touched)) {
              const [read, write] = at(sources, index);
              write(read() + Math.trunc(rng.centered(6)));
            }
          });
          harness.flush();
        },
      };
    },
  },
  {
    id: "mixed-graph-burst-effects",
    title: "Mixed: graph updates + burst of effects",
    bench: { iterations: 140, warmupIterations: 28 },
    build(harness, seed) {
      const rng = createRng(seed);
      const sampler = createUniqueIndexSampler(24);
      const touched: number[] = [];
      const sources = Array.from({ length: 24 }, (_, index) =>
        harness.signal(index * 2, `mixed:source:${index}`),
      );
      const branches = Array.from({ length: 48 }, (_, branchIndex) =>
        harness.memo(() => {
          let total = 0;
          for (let offset = 0; offset < 3; ++offset) {
            const sourceIndex = (branchIndex * 3 + offset * 5) % sources.length;
            total += at(sources, sourceIndex)[0]();
          }
          return total + branchIndex;
        }, `mixed:branch:${branchIndex}`),
      );
      const aggregate = harness.memo(() => {
        let total = 0;
        for (let index = 0; index < branches.length; ++index) {
          total += at(branches, index)();
        }
        return total;
      }, "mixed:aggregate");

      harness.effect(() => aggregate(), {
        label: "mixed:aggregate-effect",
        priority: 320,
      });

      for (let index = 0; index < 24; ++index) {
        harness.effect(
          () => aggregate() + at(branches, index * 2)(),
          { label: `mixed:burst:${index}`, priority: 96 + index },
        );
      }

      return {
        runStep() {
          harness.batch(() => {
            for (const index of sampler(4, rng, touched)) {
              const [read, write] = at(sources, index);
              write(read() + 1 + rng.int(6));
            }
          });
          harness.flush();
        },
      };
    },
  },
  {
    id: "coalesced-writes-before-drain",
    title: "Mixed: coalesced multiple writes before drain",
    bench: { iterations: 150, warmupIterations: 30 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [left, setLeft] = harness.signal(5, "coalesce:left");
      const [right, setRight] = harness.signal(9, "coalesce:right");
      const [gate, setGate] = harness.signal(0, "coalesce:gate");
      const branches = Array.from({ length: 64 }, (_, branchIndex) =>
        harness.memo(() => {
          const chooseLeft = ((gate() + branchIndex) & 1) === 0;
          const base = chooseLeft ? left() : right();
          return base * ((branchIndex % 4) + 1) + gate();
        }, `coalesce:branch:${branchIndex}`),
      );
      const aggregate = harness.memo(() => {
        let total = 0;
        for (let index = 0; index < branches.length; ++index) {
          total += at(branches, index)();
        }
        return total;
      }, "coalesce:aggregate");

      harness.effect(() => aggregate(), {
        label: "coalesce:aggregate-effect",
        priority: 256,
      });
      for (let index = 0; index < branches.length; index += 16) {
        harness.effect(() => at(branches, index)(), {
          label: `coalesce:branch-effect:${index}`,
          priority: 96 + index,
        });
      }

      return {
        runStep() {
          let nextLeft = left();
          let nextRight = right();
          let nextGate = gate();

          harness.batch(() => {
            for (let burst = 0; burst < 6; ++burst) {
              if ((burst & 1) === 0) {
                nextLeft += 1 + rng.int(3);
                setLeft(nextLeft);
              } else {
                nextRight += 1 + rng.int(4);
                setRight(nextRight);
              }

              if (burst % 3 === 0) {
                nextGate = (nextGate + 1) % 2;
                setGate(nextGate);
              }
            }
          });
          harness.flush();
        },
      };
    },
  },
  {
    id: "effects-reread-shared-subgraphs",
    title: "Mixed: effects re-read large shared subgraphs",
    bench: { iterations: 130, warmupIterations: 26 },
    build(harness, seed) {
      const rng = createRng(seed);
      const sampler = createUniqueIndexSampler(40);
      const touched: number[] = [];
      const sources = Array.from({ length: 40 }, (_, index) =>
        harness.signal(index, `shared:source:${index}`),
      );
      const leaves = Array.from({ length: 32 }, (_, leafIndex) =>
        harness.memo(() => {
          let total = 0;
          for (let offset = 0; offset < 4; ++offset) {
            const sourceIndex =
              (leafIndex * 7 + offset * 3 + offset) % sources.length;
            total += at(sources, sourceIndex)[0]();
          }
          return total + leafIndex;
        }, `shared:leaf:${leafIndex}`),
      );
      const shared = harness.memo(() => {
        let total = 0;
        for (let index = 0; index < leaves.length; ++index) {
          total += at(leaves, index)();
        }
        return total;
      }, "shared:aggregate");

      for (let index = 0; index < 24; ++index) {
        harness.effect(
          () => shared() + at(leaves, index % leaves.length)(),
          { label: `shared:effect:${index}`, priority: 128 + index },
        );
      }

      return {
        runStep() {
          harness.batch(() => {
            for (const index of sampler(3, rng, touched)) {
              const [read, write] = at(sources, index);
              write(read() + 1 + rng.int(5));
            }
          });
          harness.flush();
        },
      };
    },
  },
];
