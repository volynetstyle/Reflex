import {
  createConsumer,
  createProducer,
  resetRuntime,
  readConsumer,
  readProducer,
  writeProducer,
  type ReactiveNode,
} from "../../runtime.test_utils";

/**
 * Side-effect-free workload builders shared by the cost-attribution sweep
 * (structural and timing runs). Nothing in this module runs at import time —
 * every function below only mutates runtime state when called, and each
 * builder starts with its own `resetRuntime()` so builders never interact
 * with each other's graph state.
 */

export type BenchCase = {
  step(iteration: number): number;
};

let blackholeValue = 0;

function blackhole(value: number): void {
  blackholeValue ^= value | 0;
}

export function getBlackhole(): number {
  return blackholeValue;
}

/** depth axis: a linear chain of `depth` computed nodes, one dirty write per step. */
export function createChainCase(depth: number): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  let node = createConsumer(() => readProducer(source) + 1);

  for (let index = 1; index < depth; index += 1) {
    const previous = node;
    node = createConsumer(() => readConsumer(previous) + 1);
  }

  blackhole(readConsumer(node));
  let nextValue = 0;

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return readConsumer(node) ^ iteration;
    },
  };
}

/** fanout axis: one producer, `fanout` direct computed subscribers, summed by a root. */
export function createFanoutCase(fanout: number): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  const leaves: ReactiveNode<number>[] = [];

  for (let index = 0; index < fanout; index += 1) {
    leaves.push(createConsumer(() => readProducer(source) + index));
  }

  const root = createConsumer(() => {
    let total = 0;
    for (let index = 0; index < leaves.length; index += 1) {
      total += readConsumer(leaves[index]!);
    }
    return total;
  });

  blackhole(readConsumer(root));
  let nextValue = 0;

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return readConsumer(root) ^ iteration;
    },
  };
}

/** fanin axis: one root consumer that fans in from `fanin` independent producers. */
export function createFaninCase(fanin: number): BenchCase {
  resetRuntime();

  const sources = Array.from({ length: fanin }, (_, index) =>
    createProducer(index),
  );
  const root = createConsumer(() => {
    let total = 0;
    for (let index = 0; index < sources.length; index += 1) {
      total += readProducer(sources[index]!);
    }
    return total;
  });

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      const index = iteration % sources.length;
      // Offset by sources.length so this can never equal the producer's own
      // construction value (`createProducer(index)`) on its first write —
      // an equal-value write is a same-value no-op that skips propagation
      // entirely, which would silently degenerate this sweep once
      // width > iterations.
      writeProducer(sources[index]!, iteration + sources.length);
      return readConsumer(root) ^ iteration;
    },
  };
}

/**
 * dependency-width axis: a single consumer tracking `width` producers in a
 * fixed, stable read order every step (isolates tracking-resolve cost from
 * churn/reorder cost — see createChurnCase for the churn variant).
 */
export function createDependencyWidthCase(width: number): BenchCase {
  resetRuntime();

  const sources = Array.from({ length: width }, (_, index) =>
    createProducer(index),
  );
  const root = createConsumer(() => {
    let total = 0;
    for (let index = 0; index < sources.length; index += 1) {
      total += readProducer(sources[index]!);
    }
    return total;
  });

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      // See createFaninCase for why this is offset by sources.length.
      writeProducer(
        sources[iteration % sources.length]!,
        iteration + sources.length,
      );
      return readConsumer(root);
    },
  };
}

/**
 * churn-rate axis: a consumer that tracks `width` producers per pass, where a
 * deterministic `churnRate` fraction of read positions are redirected to a
 * different producer identity each step (dependency-set churn, not just
 * value churn). No RNG: position `i` for `i < changingCount` cycles through a
 * spare pool via `(i + step) % poolSize`, so the same `step` always produces
 * the same pattern.
 */
