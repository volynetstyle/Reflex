import { bench, describe } from "vitest";

export type Read = () => number;
export type WriteInput = number | ((prev: number) => number);
export type Write = (value: WriteInput) => number | void;
export type BenchSignal = Read & { readonly set: Write };

export interface EffectMeta {
  label?: string;
  priority?: number;
}

export interface BenchHarness {
  signal(initial: number, label?: string): BenchSignal;
  memo(fn: () => number, label?: string): Read;
  effect(read: Read, meta?: EffectMeta): () => void;
  batch<T>(fn: () => T): T;
  flush(): void;
  dispose(): void;
}

export interface BenchVariant {
  label: string;
  createHarness(): BenchHarness;
}

interface ScenarioInstance {
  runStep(): void;
  validate(): void;
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

interface Runner {
  runBenchStep(): void;
  validate(): void;
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
  instance.validate();

  return {
    runBenchStep(): void {
      instance.runStep();
    },
    validate(): void {
      instance.validate();
    },
    dispose(): void {
      harness.dispose();
    },
  };
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
    const scenarioSeed = 0xa000 + scenarioIndex * 193;

    describe(`${libraryName}: ${scenario.title}`, () => {
      for (const variant of variants) {
        let runner: Runner | null = null;

        bench(
          variant.label,
          () => {
            runner!.runBenchStep();
          },
          {
            ...scenario.bench,
            setup() {
              runner = createRunner(variant, scenario, scenarioSeed);
            },
            teardown() {
              const current = runner;
              runner = null;
              if (current !== null) {
                try {
                  current.validate();
                } finally {
                  current.dispose();
                }
              }
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
  const leaves = sources.map((source, index) =>
    harness.memo(() => source() + index, `write-rotation:leaf:${index}`),
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
  sources[0]!.set(values[0]!);

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
      sources[index]!.set(values[index]!);
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
          `[write-rotation:${mode}:${sourceCount}] unknown root: expected ${expected}, got ${actual}`,
        );
      }

      values[0] += 1;
      sources[0]!.set(values[0]!);
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
  const leaves = sources.map((source, index) =>
    harness.memo(() => source() + index, `outer-batch:leaf:${index}`),
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
          sources[index]!.set(values[index]!);
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
          `[outer-batch:${writeCount}] unknown root: expected ${expected}, got ${actual}`,
        );
      }
    },
  };
}

const GRAPH_SCENARIOS: readonly ScenarioDefinition[] = [
  // {
  //   id: "write-same-value",
  //   title: "Write same value",
  //   sampleIterations: 30,
  //   bench: { iterations: 240, warmupIterations: 50 },
  //   build(harness) {
  //     const source = harness.signal(1, "write:same-value");

  //     return {
  //       runStep() {
  //         source.set(1);
  //         blackhole(source());
  //       },
  //       validate() {
  //         const actual = source();
  //         if (actual !== 1) {
  //           throw new Error(
  //             `[write-same-value] unknown source: expected 1, got ${actual}`,
  //           );
  //         }
  //       },
  //     };
  //   },
  // },
  // {
  //   id: "write-changed-no-subscribers",
  //   title: "Write changed value / no subscribers",
  //   sampleIterations: 30,
  //   bench: { iterations: 240, warmupIterations: 50 },
  //   build(harness) {
  //     const source = harness.signal(0, "write:no-subscribers");
  //     let nextValue = 0;

  //     return {
  //       runStep() {
  //         nextValue += 1;
  //         source.set(nextValue);
  //         blackhole(nextValue);
  //       },
  //       validate() {
  //         const actual = source();
  //         if (actual !== nextValue) {
  //           throw new Error(
  //             `[write-changed-no-subscribers] unknown source: expected ${nextValue}, got ${actual}`,
  //           );
  //         }
  //       },
  //     };
  //   },
  // },
  // {
  //   id: "write-changed-one-subscriber",
  //   title: "Write changed value / one subscriber",
  //   sampleIterations: 30,
  //   bench: { iterations: 240, warmupIterations: 50 },
  //   build(harness) {
  //     const source = harness.signal(0, "write:one-sub-source");
  //     const derived = harness.memo(() => source() + 1, "write:one-sub-derived");
  //     let nextValue = 0;

  //     blackhole(derived());

  //     return {
  //       runStep() {
  //         nextValue += 1;
  //         source.set(nextValue);
  //         blackhole(nextValue);
  //       },
  //       validate() {
  //         const actual = derived();
  //         const expected = nextValue + 1;
  //         if (actual !== expected) {
  //           throw new Error(
  //             `[write-changed-one-subscriber] unknown derived: expected ${expected}, got ${actual}`,
  //           );
  //         }
  //       },
  //     };
  //   },
  // },
  // {
  //   id: "write-changed-full-graph-subscribers",
  //   title: "Write changed value / full graph subscribers",
  //   sampleIterations: 30,
  //   bench: { iterations: 200, warmupIterations: 45 },
  //   build(harness) {
  //     const source = harness.signal(0, "write:full-source");
  //     const leaves: Read[] = new Array(192);
  //     let nextValue = 0;

  //     for (let index = 0; index < leaves.length; index += 1) {
  //       leaves[index] = harness.memo(
  //         () => source() + index,
  //         `write:full-leaf:${index}`,
  //       );
  //     }

  //     const root = harness.memo(() => {
  //       let total = 0;
  //       for (let index = 0; index < leaves.length; index += 1) {
  //         total += leaves[index]!();
  //       }
  //       return total;
  //     }, "write:full-root");

  //     blackhole(root());

  //     return {
  //       runStep() {
  //         nextValue += 1;
  //         source.set(nextValue);
  //         blackhole(nextValue);
  //       },
  //       validate() {
  //         const expected =
  //           leaves.length * nextValue +
  //           ((leaves.length - 1) * leaves.length) / 2;
  //         const actual = root();
  //         if (actual !== expected) {
  //           throw new Error(
  //             `[write-changed-full-graph-subscribers] unknown root: expected ${expected}, got ${actual}`,
  //           );
  //         }
  //       },
  //     };
  //   },
  // },
  // {
  //   id: "write-changed-already-unknown-graph",
  //   title: "Write changed value / already unknown graph",
  //   sampleIterations: 30,
  //   bench: { iterations: 200, warmupIterations: 45 },
  //   build(harness) {
  //     const source = harness.signal(0, "write:dirty-source");
  //     const leaves: Read[] = new Array(192);
  //     let nextValue = 0;

  //     for (let index = 0; index < leaves.length; index += 1) {
  //       leaves[index] = harness.memo(
  //         () => source() + index,
  //         `write:dirty-leaf:${index}`,
  //       );
  //     }

  //     const root = harness.memo(() => {
  //       let total = 0;
  //       for (let index = 0; index < leaves.length; index += 1) {
  //         total += leaves[index]!();
  //       }
  //       return total;
  //     }, "write:dirty-root");

  //     blackhole(root());
  //     nextValue = 1;
  //     source.set(nextValue);

  //     return {
  //       runStep() {
  //         nextValue += 1;
  //         source.set(nextValue);
  //         blackhole(nextValue);
  //       },
  //       validate() {
  //         const expected =
  //           leaves.length * nextValue +
  //           ((leaves.length - 1) * leaves.length) / 2;
  //         const actual = root();
  //         if (actual !== expected) {
  //           throw new Error(
  //             `[write-changed-already-unknown-graph] unknown root: expected ${expected}, got ${actual}`,
  //           );
  //         }
  //         nextValue += 1;
  //         source.set(nextValue);
  //       },
  //     };
  //   },
  // },
  // {
  //   id: "empty-batch",
  //   title: "Empty batch",
  //   sampleIterations: 40,
  //   bench: { iterations: 300, warmupIterations: 60 },
  //   build(harness) {
  //     let count = 0;

  //     return {
  //       runStep() {
  //         harness.batch(() => {
  //           count += 1;
  //         });
  //         blackhole(count);
  //       },
  //     };
  //   },
  // },
  // {
  //   id: "write-same-source-already-unknown",
  //   title: "Write dirty pattern / same source",
  //   sampleIterations: 30,
  //   bench: { iterations: 220, warmupIterations: 45 },
  //   build: (harness, seed) =>
  //     createRotatingDirtyWrites(harness, 32, "same", seed),
  // },
  // {
  //   id: "write-rotating-4-sources-already-unknown",
  //   title: "Write dirty pattern / rotating 4 sources",
  //   sampleIterations: 30,
  //   bench: { iterations: 220, warmupIterations: 45 },
  //   build: (harness, seed) =>
  //     createRotatingDirtyWrites(harness, 4, "rotate", seed),
  // },
  // {
  //   id: "write-rotating-32-sources-already-unknown",
  //   title: "Write dirty pattern / rotating 32 sources",
  //   sampleIterations: 30,
  //   bench: { iterations: 220, warmupIterations: 45 },
  //   build: (harness, seed) =>
  //     createRotatingDirtyWrites(harness, 32, "rotate", seed),
  // },
  // {
  //   id: "write-random-32-sources-already-unknown",
  //   title: "Write dirty pattern / random 32 sources",
  //   sampleIterations: 30,
  //   bench: { iterations: 220, warmupIterations: 45 },
  //   build: (harness, seed) =>
  //     createRotatingDirtyWrites(harness, 32, "random", seed),
  // },
  // {
  //   id: "outer-batch-1-write",
  //   title: "Outer batch / 1 write",
  //   sampleIterations: 30,
  //   bench: { iterations: 220, warmupIterations: 45 },
  //   build: (harness) => createOuterBatchWrites(harness, 1),
  // },
  // {
  //   id: "outer-batch-10-writes",
  //   title: "Outer batch / 10 writes",
  //   sampleIterations: 30,
  //   bench: { iterations: 180, warmupIterations: 40 },
  //   build: (harness) => createOuterBatchWrites(harness, 10),
  // },
  // {
  //   id: "outer-batch-100-writes",
  //   title: "Outer batch / 100 writes",
  //   sampleIterations: 24,
  //   bench: { iterations: 140, warmupIterations: 35 },
  //   build: (harness) => createOuterBatchWrites(harness, 100),
  // },
  // {
  //   id: "outer-batch-10000-writes",
  //   title: "Outer batch / 10000 writes",
  //   sampleIterations: 10,
  //   bench: { iterations: 20, warmupIterations: 5 },
  //   build: (harness) => createOuterBatchWrites(harness, 10_000),
  // },
  {
    id: "linear-chain",
    title: "Linear chain",
    bench: { iterations: 220, warmupIterations: 40 },
    build(harness, seed) {
      const rng = createRng(seed);
      const source = harness.signal(1, "chain:source");
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
              `[linear-chain] unknown tap at depth ${depth}: expected ${expected}, got ${actual}`,
            );
          }
        }

        const expectedTail = sourceValue + expectedPrefixSum(191);
        if (tailValue !== expectedTail) {
          throw new Error(
            `[linear-chain] unknown tail: expected ${expectedTail}, got ${tailValue}`,
          );
        }
      };

