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
  // Pack hot counters together for cache-friendly access
  recomputes = 0;
  refreshes = 0;
  schedulerOps = 0;
  stepAllocations = 0;
  maxFlushLatencyMs = 0;
  stepStartMs = -1;

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
    this.schedulerOps += 1; // inline recordSchedulerOp — avoids call overhead

    const start = this.stepStartMs;
    if (start < 0) return;

    const latency = now - start;
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

// value is always a JS number (float64); no need for `| 0` on it
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
      return (next() * max) | 0; // faster than Math.floor for positive integers
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
    // Avoid fill(0) on overflow — just restart from 1 with a clean array
    if (epoch === 0xffffffff) {
      marks.fill(0);
      epoch = 0;
    }
    epoch += 1;

    // Reuse out array without shrinking
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

// Only used outside hot path — readability over micro-perf
function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

// Unsafe fast access — callers must guarantee index is in bounds
function at<T>(items: readonly T[], index: number): T {
  return (items as T[])[index] as T;
}

interface Runner {
  label: string;
  setupAllocations: number;
  runStep(): StepMetrics;
  dispose(): void;
}

function createRunner(
  variant: BenchVariant,
  scenario: ScenarioDefinition,
  seed: number,
): Runner {
  const harness = variant.createHarness();
  const instance = scenario.build(harness, seed);

  harness.flush();
  harness.resetRunMetrics();

  return {
    label: variant.label,
    setupAllocations: harness.metrics.setupAllocations,
    runStep(): StepMetrics {
      harness.beginStep();
      const startedAt = performance.now();
      instance.runStep();
      return harness.endStep(performance.now() - startedAt);
    },
    dispose(): void {
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
    const n = scenario.sampleIterations;
    for (let i = 0; i < n; ++i) {
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

  const inv = 1 / scenario.sampleIterations; // one division instead of N

  return {
    variant: variant.label,
    "sample ms/step": formatNumber(wallTimeMs * inv, 3),
    "recompute/step": formatNumber(recomputes * inv, 1),
    "refresh/step": formatNumber(refreshes * inv, 1),
    "scheduler/step": formatNumber(schedulerOps * inv, 1),
    "setup allocs": String(runner.setupAllocations),
    "step allocs/step": formatNumber(stepAllocations * inv, 1),
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
  const scenarioCount = GRAPH_SCENARIOS.length;
  const variantCount = variants.length;

  for (let si = 0; si < scenarioCount; ++si) {
    const scenario = GRAPH_SCENARIOS[si]!;

    const sampleRows: SummaryRow[] = new Array(variantCount);
    for (let vi = 0; vi < variantCount; ++vi) {
      sampleRows[vi] = sampleScenario(
        variants[vi]!,
        scenario,
        0x6000 + si * 977 + vi * 131,
      );
    }

    logScenarioSummary(libraryName, scenario, sampleRows);

    const runners: Runner[] = new Array(variantCount);
    for (let vi = 0; vi < variantCount; ++vi) {
      runners[vi] = createRunner(
        variants[vi]!,
        scenario,
        0xa000 + si * 193 + vi * 17,
      );
    }

    describe(`${libraryName}: ${scenario.title}`, () => {
      afterAll(() => {
        for (let i = 0; i < runners.length; ++i) {
          runners[i]!.dispose();
        }
      });

      for (let i = 0; i < runners.length; ++i) {
        const runner = runners[i]!;
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

// ─── Scenarios ────────────────────────────────────────────────────────────────

const GRAPH_SCENARIOS: readonly ScenarioDefinition[] = [
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
        harness.effect(() => {
          tapValues.set(depth, tap());
        }, {
          label: `chain:tap:${depth}`,
          priority: depth + 1,
        });
      }
    }

    const tail = current;
    harness.effect(() => {
      tailValue = tail();
    }, { label: "chain:tail", priority: 256 });

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

    // Проверка начального состояния после построения графа
    harness.flush();
    validate();

    return {
      runStep() {
        harness.batch(() => {
          setSource(source() + 1 + rng.int(3));
        });
        harness.flush();
        validate();
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
      harness.effect(() => {
        tapValues.set(index, leaf());
      }, {
        label: `fanout:tap:${index}`,
        priority: 96 + index,
      });
    }

    harness.effect(() => {
      aggregateValue = aggregate();
    }, {
      label: "fanout:aggregate-effect",
      priority: 384,
    });

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

    harness.flush();
    validate();

    return {
      runStep() {
        harness.batch(() => {
          setSource(source() + 1 + rng.int(5));
        });
        harness.flush();
        validate();
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

      harness.effect(() => sharedSum(), {
        label: "diamond:sum-effect",
        priority: 64,
      });
      harness.effect(() => sharedDiff(), {
        label: "diamond:diff-effect",
        priority: 64,
      });

      for (let index = 0; index < branches.length; index += 32) {
        const branch = branches[index]!;
        harness.effect(() => branch(), {
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
        harness.effect(() => branch(), {
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
      const doubled = harness.memo(() => source() * 2, "effects:doubled");

      for (let index = 0; index < 96; ++index) {
        const addend = (index & 1) === 0 ? index : index * 3;
        const base = (index & 1) === 0 ? source : doubled;
        harness.effect(() => base() + addend, {
          label: `effects:sink:${index}`,
          priority: index,
        });
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
      const srcLen = sources.length;

      const total = harness.memo(() => {
        let sum = 0;
        for (let i = 0; i < srcLen; ++i) {
          sum += sources[i]![0]();
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
          for (let i = 0; i < srcLen; i += 16) {
            sum += sources[i]![0]();
          }
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

          // Не нужен, если batch() уже flush-ит при выходе.
          // Оставляй только если конкретный harness реально не flush-ит сам.
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

      harness.effect(() => total(), {
        label: "fanin:total-effect",
        priority: 512,
      });

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
