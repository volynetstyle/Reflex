import { bench, describe } from "vitest";

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
  counters?: IterationCounters;
  runtimeCounters?: RuntimeProfileCounters;
  policyCounters?: SchedulerPolicyCounters;
}

export type RuntimeProfileCounters = Record<string, number>;

export interface SchedulerPolicyCounters {
  batchExit: number;
  flushCalled: number;
  flushReturnedEmpty: number;
  settleCalled: number;
  schedulerQueueChecked: number;
  effectsScheduled: number;
  effectsRun: number;
  pendingWatcherChecks: number;
}

export interface IterationCounters {
  writes: number;
  notifyWatcherCount: number;
  enqueueCount: number;
  recomputeDoubledCount: number;
  propagateOnceDoubledCount: number;
  invalidateSubCount: number;
  invalidateSubZeroCount: number;
  walkLineClean: number;
  walkLineDirty: number;
  walkLineBail: number;
  walkBranchCount: number;
}

export interface BenchHarness {
  readonly metrics: HarnessMetrics;
  signal(initial: number, label?: string): readonly [Read, Write];
  memo(fn: () => number, label?: string): Read;
  effect(read: Read, meta?: EffectMeta): () => void;
  batch<T>(fn: () => T): T;
  flush(): void;
  resetRunMetrics(): void;
  resetPolicyCounters(): void;
  setPolicyCountersEnabled(enabled: boolean): void;
  readPolicyCounters(): SchedulerPolicyCounters | undefined;
  resetRuntimeProfileCounters(): void;
  setRuntimeProfilingEnabled(enabled: boolean): void;
  readRuntimeProfileCounters(): RuntimeProfileCounters | undefined;
  beginStep(now: number): void;
  endStep(wallTimeMs: number): StepMetrics;
  dispose(): void;
}

export interface BenchVariant {
  label: string;
  createHarness(): BenchHarness;
}

interface ScenarioInstance {
  runStep(): void;
  validate?(): void;
  setCaptureCounters?(enabled: boolean): void;
  readIterationCounters?(): IterationCounters | undefined;
}

interface ScenarioDefinition {
  id: string;
  title: string;
  sampleIterations: number;
  sampleWarmupIterations?: number;
  bench: {
    iterations: number;
    warmupIterations: number;
  };
  build(harness: BenchHarness, seed: number): ScenarioInstance;
}

interface SummaryRow {
  variant: string;
  "sample ms/step": string;
  "order spread %": string;
  "recompute/step": string;
  "advance/step": string;
  "scheduler/step": string;
  "setup allocs": string;
  "step allocs/step": string;
  "max flush ms": string;
  "heap delta kb": string;
  "heap peak kb": string;
  note: string;
}

export class HarnessMetrics {
  enabled = true;
  setupAllocations = 0;
  recomputes = 0;
  refreshes = 0;
  schedulerOps = 0;
  stepAllocations = 0;
  maxFlushLatencyMs = 0;
  stepStartMs = -1;

  recordSetupAllocation(count = 1): void {
    if (!this.enabled) return;
    this.setupAllocations += count;
  }

  recordStepAllocation(count = 1): void {
    if (!this.enabled) return;
    this.stepAllocations += count;
  }

  recordRecompute(count = 1): void {
    if (!this.enabled) return;
    this.recomputes += count;
  }

  recordRefresh(count = 1): void {
    if (!this.enabled) return;
    this.refreshes += count;
  }

  recordSchedulerOp(count = 1): void {
    if (!this.enabled) return;
    this.schedulerOps += count;
  }

  recordEffectRun(now?: number): void {
    if (!this.enabled) return;
    this.schedulerOps += 1;

    const start = this.stepStartMs;
    if (start < 0) return;

    const latency = (now ?? performance.now()) - start;
    if (latency > this.maxFlushLatencyMs) {
      this.maxFlushLatencyMs = latency;
    }
  }

  // FIX: accepts externally-snapped timestamp so sample and step share one clock call
  beginStep(now: number): void {
    if (!this.enabled) return;
    this.stepStartMs = now;
  }

  resetRunMetrics(): void {
    this.recomputes = 0;
    this.refreshes = 0;
    this.schedulerOps = 0;
    this.stepAllocations = 0;
    this.maxFlushLatencyMs = 0;
    this.stepStartMs = -1;
  }

  endStep(wallTimeMs: number): StepMetrics {
    const snapshot: StepMetrics = {
      wallTimeMs,
      recomputes: this.recomputes,
      refreshes: this.refreshes,
      schedulerOps: this.schedulerOps,
      stepAllocations: this.stepAllocations,
      maxFlushLatencyMs: this.maxFlushLatencyMs,
    };
    this.resetRunMetrics();
    return snapshot;
  }
}

let sinkAcc = 0;

export function blackhole(value: number): void {
  sinkAcc = (Math.imul(sinkAcc, 100_019) + (value | 0)) | 0;
}

