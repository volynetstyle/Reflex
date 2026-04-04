import { afterAll, bench, describe } from "vitest";

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
  sampleIterations: number;
  bench: {
    iterations: number;
    warmupIterations: number;
  };
  build(harness: BenchHarness, seed: number): ScenarioInstance;
}

interface SummaryRow {
  variant: string;
  "sample ms/step": string;
  "recompute/step": string;
  "refresh/step": string;
  "scheduler/step": string;
  "setup allocs": string;
  "step allocs/step": string;
  "max flush ms": string;
}

export class HarnessMetrics {
  setupAllocations = 0;
  private recomputes = 0;
  private refreshes = 0;
  private schedulerOps = 0;
  private stepAllocations = 0;
  private maxFlushLatencyMs = 0;
  private stepStartMs = -1;

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

  recordEffectRun(now = performance.now()): void {
    this.recordSchedulerOp();

    if (this.stepStartMs < 0) return;

    const latency = now - this.stepStartMs;
    if (latency > this.maxFlushLatencyMs) {
      this.maxFlushLatencyMs = latency;
    }
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

function sampleScenario(
  variant: BenchVariant,
  scenario: ScenarioDefinition,
  seed: number,
): SummaryRow {
  const runner = createRunner(variant, scenario, seed);

  let wallTimeMs = 0;
  let recomputes = 0;
  let refreshes = 0;
  let schedulerOps = 0;
  let stepAllocations = 0;
  let maxFlushLatencyMs = 0;

  try {
    for (
      let iteration = 0;
      iteration < scenario.sampleIterations;
      ++iteration
    ) {
      const step = runner.runStep();
      wallTimeMs += step.wallTimeMs;
      recomputes += step.recomputes;
      refreshes += step.refreshes;
      schedulerOps += step.schedulerOps;
      stepAllocations += step.stepAllocations;
      if (step.maxFlushLatencyMs > maxFlushLatencyMs) {
        maxFlushLatencyMs = step.maxFlushLatencyMs;
      }
    }
  } finally {
    runner.dispose();
  }

  const sampleIterations = scenario.sampleIterations;

  return {
    variant: variant.label,
    "sample ms/step": formatNumber(wallTimeMs / sampleIterations, 3),
    "recompute/step": formatNumber(recomputes / sampleIterations, 1),
    "refresh/step": formatNumber(refreshes / sampleIterations, 1),
    "scheduler/step": formatNumber(schedulerOps / sampleIterations, 1),
    "setup allocs": String(runner.setupAllocations),
    "step allocs/step": formatNumber(stepAllocations / sampleIterations, 1),
    "max flush ms": formatNumber(maxFlushLatencyMs, 3),
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

export function registerBenchFile(
  libraryName: string,
  variants: readonly BenchVariant[],
): void {
  for (
    let scenarioIndex = 0;
    scenarioIndex < GRAPH_SCENARIOS.length;
    ++scenarioIndex
  ) {
    const scenario = GRAPH_SCENARIOS[scenarioIndex]!;
    const sampleRows = variants.map((variant, variantIndex) =>
      sampleScenario(
        variant,
        scenario,
        0x6000 + scenarioIndex * 977 + variantIndex * 131,
      ),
    );

    logScenarioSummary(libraryName, scenario, sampleRows);

    const runners = variants.map((variant, variantIndex) =>
      createRunner(
        variant,
        scenario,
        0xa000 + scenarioIndex * 193 + variantIndex * 17,
      ),
    );

    describe(`${libraryName}: ${scenario.title}`, () => {
      afterAll(() => {
        for (const runner of runners) {
          runner.dispose();
        }
      });

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
  }
}

const GRAPH_SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: "linear-chain",
    title: "Linear chain",
    sampleIterations: 28,
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
    sampleIterations: 24,
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
    sampleIterations: 26,
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
    sampleIterations: 24,
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
    sampleIterations: 28,
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
    sampleIterations: 22,
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
];