      return {
        runStep() {
          harness.batch(() => {
            source.set(source() + 1 + rng.int(3));
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
    bench: { iterations: 180, warmupIterations: 35 },
    build(harness, seed) {
      const rng = createRng(seed);
      const source = harness.signal(3, "fanout:source");

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
              `[wide-fan-out] unknown tap at index ${index}: expected ${expected}, got ${actual}`,
            );
          }
        }

        const expected = expectedAggregate(sourceValue);
        if (aggregateValue !== expected) {
          throw new Error(
            `[wide-fan-out] unknown aggregate: expected ${expected}, got ${aggregateValue}`,
          );
        }
      };

      return {
        runStep() {
          harness.batch(() => {
            source.set(source() + 1 + rng.int(5));
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
    bench: { iterations: 190, warmupIterations: 35 },
    build(harness, seed) {
      const rng = createRng(seed);
      const left = harness.signal(1, "diamond:left");
      const right = harness.signal(10, "diamond:right");
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
      let joinValue = NaN;

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
          joinValue = join();
          blackhole(joinValue);
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
              left.set(left() + 1 + rng.int(3));
            } else {
              nextRight += 1 + rng.int(5);
              right.set(nextRight);
            }
            if (rng.int(3) === 0) {
              nextRight += 1;
              right.set(nextRight);
            }
          });
          harness.flush();
        },
        validate() {
          const sum = left() + right();
          const diff = left() - right();
          let expected = 0;
          for (let index = 0; index < 96; ++index) {
            expected += ((index & 1) === 0 ? sum : diff) * ((index % 5) + 1);
          }
          if (joinValue !== expected) {
            throw new Error(
              `[diamond-shared-deps] unknown join: expected ${expected}, got ${joinValue}`,
            );
          }
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
      const selector = harness.signal(0, "dynamic:selector");
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
            total += sources[(base + offset + modeOff) % srcLen]!();
          }
          return total;
        }, `dynamic:branch:${branchIndex}`);
      }