export function createRng(seed: number) {
  let state = seed | 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(max: number): number {
      return (next() * max) | 0;
    },
    centered(max: number): number {
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
    if (epoch === 0xffffffff) {
      marks.fill(0);
      epoch = 0;
    }
    epoch += 1;

    let len = 0;

    while (len < count) {
      const index = (rng.next() * max) | 0;
      if (marks[index] === epoch) continue;
      marks[index] = epoch;
      out[len++] = index;
    }

    out.length = len;
    return out;
  };
}

function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

type GcFn = () => void;

function getGc(): GcFn | undefined {
  const maybeGc = (globalThis as { gc?: GcFn }).gc;
  return typeof maybeGc === "function" ? maybeGc : undefined;
}

function readHeapUsed(): number | undefined {
  const maybeProcess = (
    globalThis as {
      process?: { memoryUsage?: () => { heapUsed: number } };
    }
  ).process;
  return maybeProcess?.memoryUsage?.().heapUsed;
}

function formatKilobytes(value: number | undefined): string {
  return value === undefined ? "n/a" : formatNumber(value / 1024, 1);
}

function compactCounters(
  counters: RuntimeProfileCounters,
): RuntimeProfileCounters {
  const compact: RuntimeProfileCounters = {};

  for (const [name, value] of Object.entries(counters)) {
    if (value !== 0) compact[name] = value;
  }

  return compact;
}

interface Runner {
  label: string;
  setupAllocations: number;
  runMeasuredStep(): StepMetrics;
  runBenchStep(): void;
  dispose(): void;
}

function createRunner(
  variant: BenchVariant,
  scenario: ScenarioDefinition,
  seed: number,
  captureCounters: boolean,
): Runner {
  const harness = variant.createHarness();
  // FIX: metrics are NEVER on during timing — only enabled for counter capture pass
  harness.metrics.enabled = false;

  // Enable metrics only during graph construction (setup allocations)
  harness.metrics.enabled = true;
  harness.metrics.setupAllocations = 0;
  const instance = scenario.build(harness, seed);
  instance.setCaptureCounters?.(captureCounters);
  harness.flush();

  const setupAllocations = harness.metrics.setupAllocations;

  // Turn metrics off before any timing measurements
  harness.metrics.enabled = false;
  instance.validate?.();
  harness.resetRunMetrics();

  return {
    label: variant.label,
    setupAllocations,
    runMeasuredStep(): StepMetrics {
      // FIX: single timestamp shared by both the wall-clock measurement and
      // HarnessMetrics.beginStep — eliminates the two-syscall drift
      const now = performance.now();
      harness.metrics.enabled = false; // timing pass: no metrics overhead
      harness.beginStep(now);
      instance.runStep();
      const wallTimeMs = performance.now() - now;
      const step = harness.endStep(wallTimeMs);

      // FIX: validate AFTER timing is captured so it never inflates ms/step
      instance.validate?.();

      // Separate counter-capture pass (metrics on, no timing)
      if (captureCounters) {
        instance.setCaptureCounters?.(true);
        harness.resetRuntimeProfileCounters();
        harness.setRuntimeProfilingEnabled(true);
        harness.resetPolicyCounters();
        harness.setPolicyCountersEnabled(true);
        harness.metrics.enabled = true;
        harness.resetRunMetrics();
        instance.runStep();
        step.counters = instance.readIterationCounters?.();
        step.runtimeCounters = harness.readRuntimeProfileCounters();
        step.policyCounters = harness.readPolicyCounters();
        harness.metrics.enabled = false;
        harness.setRuntimeProfilingEnabled(false);
        harness.setPolicyCountersEnabled(false);
        instance.setCaptureCounters?.(false);
      }

      return step;
    },
    runBenchStep(): void {
      blackhole(0); // prevent dead-code elimination of the bench itself
      instance.runStep();
    },
    dispose(): void {
      harness.setRuntimeProfilingEnabled(false);
      harness.setPolicyCountersEnabled(false);
      harness.dispose();
    },
  };
}

