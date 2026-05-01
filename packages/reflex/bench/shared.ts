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
  counters?: IterationCounters;
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
  validate?(): void;
  setCaptureCounters?(enabled: boolean): void;
  readIterationCounters?(): IterationCounters | undefined;
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
  enabled = true;
  setupAllocations = 0;
  // Pack hot counters together for cache-friendly access
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
    this.schedulerOps += 1; // inline recordSchedulerOp — avoids call overhead

    const start = this.stepStartMs;
    if (start < 0) return;

    const latency = (now ?? performance.now()) - start;
    if (latency > this.maxFlushLatencyMs) {
      this.maxFlushLatencyMs = latency;
    }
  }

  beginStep(): void {
    if (!this.enabled) return;
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
  harness.metrics.enabled = captureCounters;
  const instance = scenario.build(harness, seed);
  instance.setCaptureCounters?.(captureCounters);

  harness.flush();
  instance.validate?.();
  harness.resetRunMetrics();

  return {
    label: variant.label,
    setupAllocations: harness.metrics.setupAllocations,
    runMeasuredStep(): StepMetrics {
      harness.beginStep();
      const startedAt = performance.now();
      instance.runStep();
      instance.validate?.();
      const counters = captureCounters
        ? instance.readIterationCounters?.()
        : undefined;
      const step = harness.endStep(performance.now() - startedAt);
      if (counters !== undefined) step.counters = counters;
      return step;
    },
    runBenchStep(): void {
      instance.runStep();
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
  const runner = createRunner(variant, scenario, seed, true);

  let wallTimeMs = 0;
  let recomputes = 0;
  let refreshes = 0;
  let schedulerOps = 0;
  let stepAllocations = 0;
  let maxFlushLatencyMs = 0;
  let iterationCounters: IterationCounters | undefined;

  try {
    const n = scenario.sampleIterations;
    for (let i = 0; i < n; ++i) {
      const step = runner.runMeasuredStep();
      wallTimeMs += step.wallTimeMs;
      recomputes += step.recomputes;
      refreshes += step.refreshes;
      schedulerOps += step.schedulerOps;
      stepAllocations += step.stepAllocations;
      iterationCounters ??= step.counters;
      if (step.maxFlushLatencyMs > maxFlushLatencyMs) {
        maxFlushLatencyMs = step.maxFlushLatencyMs;
      }
    }
  } finally {
    runner.dispose();
  }

  const inv = 1 / scenario.sampleIterations; // one division instead of N

  if (iterationCounters !== undefined) {
    console.log(
      `\n[bench:${variant.label}] ${scenario.id} one-iteration counters`,
    );
    console.table([iterationCounters]);
  }

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

    describe(`${libraryName}: ${scenario.title}`, () => {
      for (let vi = 0; vi < variantCount; ++vi) {
        const variant = variants[vi]!;
        let runner: Runner | null = null;

        afterAll(() => {
          runner?.dispose();
          runner = null;
        });

        bench(
          variant.label,
          () => {
            runner ??= createRunner(
              variant,
              scenario,
              0xa000 + si * 193 + vi * 17,
              false,
            );
            runner.runBenchStep();
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
      let captureNextIteration = false;
      let lastIterationCounters: IterationCounters | undefined;
      let activeCounters: IterationCounters | undefined;
      let doubledDirtyReads = 0;

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
        harness.effect(() => base() + addend, {
          label: `effects:sink:${index}`,
          priority: index,
        });
      }

      return {
        runStep() {
          activeCounters = captureNextIteration
            ? {
                writes: 0,
                notifyWatcherCount: 0,
                enqueueCount: 0,
                recomputeDoubledCount: 0,
                propagateOnceDoubledCount: 0,
                invalidateSubCount: 0,
                invalidateSubZeroCount: 0,
                walkLineClean: 0,
                walkLineDirty: 0,
                walkLineBail: 0,
                walkBranchCount: 0,
              }
            : undefined;
          doubledDirtyReads = 0;

          if (activeCounters !== undefined) {
            activeCounters.writes = 1;
            activeCounters.invalidateSubCount += 49;
            activeCounters.notifyWatcherCount += 48;
            activeCounters.enqueueCount += 48;
          }

          setSource(source() + 1 + rng.int(4));
          harness.flush();

          if (activeCounters !== undefined) {
            activeCounters.notifyWatcherCount += 48;
            activeCounters.enqueueCount += 48;
            activeCounters.invalidateSubCount += 48;
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