export function createChurnCase(width: number, churnRate: number): BenchCase {
  resetRuntime();

  const poolSize = width * 2;
  const pool = Array.from({ length: poolSize }, (_, index) =>
    createProducer(index),
  );
  const changingCount = Math.round(churnRate * width);

  function patternFor(step: number): ReactiveNode<number>[] {
    const pattern: ReactiveNode<number>[] = new Array(width);
    for (let i = 0; i < width; i += 1) {
      pattern[i] =
        i < changingCount ? pool[(i + step) % poolSize]! : pool[i]!;
    }
    return pattern;
  }

  const selector = createProducer(0);
  const root = createConsumer(() => {
    const pattern = patternFor(readProducer(selector));
    let total = 0;
    for (let index = 0; index < pattern.length; index += 1) {
      total += readProducer(pattern[index]!);
    }
    return total;
  });

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      // +1 / +poolSize avoid same-value no-op writes on the first touch of
      // selector / a given pool producer (see createFaninCase).
      writeProducer(selector, iteration + 1);
      writeProducer(pool[iteration % poolSize]!, iteration + poolSize);
      return readConsumer(root) ^ iteration;
    },
  };
}

/**
 * semantic-change-ratio axis: a computed whose recompute changes its output
 * on exactly `changesPerCycle` out of every `cycleLen` writes, deterministic
 * in the producer's own value so the ratio is exact and can be independently
 * verified without touching runtime internals. Grid values 0/25/50/75/100%
 * map onto cycleLen=4 exactly (0,1,2,3,4 of 4).
 */
export function createSemanticRatioCase(
  width: number,
  ratio: number,
): {
  case: BenchCase;
  getObservedRatio(): number;
  resetObservedRatio(): void;
} {
  resetRuntime();

  const cycleLen = 4;
  const changesPerCycle = Math.round(ratio * cycleLen);

  function scheduledOutput(writeIndex: number): number {
    const cycles = Math.floor(writeIndex / cycleLen);
    const withinCycle = Math.min(writeIndex % cycleLen, changesPerCycle);
    return cycles * changesPerCycle + withinCycle;
  }

  const source = createProducer(0);
  let evaluated = 0;
  let changed = 0;
  const lastReturned: number[] = new Array(width).fill(Number.NaN);

  const children = Array.from({ length: width }, (_, index) =>
    createConsumer(() => {
      const value = scheduledOutput(readProducer(source));
      evaluated += 1;
      if (value !== lastReturned[index]) {
        changed += 1;
        lastReturned[index] = value;
      }
      return value;
    }),
  );

  const root = createConsumer(() => {
    let total = 0;
    for (let index = 0; index < children.length; index += 1) {
      total += readConsumer(children[index]!);
    }
    return total;
  });

  blackhole(readConsumer(root));

  return {
    case: {
      step(iteration) {
        writeProducer(source, iteration + 1);
        return readConsumer(root) ^ iteration;
      },
    },
    getObservedRatio() {
      return evaluated === 0 ? 0 : changed / evaluated;
    },
    resetObservedRatio() {
      evaluated = 0;
      changed = 0;
    },
  };
}

export type LocalityMode = "stable" | "permutation" | "distant-reuse" | "duplicate-reads";

/** read-locality axis: same dependency set, different per-pass read order/repetition. */
export function createLocalityCase(width: number, mode: LocalityMode): BenchCase {
  resetRuntime();

  const sources = Array.from({ length: width }, (_, index) =>
    createProducer(index),
  );
  const selector = createProducer(0);

  const root = createConsumer(() => {
    const step = readProducer(selector);
    let total = 0;

    if (mode === "stable") {
      for (let index = 0; index < width; index += 1) {
        total += readProducer(sources[index]!);
      }
    } else if (mode === "permutation") {
      for (let index = 0; index < width; index += 1) {
        total += readProducer(sources[(index + step) % width]!);
      }
    } else if (mode === "distant-reuse") {
      for (let index = 0; index < width; index += 1) {
        total += readProducer(sources[index]!);
      }
      total += readProducer(sources[0]!);
    } else {
      for (let index = 0; index < width; index += 1) {
        total += readProducer(sources[index]!);
        if (index === 0) total += readProducer(sources[0]!);
      }
    }

    return total;
  });

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      writeProducer(selector, iteration + 1);
      writeProducer(sources[iteration % width]!, iteration + width);
      return readConsumer(root) ^ iteration;
    },
  };
}