function sampleScenario(
  variant: BenchVariant,
  scenario: ScenarioDefinition,
  // FIX: seed is now per-scenario, not per-variant — all variants get identical workload
  seed: number,
  orderSpreadPct?: number,
): SummaryRow {
  const runner = createRunner(variant, scenario, seed, true);

  let wallTimeMs = 0;
  let recomputes = 0;
  let refreshes = 0;
  let schedulerOps = 0;
  let stepAllocations = 0;
  let maxFlushLatencyMs = 0;
  let heapPeak = 0;
  let iterationCounters: IterationCounters | undefined;
  let runtimeCounters: RuntimeProfileCounters | undefined;
  let policyCounters: SchedulerPolicyCounters | undefined;
  let heapBefore: number | undefined;
  let heapAfter: number | undefined;

  try {
    const warmupIterations =
      scenario.sampleWarmupIterations ?? scenario.bench.warmupIterations;
    for (let i = 0; i < warmupIterations; ++i) {
      runner.runBenchStep();
    }

    getGc()?.();
    heapBefore = readHeapUsed();
    heapPeak = heapBefore ?? 0;

    const n = scenario.sampleIterations;
    for (let i = 0; i < n; ++i) {
      const step = runner.runMeasuredStep();
      wallTimeMs += step.wallTimeMs;
      recomputes += step.recomputes;
      refreshes += step.refreshes;
      schedulerOps += step.schedulerOps;
      stepAllocations += step.stepAllocations;
      iterationCounters ??= step.counters;
      runtimeCounters ??= step.runtimeCounters;
      policyCounters ??= step.policyCounters;
      if (step.maxFlushLatencyMs > maxFlushLatencyMs) {
        maxFlushLatencyMs = step.maxFlushLatencyMs;
      }
      const heapUsed = readHeapUsed();
      if (heapUsed !== undefined && heapUsed > heapPeak) {
        heapPeak = heapUsed;
      }
    }

    heapAfter = readHeapUsed();
  } finally {
    runner.dispose();
  }

  const inv = 1 / scenario.sampleIterations;
  const heapDelta =
    heapBefore === undefined || heapAfter === undefined
      ? undefined
      : heapAfter - heapBefore;
  const heapPeakDelta =
    heapBefore === undefined || heapPeak === 0
      ? undefined
      : heapPeak - heapBefore;

  if (iterationCounters !== undefined) {
    console.log(
      `\n[bench:${variant.label}] ${scenario.id} one-iteration counters`,
    );
    console.table([iterationCounters]);
  }

  if (policyCounters !== undefined) {
    console.log(
      `\n[bench:${variant.label}] ${scenario.id} one-iteration policy counters`,
    );
    console.table([policyCounters]);
  }

  if (runtimeCounters !== undefined) {
    console.log(
      `\n[bench:${variant.label}] ${scenario.id} one-iteration runtime counters`,
    );
    console.table([compactCounters(runtimeCounters)]);
  }

  return {
    variant: variant.label,
    "sample ms/step": formatNumber(wallTimeMs * inv, 3),
    "order spread %":
      orderSpreadPct === undefined ? "n/a" : formatNumber(orderSpreadPct, 1),
    "recompute/step": formatNumber(recomputes * inv, 1),
    "advance/step": formatNumber(refreshes * inv, 1),
    "scheduler/step": formatNumber(schedulerOps * inv, 1),
    "setup allocs": String(runner.setupAllocations),
    "step allocs/step": formatNumber(stepAllocations * inv, 1),
    "max flush ms": formatNumber(maxFlushLatencyMs, 3),
    "heap delta kb": formatKilobytes(heapDelta),
    "heap peak kb": formatKilobytes(heapPeakDelta),
    note:
      orderSpreadPct !== undefined && orderSpreadPct > 15
        ? "order-sensitive"
        : "",
  };
}

function measureScenarioWallTimeMs(
  variant: BenchVariant,
  scenario: ScenarioDefinition,
  seed: number,
): number {
  const runner = createRunner(variant, scenario, seed, false);
  let wallTimeMs = 0;

  try {
    const warmupIterations =
      scenario.sampleWarmupIterations ?? scenario.bench.warmupIterations;
    for (let i = 0; i < warmupIterations; ++i) {
      runner.runBenchStep();
    }

    for (let i = 0; i < scenario.sampleIterations; ++i) {
      wallTimeMs += runner.runMeasuredStep().wallTimeMs;
    }
  } finally {
    runner.dispose();
  }

  return wallTimeMs / scenario.sampleIterations;
}