      const aggregate = harness.memo(() => {
        let total = selector();
        for (let i = 0; i < branches.length; ++i) total += branches[i]!();
        return total;
      }, "dynamic:aggregate");
      let aggregateValue = NaN;

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
          aggregateValue = aggregate();
          blackhole(aggregateValue);
        },
        {
          label: "dynamic:aggregate-effect",
          priority: 320,
        },
      );

      return {
        runStep() {
          harness.batch(() => {
            selector.set((selector() + 1) % 3);
            const firstIndex = rng.int(srcLen);
            const secondIndex = (firstIndex + 5 + rng.int(5)) % srcLen;
            const first = sources[firstIndex]!;
            const second = sources[secondIndex]!;
            first.set(first() + 1 + rng.int(4));
            second.set(second() + rng.centered(3));
          });
          harness.flush();
        },
        validate() {
          const mode = selector() % 3;
          const modeOff = mode * 7;
          let expected = selector();
          for (let branchIndex = 0; branchIndex < 72; ++branchIndex) {
            const base = branchIndex * 5;
            for (let offset = 0; offset < 4; ++offset) {
              expected += sources[(base + offset + modeOff) % srcLen]!();
            }
          }
          if (aggregateValue !== expected) {
            throw new Error(
              `[dynamic-deps] unknown aggregate: expected ${expected}, got ${aggregateValue}`,
            );
          }
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
      const source = harness.signal(1, "effects:source");
      const doubled = harness.memo(() => source() * 2, "effects:doubled");
      const effectRuns = new Uint32Array(96);
      let completedSteps = 0;

      for (let index = 0; index < 96; ++index) {
        const addend = (index & 1) === 0 ? index : index * 3;
        const base = (index & 1) === 0 ? source : doubled;
        harness.effect(
          () => {
            effectRuns[index] += 1;
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
          source.set(source() + 1 + rng.int(4));
          harness.flush();
          completedSteps += 1;
        },
        validate() {
          const expectedRuns = completedSteps + 1;
          for (let index = 0; index < effectRuns.length; ++index) {
            if (effectRuns[index] !== expectedRuns) {
              throw new Error(
                `[many-effects-one-source] effect ${index} ran ${effectRuns[index]} times; expected ${expectedRuns}`,
              );
            }
          }
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
      const srcLen = sources.length;
      const total = harness.memo(() => {
        let sum = 0;
        for (let i = 0; i < srcLen; ++i) sum += sources[i]!();
        return sum;
      }, "fanin:total");
      let totalValue = NaN;
      let directValue = NaN;

      harness.effect(
        () => {
          totalValue = total();
          blackhole(totalValue);
        },
        { label: "fanin:total-effect", priority: 512 },
      );
      harness.effect(
        () => {
          directValue = 0;
          for (let i = 0; i < srcLen; i += 16) directValue += sources[i]!();
          blackhole(directValue);
        },
        { label: "fanin:direct-effect", priority: 256 },
      );

      return {
        runStep() {
          harness.batch(() => {
            for (const index of sampler(8, rng, touched)) {
              sources[index]!.set((prev) => prev + 1 + rng.int(6));
            }
          });
          harness.flush();
        },
        validate() {
          let expectedTotal = 0;
          let expectedDirect = 0;
          for (let i = 0; i < srcLen; ++i) expectedTotal += sources[i]!();
          for (let i = 0; i < srcLen; i += 16) expectedDirect += sources[i]!();
          if (totalValue !== expectedTotal || directValue !== expectedDirect) {
            throw new Error(
              `[many-sources-one-sink] expected total/direct ${expectedTotal}/${expectedDirect}, got ${totalValue}/${directValue}`,
            );
          }
        },
      };
    },
  },
  {
    id: "many-sources-one-computed",
    title: "Many sources into one computed -> effect",
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
        for (let i = 0; i < srcLen; ++i) sum += sources[i]!();
        return sum;
      }, "fanin:total");
      let totalValue = NaN;

      harness.effect(
        () => {
          totalValue = total();
          blackhole(totalValue);
        },
        { label: "fanin:total-effect", priority: 512 },
      );

      return {
        runStep() {
          harness.batch(() => {
            for (const index of sampler(8, rng, touched)) {
              sources[index]!.set((prev) => prev + 1 + rng.int(6));
            }
          });
          harness.flush();
        },
        validate() {
          let expected = 0;
          for (let i = 0; i < srcLen; ++i) expected += sources[i]!();
          if (totalValue !== expected) {
            throw new Error(
              `[many-sources-one-computed] expected ${expected}, got ${totalValue}`,
            );
          }
        },
      };
    },
  },
  {
    id: "many-sources-one-direct-effect",
    title: "Many sources into one direct effect",
    bench: { iterations: 140, warmupIterations: 28 },
    build(harness, seed) {
      const rng = createRng(seed);
      const sampler = createUniqueIndexSampler(128);
      const touched: number[] = [];
      const sources = Array.from({ length: 128 }, (_, index) =>
        harness.signal(index, `fanin:source:${index}`),
      );
      const srcLen = sources.length;
      let directValue = NaN;
      let effectRuns = 0;
      let step = 0;

      harness.effect(
        () => {
          effectRuns += 1;
          directValue = 0;
          for (let i = 0; i < srcLen; i += 16) directValue += sources[i]!();
          blackhole(directValue);
        },
        { label: "fanin:direct-effect", priority: 256 },
      );

      return {
        runStep() {
          const indices = sampler(8, rng, touched);
          const watchedIndex = (step & 7) << 4;
          if (!indices.includes(watchedIndex)) touched[0] = watchedIndex;
          harness.batch(() => {
            for (const index of indices) {
              sources[index]!.set((prev) => prev + 1 + rng.int(6));
            }
          });
          step += 1;
          harness.flush();
        },
        validate() {
          let expected = 0;
          for (let i = 0; i < srcLen; i += 16) expected += sources[i]!();
          const expectedRuns = step + 1;
          if (directValue !== expected || effectRuns !== expectedRuns) {
            throw new Error(
              `[many-sources-one-direct-effect] expected value/runs ${expected}/${expectedRuns}, got ${directValue}/${effectRuns}`,
            );
          }
        },
      };
    },
  },
];