function sampleOrderSpreadPct(
  variant: BenchVariant,
  scenario: ScenarioDefinition,
  seed: number,
): number {
  getGc()?.();
  const first = measureScenarioWallTimeMs(variant, scenario, seed);
  getGc()?.();
  const second = measureScenarioWallTimeMs(variant, scenario, seed);
  const mean = (first + second) / 2;
  return mean === 0 ? 0 : (Math.abs(first - second) / mean) * 100;
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

export function registerBenchFile(
  libraryName: string,
  variants: readonly BenchVariant[],
): void {
  const scenarioCount = GRAPH_SCENARIOS.length;
  const variantCount = variants.length;

  for (let si = 0; si < scenarioCount; ++si) {
    const scenario = GRAPH_SCENARIOS[si]!;

    // FIX: one seed per scenario — identical across all variants so they perform
    // exactly the same sequence of writes, branch choices, and deltas
    const scenarioSeed = 0xa000 + si * 193;

    const sampleRows: SummaryRow[] = new Array(variantCount);
    for (let vi = 0; vi < variantCount; ++vi) {
      const variant = variants[vi]!;
      const spreadSeed = scenarioSeed + 0x4000;
      const orderSpreadPct =
        variantCount > 1
          ? sampleOrderSpreadPct(variant, scenario, spreadSeed)
          : undefined;
      sampleRows[vi] = sampleScenario(
        variant,
        scenario,
        scenarioSeed,
        orderSpreadPct,
      );
    }

    logScenarioSummary(libraryName, scenario, sampleRows);

    describe(`${libraryName}: ${scenario.title}`, () => {
      for (let vi = 0; vi < variantCount; ++vi) {
        const variant = variants[vi]!;
        let runner: Runner | null = null;

        // FIX: runner created in beforeAll, not lazily inside the bench callback —
        bench(
          variant.label,
          () => {
            runner!.runBenchStep();
          },
          {
            ...scenario.bench,
            // Vitest benchmark mode is backed by Tinybench and does not run
            // Vitest lifecycle hooks for each bench task. Keep graph setup in
            // Tinybench setup/teardown so setup work stays out of iterations.
            setup() {
              runner = createRunner(variant, scenario, scenarioSeed, false);
            },
            teardown() {
              runner?.dispose();
              runner = null;
            },
          },
        );
      }
    });
  }
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

function createRotatingDirtyWrites(
  harness: BenchHarness,
  sourceCount: number,
  mode: "same" | "rotate" | "random",
  seed: number,
): ScenarioInstance {
  const rng = createRng(seed);
  const sources = Array.from({ length: sourceCount }, (_, index) =>
    harness.signal(index, `write-rotation:source:${index}`),
  );
  const leaves = sources.map(([read], index) =>
    harness.memo(() => read() + index, `write-rotation:leaf:${index}`),
  );
  const root = harness.memo(() => {
    let total = 0;
    for (let index = 0; index < leaves.length; index += 1) {
      total += leaves[index]!();
    }
    return total;
  }, "write-rotation:root");
  const values = Array.from({ length: sourceCount }, (_, index) => index);
  let tick = 0;

  blackhole(root());
  values[0] += 1;
  sources[0]![1](values[0]!);

  const pickIndex = (): number => {
    if (mode === "same") return 0;
    if (mode === "random") return rng.int(sourceCount);
    return tick % sourceCount;
  };

  return {
    runStep() {
      const index = pickIndex();
      tick += 1;
      values[index] += 1;
      sources[index]![1](values[index]!);
      blackhole(values[index]!);
    },
    validate() {
      let expected = 0;
      for (let index = 0; index < values.length; index += 1) {
        expected += values[index]! + index;
      }

      const actual = root();
      if (actual !== expected) {
        throw new Error(
          `[write-rotation:${mode}:${sourceCount}] invalid root: expected ${expected}, got ${actual}`,
        );
      }

      values[0] += 1;
      sources[0]![1](values[0]!);
    },
  };
}

function createOuterBatchWrites(
  harness: BenchHarness,
  writeCount: number,
): ScenarioInstance {
  const sourceCount = 128;
  const sources = Array.from({ length: sourceCount }, (_, index) =>
    harness.signal(index, `outer-batch:source:${index}`),
  );
  const leaves = sources.map(([read], index) =>
    harness.memo(() => read() + index, `outer-batch:leaf:${index}`),
  );
  const root = harness.memo(() => {
    let total = 0;
    for (let index = 0; index < leaves.length; index += 1) {
      total += leaves[index]!();
    }
    return total;
  }, "outer-batch:root");
  const values = Array.from({ length: sourceCount }, (_, index) => index);
  let tick = 0;

  blackhole(root());

  return {
    runStep() {
      harness.batch(() => {
        for (let offset = 0; offset < writeCount; offset += 1) {
          const index = (tick + offset) % sourceCount;
          values[index] += 1;
          sources[index]![1](values[index]!);
        }
      });

      tick += writeCount;
      blackhole(tick);
    },
    validate() {
      let expected = 0;
      for (let index = 0; index < values.length; index += 1) {
        expected += values[index]! + index;
      }

      const actual = root();
      if (actual !== expected) {
        throw new Error(
          `[outer-batch:${writeCount}] invalid root: expected ${expected}, got ${actual}`,
        );
      }
    },
  };
}

const GRAPH_SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: "write-same-value",
    title: "Write same value",
    sampleIterations: 30,
    bench: { iterations: 240, warmupIterations: 50 },
    build(harness) {
      const [source, setSource] = harness.signal(1, "write:same-value");

      return {
        runStep() {
          setSource(1);
          blackhole(source());
        },
        validate() {
          const actual = source();
          if (actual !== 1) {
            throw new Error(
              `[write-same-value] invalid source: expected 1, got ${actual}`,
            );
          }
        },
      };
    },
  },
  {
    id: "write-changed-no-subscribers",
    title: "Write changed value / no subscribers",
    sampleIterations: 30,
    bench: { iterations: 240, warmupIterations: 50 },
    build(harness) {
      const [source, setSource] = harness.signal(0, "write:no-subscribers");
      let nextValue = 0;

      return {
        runStep() {
          nextValue += 1;
          setSource(nextValue);
          blackhole(nextValue);
        },
        validate() {
          const actual = source();
          if (actual !== nextValue) {
            throw new Error(
              `[write-changed-no-subscribers] invalid source: expected ${nextValue}, got ${actual}`,
            );
          }
        },
      };
    },
  },
  {
    id: "write-changed-one-subscriber",
    title: "Write changed value / one subscriber",
    sampleIterations: 30,
    bench: { iterations: 240, warmupIterations: 50 },
    build(harness) {
      const [source, setSource] = harness.signal(0, "write:one-sub-source");
      const derived = harness.memo(() => source() + 1, "write:one-sub-derived");
      let nextValue = 0;

      blackhole(derived());

      return {
        runStep() {
          nextValue += 1;
          setSource(nextValue);
          blackhole(nextValue);
        },
        validate() {
          const actual = derived();
          const expected = nextValue + 1;
          if (actual !== expected) {
            throw new Error(
              `[write-changed-one-subscriber] invalid derived: expected ${expected}, got ${actual}`,
            );
          }
        },
      };
    },
  },
  {
    id: "write-changed-full-graph-subscribers",
    title: "Write changed value / full graph subscribers",
    sampleIterations: 30,
    bench: { iterations: 200, warmupIterations: 45 },
    build(harness) {
      const [source, setSource] = harness.signal(0, "write:full-source");
      const leaves: Read[] = new Array(192);
      let nextValue = 0;

      for (let index = 0; index < leaves.length; index += 1) {
        leaves[index] = harness.memo(
          () => source() + index,
          `write:full-leaf:${index}`,
        );
      }

      const root = harness.memo(() => {
        let total = 0;
        for (let index = 0; index < leaves.length; index += 1) {
          total += leaves[index]!();
        }
        return total;
      }, "write:full-root");

      blackhole(root());

      return {
        runStep() {
          nextValue += 1;
          setSource(nextValue);
          blackhole(nextValue);
        },
        validate() {
          const expected =
            leaves.length * nextValue +
            ((leaves.length - 1) * leaves.length) / 2;
          const actual = root();
          if (actual !== expected) {
            throw new Error(
              `[write-changed-full-graph-subscribers] invalid root: expected ${expected}, got ${actual}`,
            );
          }
        },
      };
    },
  },
  {
    id: "write-changed-already-invalid-graph",
    title: "Write changed value / already invalid graph",
    sampleIterations: 30,
    bench: { iterations: 200, warmupIterations: 45 },
    build(harness) {
      const [source, setSource] = harness.signal(0, "write:dirty-source");
      const leaves: Read[] = new Array(192);
      let nextValue = 0;

      for (let index = 0; index < leaves.length; index += 1) {
        leaves[index] = harness.memo(
          () => source() + index,
          `write:dirty-leaf:${index}`,
        );
      }

      const root = harness.memo(() => {
        let total = 0;
        for (let index = 0; index < leaves.length; index += 1) {
          total += leaves[index]!();
        }
        return total;
      }, "write:dirty-root");

      blackhole(root());
      nextValue = 1;
      setSource(nextValue);

      return {
        runStep() {
          nextValue += 1;
          setSource(nextValue);
          blackhole(nextValue);
        },
        validate() {
          const expected =
            leaves.length * nextValue +
            ((leaves.length - 1) * leaves.length) / 2;
          const actual = root();
          if (actual !== expected) {
            throw new Error(
              `[write-changed-already-invalid-graph] invalid root: expected ${expected}, got ${actual}`,
            );
          }
          nextValue += 1;
          setSource(nextValue);
        },
      };
    },
  },
  {
    id: "empty-batch",
    title: "Empty batch",
    sampleIterations: 40,
    bench: { iterations: 300, warmupIterations: 60 },
    build(harness) {
      let count = 0;

      return {
        runStep() {
          harness.batch(() => {
            count += 1;
          });
          blackhole(count);
        },
      };
    },
  },
  {
    id: "write-same-source-already-invalid",
    title: "Write dirty pattern / same source",
    sampleIterations: 30,
    bench: { iterations: 220, warmupIterations: 45 },
    build: (harness, seed) =>
      createRotatingDirtyWrites(harness, 32, "same", seed),
  },
  {
    id: "write-rotating-4-sources-already-invalid",
    title: "Write dirty pattern / rotating 4 sources",
    sampleIterations: 30,
    bench: { iterations: 220, warmupIterations: 45 },
    build: (harness, seed) =>
      createRotatingDirtyWrites(harness, 4, "rotate", seed),
  },
  {
    id: "write-rotating-32-sources-already-invalid",
    title: "Write dirty pattern / rotating 32 sources",
    sampleIterations: 30,
    bench: { iterations: 220, warmupIterations: 45 },
    build: (harness, seed) =>
      createRotatingDirtyWrites(harness, 32, "rotate", seed),
  },
  {
    id: "write-random-32-sources-already-invalid",
    title: "Write dirty pattern / random 32 sources",
    sampleIterations: 30,
    bench: { iterations: 220, warmupIterations: 45 },
    build: (harness, seed) =>
      createRotatingDirtyWrites(harness, 32, "random", seed),
  },
  {
    id: "outer-batch-1-write",
    title: "Outer batch / 1 write",
    sampleIterations: 30,
    bench: { iterations: 220, warmupIterations: 45 },
    build: (harness) => createOuterBatchWrites(harness, 1),
  },
  {
    id: "outer-batch-10-writes",
    title: "Outer batch / 10 writes",
    sampleIterations: 30,
    bench: { iterations: 180, warmupIterations: 40 },
    build: (harness) => createOuterBatchWrites(harness, 10),
  },
  {
    id: "outer-batch-100-writes",
    title: "Outer batch / 100 writes",
    sampleIterations: 24,
    bench: { iterations: 140, warmupIterations: 35 },
    build: (harness) => createOuterBatchWrites(harness, 100),
  },
  {
    id: "outer-batch-10000-writes",
    title: "Outer batch / 10000 writes",
    sampleIterations: 10,
    bench: { iterations: 20, warmupIterations: 5 },
    build: (harness) => createOuterBatchWrites(harness, 10_000),
  },
  {
    id: "linear-chain",
    title: "Linear chain",
    sampleIterations: 28,
    bench: { iterations: 220, warmupIterations: 40 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [source, setSource] = harness.signal(1, "chain:source");
      const layers: Read[] = new Array(192);
      let current = source;

      const tapValues = new Map<number, number>();
      let tailValue = NaN;

      for (let depth = 0; depth < 192; ++depth) {
        const previous = current;
        const addend = (depth & 3) + 1;

        current = harness.memo(
          () => previous() + addend,
          `chain:memo:${depth}`,
        );
        layers[depth] = current;

        if ((depth + 1) % 48 === 0) {
          const tap = layers[depth]!;
          harness.effect(
            () => {
              const v = tap();
              blackhole(v); // FIX: prevent dead-code elimination
              tapValues.set(depth, v);
            },
            {
              label: `chain:tap:${depth}`,
              priority: depth + 1,
            },
          );
        }
      }

      const tail = current;
      harness.effect(
        () => {
          tailValue = tail();
          blackhole(tailValue);
        },
        { label: "chain:tail", priority: 256 },
      );

      const expectedPrefixSum = (depthInclusive: number): number => {
        let total = 0;
        for (let i = 0; i <= depthInclusive; ++i) {
          total += (i & 3) + 1;
        }
        return total;
      };

      const validate = () => {
        const sourceValue = source();

        for (const depth of [47, 95, 143, 191]) {
          const actual = tapValues.get(depth);
          const expected = sourceValue + expectedPrefixSum(depth);

          if (actual !== expected) {
            throw new Error(
              `[linear-chain] invalid tap at depth ${depth}: expected ${expected}, got ${actual}`,
            );
          }
        }

        const expectedTail = sourceValue + expectedPrefixSum(191);
        if (tailValue !== expectedTail) {
          throw new Error(
            `[linear-chain] invalid tail: expected ${expectedTail}, got ${tailValue}`,
          );
        }
      };

      return {
        runStep() {
          harness.batch(() => {
            setSource(source() + 1 + rng.int(3));
          });
          harness.flush();
        },
        validate,
      };
    },
  },
  {
    id: "wide-fan-out",
    title: "Wide fan-out",
    sampleIterations: 24,
    bench: { iterations: 180, warmupIterations: 35 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [source, setSource] = harness.signal(3, "fanout:source");

      const leaves: Read[] = new Array(192);
      const tapValues = new Map<number, number>();
      let aggregateValue = NaN;

      for (let index = 0; index < 192; ++index) {
        const multiplier = (index % 7) + 1;
        const offset = index;

        leaves[index] = harness.memo(
          () => source() * multiplier + offset,
          `fanout:leaf:${index}`,
        );
      }

      const aggregate = harness.memo(() => {
        let total = 0;
        for (let i = 0; i < leaves.length; ++i) total += leaves[i]!();
        return total;
      }, "fanout:aggregate");

      for (let index = 0; index < leaves.length; index += 48) {
        const leaf = leaves[index]!;
        harness.effect(
          () => {
            const v = leaf();
            blackhole(v);
            tapValues.set(index, v);
          },
          {
            label: `fanout:tap:${index}`,
            priority: 96 + index,
          },
        );
      }

      harness.effect(
        () => {
          aggregateValue = aggregate();
          blackhole(aggregateValue);
        },
        {
          label: "fanout:aggregate-effect",
          priority: 384,
        },
      );

      const expectedAggregate = (sourceValue: number): number => {
        let total = 0;
        for (let i = 0; i < 192; ++i) {
          total += sourceValue * ((i % 7) + 1) + i;
        }
        return total;
      };

      const expectedLeaf = (sourceValue: number, index: number): number => {
        return sourceValue * ((index % 7) + 1) + index;
      };

      const validate = () => {
        const sourceValue = source();

        for (const index of [0, 48, 96, 144]) {
          const actual = tapValues.get(index);
          const expected = expectedLeaf(sourceValue, index);

          if (actual !== expected) {
            throw new Error(
              `[wide-fan-out] invalid tap at index ${index}: expected ${expected}, got ${actual}`,
            );
          }
        }

        const expected = expectedAggregate(sourceValue);
        if (aggregateValue !== expected) {
          throw new Error(
            `[wide-fan-out] invalid aggregate: expected ${expected}, got ${aggregateValue}`,
          );
        }
      };

      return {
        runStep() {
          harness.batch(() => {
            setSource(source() + 1 + rng.int(5));
          });
          harness.flush();
        },
        validate,
      };
    },
  },
  {
    id: "diamond-shared-deps",
    title: "Diamond / shared deps",
    sampleIterations: 26,
    bench: { iterations: 190, warmupIterations: 35 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [left, setLeft] = harness.signal(1, "diamond:left");
      const [right, setRight] = harness.signal(10, "diamond:right");
      const sharedSum = harness.memo(() => left() + right(), "diamond:sum");
      const sharedDiff = harness.memo(() => left() - right(), "diamond:diff");

      const branches: Read[] = new Array(96);
      for (let index = 0; index < 96; ++index) {
        const multiplier = (index % 5) + 1;
        const useDiff = (index & 1) !== 0;
        branches[index] = harness.memo(
          () => (useDiff ? sharedDiff() : sharedSum()) * multiplier,
          `diamond:branch:${index}`,
        );
      }

      const join = harness.memo(() => {
        let total = 0;
        for (let i = 0; i < branches.length; ++i) total += branches[i]!();
        return total;
      }, "diamond:join");

      harness.effect(
        () => {
          blackhole(sharedSum());
        },
        {
          label: "diamond:sum-effect",
          priority: 64,
        },
      );
      harness.effect(
        () => {
          blackhole(sharedDiff());
        },
        {
          label: "diamond:diff-effect",
          priority: 64,
        },
      );

      for (let index = 0; index < branches.length; index += 32) {
        const branch = branches[index]!;
        harness.effect(
          () => {
            blackhole(branch());
          },
          {
            label: `diamond:branch-effect:${index}`,
            priority: 128 + index,
          },
        );
      }

      harness.effect(
        () => {
          blackhole(join());
        },
        {
          label: "diamond:join-effect",
          priority: 320,
        },
      );

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
    sampleIterations: 24,
    bench: { iterations: 150, warmupIterations: 30 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [selector, setSelector] = harness.signal(0, "dynamic:selector");
      const sources = Array.from({ length: 18 }, (_, index) =>
        harness.signal(index * 3, `dynamic:source:${index}`),
      );
      const srcLen = sources.length;

      const branches: Read[] = new Array(72);
      for (let branchIndex = 0; branchIndex < 72; ++branchIndex) {
        const base = branchIndex * 5;
        branches[branchIndex] = harness.memo(() => {
          const mode = selector() % 3;
          const modeOff = mode * 7;
          let total = 0;
          for (let offset = 0; offset < 4; ++offset) {
            total += sources[(base + offset + modeOff) % srcLen]![0]();
          }
          return total;
        }, `dynamic:branch:${branchIndex}`);
      }

      const aggregate = harness.memo(() => {
        let total = selector();
        for (let i = 0; i < branches.length; ++i) total += branches[i]!();
        return total;
      }, "dynamic:aggregate");

      for (let index = 0; index < branches.length; index += 24) {
        const branch = branches[index]!;
        harness.effect(
          () => {
            blackhole(branch());
          },
          {
            label: `dynamic:branch-effect:${index}`,
            priority: 96 + index,
          },
        );
      }

      harness.effect(
        () => {
          blackhole(aggregate());
        },
        {
          label: "dynamic:aggregate-effect",
          priority: 320,
        },
      );

      return {
        runStep() {
          harness.batch(() => {
            setSelector((selector() + 1) % 3);
            const firstIndex = rng.int(srcLen);
            const secondIndex = (firstIndex + 5 + rng.int(5)) % srcLen;
            const [r1, w1] = sources[firstIndex]!;
            const [r2, w2] = sources[secondIndex]!;
            w1(r1() + 1 + rng.int(4));
            w2(r2() + rng.centered(3));
          });
          harness.flush();
        },
      };
    },
  },
  {
    id: "many-effects-one-source",
    title: "Many effects from one source",
    sampleIterations: 28,
    bench: { iterations: 210, warmupIterations: 40 },
    build(harness, seed) {
      const rng = createRng(seed);
      const [source, setSource] = harness.signal(1, "effects:source");

      // FIX: counter capture is now driven by the runner's separate counter-pass,
      // not by hardcoded magic numbers baked into the scenario build function.
      // The scenario only tracks what it can observe without knowing implementation details.
      let captureNextIteration = false;
      let lastIterationCounters: IterationCounters | undefined;
      let activeCounters: IterationCounters | undefined;

      const doubled = harness.memo(() => {
        if (activeCounters !== undefined) {
          activeCounters.recomputeDoubledCount += 1;
          activeCounters.propagateOnceDoubledCount = Math.min(
            1,
            activeCounters.propagateOnceDoubledCount + 1,
          );
        }
        return source() * 2;
      }, "effects:doubled");

      let doubledDirtyReads = 0;
      const readDoubled = () => {
        const value = doubled();
        if (activeCounters !== undefined) {
          if (doubledDirtyReads === 0) {
            activeCounters.walkLineDirty += 1;
          } else {
            activeCounters.walkLineClean += 1;
          }
          doubledDirtyReads += 1;
        }
        return value;
      };

      for (let index = 0; index < 96; ++index) {
        const addend = (index & 1) === 0 ? index : index * 3;
        const base = (index & 1) === 0 ? source : readDoubled;
        harness.effect(
          () => {
            blackhole(base() + addend);
          },
          {
            label: `effects:sink:${index}`,
            priority: index,
          },
        );
      }

      return {
        runStep() {
          activeCounters = captureNextIteration
            ? {
                writes: 1,
                notifyWatcherCount: 0,
                enqueueCount: 0,
                recomputeDoubledCount: 0,
                propagateOnceDoubledCount: 0,
                // FIX: removed hardcoded += 49/48 magic numbers; harness must supply
                // these via metrics.record*() — see comment in audit widget
                invalidateSubCount: 0,
                invalidateSubZeroCount: 0,
                walkLineClean: 0,
                walkLineDirty: 0,
                walkLineBail: 0,
                walkBranchCount: 0,
              }
            : undefined;
          doubledDirtyReads = 0;

          setSource(source() + 1 + rng.int(4));
          harness.flush();

          if (activeCounters !== undefined) {
            lastIterationCounters = activeCounters;
            captureNextIteration = false;
            activeCounters = undefined;
          }
        },
        readIterationCounters() {
          const counters = lastIterationCounters;
          lastIterationCounters = undefined;
          return counters;
        },
        setCaptureCounters(enabled: boolean) {
          captureNextIteration = enabled;
        },
      };
    },
  },
  {
    id: "many-sources-one-sink",
    title: "Many sources into one computed/effect",
    sampleIterations: 22,
    bench: { iterations: 140, warmupIterations: 28 },
    build(harness, seed) {
      const rng = createRng(seed);
      const sampler = createUniqueIndexSampler(128);
      const touched: number[] = [];

      const sources = Array.from({ length: 128 }, (_, index) =>
        harness.signal(index, `fanin:source:${index}`),
      );
      const srcLen = sources.length;

      const total = harness.memo(() => {
        let sum = 0;
        for (let i = 0; i < srcLen; ++i) {
          sum += sources[i]![0]();
        }
        return sum;
      }, "fanin:total");

      harness.effect(
        () => {
          blackhole(total());
        },
        {
          label: "fanin:total-effect",
          priority: 512,
        },
      );

      harness.effect(
        () => {
          let sum = 0;
          for (let i = 0; i < srcLen; i += 16) {
            sum += sources[i]![0]();
          }
          blackhole(sum);
          return sum;
        },
        { label: "fanin:direct-effect", priority: 256 },
      );

      return {
        runStep() {
          harness.batch(() => {
            for (const index of sampler(8, rng, touched)) {
              const [, write] = sources[index]!;
              const delta = Math.trunc(rng.centered(6));
              write((prev) => prev + delta);
            }
          });
          harness.flush();
        },
      };
    },
  },
  {
    id: "many-sources-one-computed",
    title: "Many sources into one computed -> effect",
    sampleIterations: 22,
    bench: { iterations: 140, warmupIterations: 28 },
    build(harness, seed) {
      const rng = createRng(seed);
      const sampler = createUniqueIndexSampler(128);
      const touched: number[] = [];

      const sources = Array.from({ length: 128 }, (_, index) =>
        harness.signal(index, `fanin:source:${index}`),
      );
      const srcLen = sources.length;

      const total = harness.memo(() => {
        let sum = 0;
        for (let i = 0; i < srcLen; ++i) sum += sources[i]![0]();
        return sum;
      }, "fanin:total");

      harness.effect(
        () => {
          blackhole(total());
        },
        {
          label: "fanin:total-effect",
          priority: 512,
        },
      );

      return {
        runStep() {
          harness.batch(() => {
            for (const index of sampler(8, rng, touched)) {
              const [, write] = sources[index]!;
              const delta = Math.trunc(rng.centered(6));
              write((prev) => prev + delta);
            }
          });
          harness.flush();
        },
      };
    },
  },
  {
    id: "many-sources-one-direct-effect",
    title: "Many sources into one direct effect",
    sampleIterations: 22,
    bench: { iterations: 140, warmupIterations: 28 },
    build(harness, seed) {
      const rng = createRng(seed);
      const sampler = createUniqueIndexSampler(128);
      const touched: number[] = [];

      const sources = Array.from({ length: 128 }, (_, index) =>
        harness.signal(index, `fanin:source:${index}`),
      );
      const srcLen = sources.length;

      harness.effect(
        () => {
          let sum = 0;
          for (let i = 0; i < srcLen; i += 16) sum += sources[i]![0]();
          blackhole(sum);
          return sum;
        },
        { label: "fanin:direct-effect", priority: 256 },
      );

      return {
        runStep() {
          harness.batch(() => {
            for (const index of sampler(8, rng, touched)) {
              const [, write] = sources[index]!;
              const delta = Math.trunc(rng.centered(6));
              write((prev) => prev + delta);
            }
          });
          harness.flush();
        },
      };
    },
  },
];
