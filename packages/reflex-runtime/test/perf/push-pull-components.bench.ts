import { beforeAll, bench, describe } from "vitest";
import { performance } from "node:perf_hooks";
import {
  createConsumer,
  createProducer,
  createWatcher,
  configureRuntimeContext,
  enterReactiveBatch,
  enterPropagationScope,
  leaveReactiveBatch,
  leavePropagationScope,
  profileRuntime,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
  setRuntimeProfilingEnabled,
  writeProducer,
  type ReactiveNode,
  type RuntimeProfileCounters,
  type RuntimeProfileTopologyWalker,
  type RuntimeHooks,
} from "../runtime.test_utils";

function runWithReactiveBatch<T>(fn: () => T): T {
  enterReactiveBatch();
  try {
    return fn();
  } finally {
    leaveReactiveBatch();
  }
}

function setInternalHooks(
  onNodeInvalidated: RuntimeHooks["onNodeInvalidated"] = undefined,
  onRuntimeIdle: RuntimeHooks["onRuntimeIdle"] = undefined,
): void {
  configureRuntimeContext({
    hooks: { onNodeInvalidated, onRuntimeIdle },
  });
}

const WARMUP_ITERATIONS = 100;
const ITERATIONS = 1_000;

let blackholeValue = 0;

function blackhole(value: number): void {
  blackholeValue ^= value | 0;
}

type BenchCase = {
  step(iteration: number): number;
  verify?(checksum: number): void;
};

type ComponentScenario = {
  id: string;
  group: "write" | "push" | "pull" | "tracking" | "watcher";
  label: string;
  create(): BenchCase;
};

type ProfileScenario = {
  id: string;
  group:
    | "fanout"
    | "pull-depth"
    | "topology"
    | "scheduler"
    | "tracking"
    | "app"
    | "locality";
  label: string;
  iterations: number;
  create(): BenchCase;
};

function compactCounters(
  counters: RuntimeProfileCounters,
): Partial<RuntimeProfileCounters> {
  const compact: Partial<RuntimeProfileCounters> = {};

  for (const [name, value] of Object.entries(counters)) {
    if (value !== 0) {
      compact[name as keyof RuntimeProfileCounters] = value;
    }
  }

  return compact;
}

function createWideFanout(
  leafCount: number,
  dirtyBeforeStep: boolean,
): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  const leaves: ReactiveNode<number>[] = [];
  let nextValue = 0;

  for (let index = 0; index < leafCount; index += 1) {
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

  if (dirtyBeforeStep) {
    nextValue += 1;
    writeProducer(source, nextValue);
  }

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return iteration ^ nextValue;
    },
    verify() {
      const expected =
        leaves.length * nextValue + ((leaves.length - 1) * leaves.length) / 2;
      const actual = readConsumer(root);

      if (actual !== expected) {
        throw new Error(
          `${leafCount}-fanout expected ${expected}, got ${actual}`,
        );
      }

      if (dirtyBeforeStep) {
        nextValue += 1;
        writeProducer(source, nextValue);
      }
    },
  };
}

function createRotatingDirtySources(sourceCount: number): BenchCase {
  resetRuntime();

  const sources = Array.from({ length: sourceCount }, (_, index) =>
    createProducer(index),
  );
  const leaves = sources.map((source, index) =>
    createConsumer(() => readProducer(source) + index),
  );
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < leaves.length; index += 1) {
      total += readConsumer(leaves[index]!);
    }

    return total;
  });
  const values = Array.from({ length: sourceCount }, (_, index) => index);
  let tick = 0;

  blackhole(readConsumer(root));
  values[0] += 1;
  writeProducer(sources[0]!, values[0]!);

  return {
    step(iteration) {
      const index = iteration % sourceCount;
      values[index] += 1;
      writeProducer(sources[index]!, values[index]!);
      tick += 1;
      return tick ^ values[index]!;
    },
    verify() {
      let expected = 0;

      for (let index = 0; index < values.length; index += 1) {
        expected += values[index]! + index;
      }

      const actual = readConsumer(root);

      if (actual !== expected) {
        throw new Error(
          `rotating-${sourceCount} expected ${expected}, got ${actual}`,
        );
      }

      values[0] += 1;
      writeProducer(sources[0]!, values[0]!);
    },
  };
}

function createChainDirtyFinalRead(depth: number): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  let node = createConsumer(() => readProducer(source) + 1);
  let nextValue = 0;

  for (let index = 1; index < depth; index += 1) {
    const previous = node;
    node = createConsumer(() => readConsumer(previous) + 1);
  }

  blackhole(readConsumer(node));

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return readConsumer(node) ^ iteration;
    },
    verify(checksum) {
      blackhole(checksum);
    },
  };
}

function createStableTracking(width: number): BenchCase {
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
      writeProducer(sources[0]!, iteration);
      return readConsumer(root);
    },
  };
}

function createDistantDuplicateTracking(width: number): BenchCase {
  resetRuntime();

  const sources = Array.from({ length: width }, (_, index) =>
    createProducer(index),
  );
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < sources.length; index += 1) {
      total += readProducer(sources[index]!);
    }

    return total + readProducer(sources[0]!);
  });

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      writeProducer(sources[1]!, iteration);
      return readConsumer(root);
    },
  };
}

function createWatcherFanout(watcherCount: number): BenchCase {
  let scheduled = 0;

  resetRuntime({
    onNodeInvalidated() {
      scheduled += 1;
    },
  });

  const source = createProducer(0);
  const watchers = Array.from({ length: watcherCount }, () =>
    createWatcher(() => {
      blackhole(readProducer(source));
    }),
  );
  let nextValue = 0;

  for (const watcher of watchers) {
    runWatcher(watcher);
  }

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return scheduled ^ iteration;
    },
  };
}

function createMixedWatcherComputedFanout(
  computedCount: number,
  watcherCount: number,
): BenchCase {
  let scheduled = 0;

  resetRuntime({
    onNodeInvalidated() {
      scheduled += 1;
    },
  });

  const source = createProducer(0);
  const computed = Array.from({ length: computedCount }, (_, index) =>
    createConsumer(() => readProducer(source) + index),
  );
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < computed.length; index += 1) {
      total += readConsumer(computed[index]!);
    }

    return total;
  });
  const watchers = Array.from({ length: watcherCount }, (_, index) =>
    createWatcher(() => readProducer(source) + index),
  );
  let nextValue = 0;

  blackhole(readConsumer(root));

  for (const watcher of watchers) {
    runWatcher(watcher);
  }

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return scheduled ^ iteration;
    },
  };
}

function createDiamondFanout(width: number): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  const middles = Array.from({ length: width }, (_, index) =>
    createConsumer(() => readProducer(source) + index),
  );
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < middles.length; index += 1) {
      total += readConsumer(middles[index]!);
    }

    return total;
  });
  let nextValue = 0;

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return readConsumer(root) ^ iteration;
    },
  };
}

function createLayeredFanout(width: number, depth: number): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  let layer = Array.from({ length: width }, (_, index) =>
    createConsumer(() => readProducer(source) + index),
  );

  for (let level = 1; level < depth; level += 1) {
    const previous = layer;
    layer = Array.from({ length: width }, (_, index) => {
      const left = previous[index]!;
      const right = previous[(index + 1) % previous.length]!;

      return createConsumer(() => readConsumer(left) + readConsumer(right));
    });
  }

  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < layer.length; index += 1) {
      total += readConsumer(layer[index]!);
    }

    return total;
  });
  let nextValue = 0;

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return readConsumer(root) ^ iteration;
    },
  };
}

function createSharedSubgraph(width: number): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  const shared = createConsumer(() => readProducer(source) + 1);
  const branches = Array.from({ length: width }, (_, index) =>
    createConsumer(() => readConsumer(shared) + index),
  );
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < branches.length; index += 1) {
      total += readConsumer(branches[index]!);
    }

    return total;
  });
  let nextValue = 0;

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return readConsumer(root) ^ iteration;
    },
  };
}

function createBranchingPullTree(branching: number, depth: number): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  let layer = [createConsumer(() => readProducer(source) + 1)];

  for (let level = 1; level < depth; level += 1) {
    const previous = layer;
    layer = [];

    for (let index = 0; index < previous.length; index += 1) {
      const parent = previous[index]!;

      for (let child = 0; child < branching; child += 1) {
        layer.push(createConsumer(() => readConsumer(parent) + child));
      }
    }
  }

  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < layer.length; index += 1) {
      total += readConsumer(layer[index]!);
    }

    return total;
  });
  let nextValue = 0;

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      nextValue += 1;
      writeProducer(source, nextValue);
      return readConsumer(root) ^ iteration;
    },
  };
}

function createLocalityChain(depth: number, fragmented: boolean): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  let tail = createConsumer(() => readProducer(source) + 1);

  for (let index = 1; index < depth; index += 1) {
    if (fragmented) {
      for (let junk = 0; junk < 8; junk += 1) {
        const noise = createProducer(junk);
        blackhole(readProducer(noise));
      }
    }

    const previous = tail;
    tail = createConsumer(() => readConsumer(previous) + 1);
  }

  blackhole(readConsumer(tail));

  return {
    step(iteration) {
      writeProducer(source, iteration);
      return readConsumer(tail);
    },
  };
}

function createLocalityFanout(width: number, fragmented: boolean): BenchCase {
  resetRuntime();

  const source = createProducer(0);
  const leaves: ReactiveNode<number>[] = [];

  for (let index = 0; index < width; index += 1) {
    if (fragmented) {
      for (let junk = 0; junk < 8; junk += 1) {
        const noise = createProducer(junk);
        blackhole(readProducer(noise));
      }
    }

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

  return {
    step(iteration) {
      writeProducer(source, iteration);
      return readConsumer(root);
    },
  };
}

function createWriteOnly(): BenchCase {
  resetRuntime();

  const source = createProducer(0);

  return {
    step(iteration) {
      writeProducer(source, iteration);
      return iteration;
    },
  };
}

function createWriteSettledSuppressed(): BenchCase {
  let scopeOpen = true;

  resetRuntime({
    onRuntimeIdle() {
      blackhole(1);
    },
  });

  const source = createProducer(0);
  enterPropagationScope();

  return {
    step(iteration) {
      writeProducer(source, iteration);
      return iteration;
    },
    dispose() {
      if (scopeOpen) {
        scopeOpen = false;
        leavePropagationScope();
      }
    },
  };
}

function createWriteSettledEmitted(): BenchCase {
  let settled = 0;

  resetRuntime({
    onRuntimeIdle() {
      settled += 1;
    },
  });

  const source = createProducer(0);

  return {
    step(iteration) {
      enterPropagationScope();
      writeProducer(source, iteration);
      leavePropagationScope();
      return settled ^ iteration;
    },
  };
}

function createEmptyBatch(depth: number): BenchCase {
  resetRuntime();

  function nestedBatch(level: number): void {
    runWithReactiveBatch(() => {
      if (level > 1) nestedBatch(level - 1);
    });
  }

  return {
    step(iteration) {
      nestedBatch(depth);
      return iteration;
    },
  };
}

function createWatcherScheduledOnly(width: number): BenchCase {
  let scheduled = 0;

  resetRuntime({
    onNodeInvalidated() {
      scheduled += 1;
    },
  });

  const source = createProducer(0);
  const watchers = Array.from({ length: width }, () =>
    createWatcher(() => readProducer(source)),
  );

  for (const watcher of watchers) {
    runWatcher(watcher);
  }

  return {
    step(iteration) {
      writeProducer(source, iteration);
      return scheduled;
    },
  };
}

function createWatcherScheduledAndExecuted(width: number): BenchCase {
  const queue: ReactiveNode[] = [];

  resetRuntime();
  setInternalHooks((node) => {
    queue.push(node);
  });

  const source = createProducer(0);
  const watchers = Array.from({ length: width }, () =>
    createWatcher(() => readProducer(source)),
  );

  for (const watcher of watchers) {
    runWatcher(watcher);
  }

  return {
    step(iteration) {
      writeProducer(source, iteration);

      let flushed = 0;
      while (queue.length !== 0) {
        runWatcher(queue.shift()!);
        flushed += 1;
      }

      return flushed;
    },
    dispose() {
      setInternalHooks(undefined, undefined);
    },
  };
}

function createDependencyPatternChurn(patterns: number[][]): BenchCase {
  resetRuntime();

  const selector = createProducer(0);
  const sources = Array.from(
    { length: getPatternSourceCount(patterns) },
    (_, index) => createProducer(index),
  );
  const root = createConsumer(() => {
    const pattern = patterns[readProducer(selector) % patterns.length]!;
    let total = 0;

    for (let index = 0; index < pattern.length; index += 1) {
      total += readProducer(sources[pattern[index]!]!);
    }

    return total;
  });

  blackhole(readConsumer(root));

  return {
    step(iteration) {
      writeProducer(selector, iteration % patterns.length);
      writeProducer(
        sources[iteration % sources.length]!,
        iteration + sources.length,
      );
      return readConsumer(root);
    },
  };
}

function getPatternSourceCount(patterns: number[][]): number {
  let max = 0;

  for (const pattern of patterns) {
    for (const sourceIndex of pattern) {
      if (sourceIndex > max) max = sourceIndex;
    }
  }

  return max + 1;
}

function range(length: number, start = 0): number[] {
  return Array.from({ length }, (_, index) => start + index);
}

function rotatePatterns(width: number): number[][] {
  return Array.from({ length: width }, (_, step) =>
    Array.from({ length: width }, (__, index) => (index + step) % width),
  );
}

function adjacentSwapPatterns(width: number): number[][] {
  return Array.from({ length: width }, (_, step) => {
    const pattern = range(width);
    const index = step % (width - 1);

    [pattern[index], pattern[index + 1]] = [
      pattern[index + 1]!,
      pattern[index]!,
    ];

    return pattern;
  });
}

function prefixSuffixChurnPatterns(width: number): number[][] {
  const stable = Math.floor(width * 0.75);

  return Array.from({ length: width }, (_, step) => [
    ...range(stable),
    ...Array.from(
      { length: width - stable },
      (__, index) => stable + ((index + step) % (width - stable)),
    ),
  ]);
}

function oscillateABPatterns(width: number): number[][] {
  return [range(width), range(width, width)];
}

function chaoticPatterns(width: number): number[][] {
  return Array.from({ length: width }, (_, step) =>
    Array.from(
      { length: width },
      (__, index) => (index * 37 + step * 19) % width,
    ),
  );
}

function appFormPatterns(width: number): number[][] {
  const stable = range(width);

  return Array.from({ length: 100 }, (_, step) => {
    if (step % 20 !== 0) return stable;

    const pattern = range(width);
    const index = (step * 7) % (width - 1);

    [pattern[index], pattern[index + 1]] = [
      pattern[index + 1]!,
      pattern[index]!,
    ];

    return pattern;
  });
}

function appTablePatterns(width: number): number[][] {
  return Array.from({ length: 100 }, (_, step) => {
    if (step % 10 === 0) return rotatePatterns(width)[step % width]!;
    if (step % 5 === 0) return adjacentSwapPatterns(width)[step % width]!;
    return range(width);
  });
}

function appListPatterns(width: number): number[][] {
  return Array.from({ length: 100 }, (_, step) => {
    if (step % 8 === 0) return prefixSuffixChurnPatterns(width)[step % width]!;
    if (step % 4 === 0) return adjacentSwapPatterns(width)[step % width]!;
    return range(width);
  });
}

function appTreePatterns(width: number): number[][] {
  return Array.from({ length: 100 }, (_, step) => {
    if (step % 10 === 0) return chaoticPatterns(width)[step % width]!;
    if (step % 3 === 0) return rotatePatterns(width)[step % width]!;
    return range(width);
  });
}

function appConditionalPatterns(width: number): number[][] {
  const left = range(width);
  const right = range(width, width);

  return Array.from({ length: 100 }, (_, step) => {
    if (step % 16 === 0) return right;
    if (step % 16 === 1) return left;
    if (step % 5 === 0) return adjacentSwapPatterns(width)[step % width]!;
    return left;
  });
}

const scenarios: ComponentScenario[] = [
  {
    id: "write.same-value",
    group: "write",
    label: "write / same value / no propagation",
    create() {
      resetRuntime();
      const source = createProducer(1);

      return {
        step(iteration) {
          writeProducer(source, 1);
          return iteration;
        },
      };
    },
  },
  {
    id: "write.changed-no-subscribers",
    group: "write",
    label: "write / changed / no subscribers",
    create() {
      resetRuntime();
      const source = createProducer(0);
      let nextValue = 0;

      return {
        step(iteration) {
          nextValue += 1;
          writeProducer(source, nextValue);
          return iteration ^ nextValue;
        },
      };
    },
  },
  {
    id: "push.direct-one-subscriber",
    group: "push",
    label: "push / direct one subscriber",
    create: () => createWideFanout(1, false),
  },
  {
    id: "push.wide-clean-fanout",
    group: "push",
    label: "push / wide clean fanout / 192 leaves",
    create: () => createWideFanout(192, false),
  },
  {
    id: "push.wide-already-dirty-fanout",
    group: "push",
    label: "push / wide already-dirty fanout / 192 leaves",
    create: () => createWideFanout(192, true),
  },
  {
    id: "push.rotating-4-dirty-sources",
    group: "push",
    label: "push / rotating 4 sources / already dirty root",
    create: () => createRotatingDirtySources(4),
  },
  {
    id: "push.rotating-32-dirty-sources",
    group: "push",
    label: "push / rotating 32 sources / already dirty root",
    create: () => createRotatingDirtySources(32),
  },
  {
    id: "pull.chain-final-read",
    group: "pull",
    label: "pull / dirty final read / chain depth 32",
    create: () => createChainDirtyFinalRead(32),
  },
  {
    id: "tracking.stable-wide",
    group: "tracking",
    label: "tracking / stable order / width 128",
    create: () => createStableTracking(128),
  },
  {
    id: "tracking.rotate-wide",
    group: "tracking",
    label: "tracking / rotate / width 128",
    create: () => createDependencyPatternChurn(rotatePatterns(128)),
  },
  {
    id: "tracking.swap-wide",
    group: "tracking",
    label: "tracking / swap adjacent / width 128",
    create: () => createDependencyPatternChurn(adjacentSwapPatterns(128)),
  },
  {
    id: "tracking.prefix-suffix-wide",
    group: "tracking",
    label: "tracking / prefix suffix / width 128",
    create: () => createDependencyPatternChurn(prefixSuffixChurnPatterns(128)),
  },
  {
    id: "tracking.oscillate-wide",
    group: "tracking",
    label: "tracking / oscillate / width 128",
    create: () => createDependencyPatternChurn(oscillateABPatterns(128)),
  },
  {
    id: "tracking.chaotic-wide",
    group: "tracking",
    label: "tracking / chaotic / width 128",
    create: () => createDependencyPatternChurn(chaoticPatterns(128)),
  },
  {
    id: "tracking.distant-duplicate-wide",
    group: "tracking",
    label: "tracking / distant duplicate / width 128",
    create: () => createDistantDuplicateTracking(128),
  },
  {
    id: "watcher.fanout",
    group: "watcher",
    label: "watcher / invalidation fanout / 128 watchers",
    create: () => createWatcherFanout(128),
  },
];

const fanoutSizes = [1, 4, 16, 64, 192, 512, 1024] as const;
const pullDepths = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const;
const trackingRouteCounters = [
  "trackingCursorHit",
  "trackingNextHit",
  "trackingAppendAfterCursor",
  "trackingPrefixDuplicate",
  "trackingOneHopReorder",
  "trackingTwoHopReorder",
  "trackingLastEdgeShortcut",
  "trackingInitialCreate",
  "trackingInitialFirstHit",
  "trackingInitialLastEdgeShortcut",
  "trackingSlowPath",
  "trackingSlowPathBlocked",
  "trackingOutgoingProbeHit1",
  "trackingOutgoingProbeMiss",
] as const satisfies readonly (keyof RuntimeProfileCounters)[];

const profileScenarios: ProfileScenario[] = [
  ...fanoutSizes.flatMap((size) => [
    {
      id: `fanout.clean.${size}`,
      group: "fanout" as const,
      label: `fanout clean ${size}`,
      iterations: size >= 512 ? 40 : 100,
      create: () => createWideFanout(size, false),
    },
    {
      id: `fanout.already-dirty.${size}`,
      group: "fanout" as const,
      label: `fanout already dirty ${size}`,
      iterations: size >= 512 ? 40 : 100,
      create: () => createWideFanout(size, true),
    },
    {
      id: `fanout.watchers.${size}`,
      group: "fanout" as const,
      label: `fanout watchers ${size}`,
      iterations: size >= 512 ? 40 : 100,
      create: () => createWatcherFanout(size),
    },
    {
      id: `fanout.mixed.${size}`,
      group: "fanout" as const,
      label: `fanout mixed watcher+computed ${size}`,
      iterations: size >= 512 ? 30 : 80,
      create: () =>
        createMixedWatcherComputedFanout(
          Math.max(1, Math.floor(size / 2)),
          Math.max(1, Math.ceil(size / 2)),
        ),
    },
  ]),
  ...pullDepths.map((depth) => ({
    id: `pull.chain.${depth}`,
    group: "pull-depth" as const,
    label: `pull chain depth ${depth}`,
    iterations: depth >= 128 ? 30 : 80,
    create: () => createChainDirtyFinalRead(depth),
  })),
  ...[4, 16, 64].map((width) => ({
    id: `diamond.${width}`,
    group: "topology" as const,
    label: `diamond ${width}`,
    iterations: 60,
    create: () => createDiamondFanout(width),
  })),
  {
    id: "layered.width4.depth4",
    group: "topology",
    label: "layered width 4 depth 4",
    iterations: 60,
    create: () => createLayeredFanout(4, 4),
  },
  {
    id: "layered.width16.depth8",
    group: "topology",
    label: "layered width 16 depth 8",
    iterations: 30,
    create: () => createLayeredFanout(16, 8),
  },
  {
    id: "shared-subgraph.64",
    group: "topology",
    label: "shared subgraph 64",
    iterations: 60,
    create: () => createSharedSubgraph(64),
  },
  {
    id: "pull.binary-tree.depth8",
    group: "topology",
    label: "pull binary tree depth 8",
    iterations: 30,
    create: () => createBranchingPullTree(2, 8),
  },
  {
    id: "pull.quad-tree.depth5",
    group: "topology",
    label: "pull quad tree depth 5",
    iterations: 30,
    create: () => createBranchingPullTree(4, 5),
  },
  {
    id: "scheduler.write-only",
    group: "scheduler",
    label: "write only",
    iterations: 200,
    create: createWriteOnly,
  },
  {
    id: "scheduler.settled-suppressed",
    group: "scheduler",
    label: "write + settled suppressed",
    iterations: 200,
    create: createWriteSettledSuppressed,
  },
  {
    id: "scheduler.settled-emitted",
    group: "scheduler",
    label: "write + settled emitted",
    iterations: 200,
    create: createWriteSettledEmitted,
  },
  {
    id: "scheduler.batch-empty",
    group: "scheduler",
    label: "batch enter/exit",
    iterations: 200,
    create: () => createEmptyBatch(1),
  },
  {
    id: "scheduler.batch-nested",
    group: "scheduler",
    label: "nested batch depth 8",
    iterations: 200,
    create: () => createEmptyBatch(8),
  },
  {
    id: "scheduler.watcher-scheduled",
    group: "scheduler",
    label: "watcher scheduled 128",
    iterations: 80,
    create: () => createWatcherScheduledOnly(128),
  },
  {
    id: "scheduler.watcher-executed",
    group: "scheduler",
    label: "watcher executed 128",
    iterations: 40,
    create: () => createWatcherScheduledAndExecuted(128),
  },
  {
    id: "tracking.stable.128",
    group: "tracking",
    label: "tracking stable 128",
    iterations: 60,
    create: () => createDependencyPatternChurn([range(128)]),
  },
  {
    id: "tracking.rotate.128",
    group: "tracking",
    label: "tracking rotate 128",
    iterations: 60,
    create: () => createDependencyPatternChurn(rotatePatterns(128)),
  },
  {
    id: "tracking.swap-adjacent.128",
    group: "tracking",
    label: "tracking swap adjacent 128",
    iterations: 60,
    create: () => createDependencyPatternChurn(adjacentSwapPatterns(128)),
  },
  {
    id: "tracking.prefix-suffix.128",
    group: "tracking",
    label: "tracking prefix stable + suffix churn 128",
    iterations: 60,
    create: () => createDependencyPatternChurn(prefixSuffixChurnPatterns(128)),
  },
  {
    id: "tracking.oscillate-ab.128",
    group: "tracking",
    label: "tracking oscillate A/B 128",
    iterations: 60,
    create: () => createDependencyPatternChurn(oscillateABPatterns(128)),
  },
  {
    id: "tracking.chaotic.128",
    group: "tracking",
    label: "tracking chaotic 128",
    iterations: 60,
    create: () => createDependencyPatternChurn(chaoticPatterns(128)),
  },
  {
    id: "app.form.128",
    group: "app",
    label: "app form 128",
    iterations: 100,
    create: () => createDependencyPatternChurn(appFormPatterns(128)),
  },
  {
    id: "app.table.128",
    group: "app",
    label: "app table 128",
    iterations: 100,
    create: () => createDependencyPatternChurn(appTablePatterns(128)),
  },
  {
    id: "app.list.128",
    group: "app",
    label: "app list 128",
    iterations: 100,
    create: () => createDependencyPatternChurn(appListPatterns(128)),
  },
  {
    id: "app.tree.128",
    group: "app",
    label: "app tree 128",
    iterations: 100,
    create: () => createDependencyPatternChurn(appTreePatterns(128)),
  },
  {
    id: "app.conditional.128",
    group: "app",
    label: "app conditional 128",
    iterations: 100,
    create: () => createDependencyPatternChurn(appConditionalPatterns(128)),
  },
  {
    id: "locality.chain.compact.1024",
    group: "locality",
    label: "locality chain compact 1024",
    iterations: 20,
    create: () => createLocalityChain(1024, false),
  },
  {
    id: "locality.chain.fragmented.1024",
    group: "locality",
    label: "locality chain fragmented 1024",
    iterations: 20,
    create: () => createLocalityChain(1024, true),
  },
  {
    id: "locality.fanout.compact.1024",
    group: "locality",
    label: "locality fanout compact 1024",
    iterations: 20,
    create: () => createLocalityFanout(1024, false),
  },
  {
    id: "locality.fanout.fragmented.1024",
    group: "locality",
    label: "locality fanout fragmented 1024",
    iterations: 20,
    create: () => createLocalityFanout(1024, true),
  },
];

function printProfile(scenario: ComponentScenario): void {
  const instance = scenario.create();
  const { value, counters } = profileRuntime(() => instance.step(1));
  instance.verify?.(value);

  process.stdout.write(`\n${scenario.label}\n`);
  console.table([compactCounters(counters)]);
  setRuntimeProfilingEnabled(false);
}

function logPushPullTopologyProfiles(): void {
  console.log("\n[bench:runtime] push/pull topology route profiles");

  console.table(
    scenarios.map((scenario) => {
      const instance = scenario.create();
      const { value, topology } = profileRuntime(() => instance.step(1));
      instance.verify?.(value);
      setRuntimeProfilingEnabled(false);

      return formatTopologyProfileRow(scenario, topology.push, topology.pull);
    }),
  );
}

function formatTopologyProfileRow(
  scenario: ComponentScenario,
  push: RuntimeProfileTopologyWalker,
  pull: RuntimeProfileTopologyWalker,
): Record<string, string | number> {
  const row: Record<string, string | number> = {
    scenario: scenario.id,
    group: scenario.group,
  };

  appendWalkerProfile(row, "push", push);
  appendWalkerProfile(row, "pull", pull);

  return row;
}

function appendWalkerProfile(
  row: Record<string, string | number>,
  prefix: "push" | "pull",
  walker: RuntimeProfileTopologyWalker,
): void {
  if (walker.total === 0) {
    return;
  }

  row[`${prefix}.events`] = walker.total;
  row[`${prefix}.maxDepth`] = walker.maxDepth;
  row[`${prefix}.maxStack`] = walker.maxStack;
  row[`${prefix}.fanIn`] = formatTopBucket(walker.fanIn, walker.total);
  row[`${prefix}.fanOut`] = formatTopBucket(walker.fanOut, walker.total);
  row[`${prefix}.depth`] = formatTopBucket(walker.depth, walker.total);
  row[`${prefix}.hotShapes`] = walker.hotPaths
    .slice(0, 3)
    .map((item) => `${item.path} ${formatCountPct(item.count, walker.total)}`)
    .join(" | ");

  for (const [branch, count] of Object.entries(walker.branch)) {
    row[`${prefix}.${branch}`] = formatCountPct(count, walker.total);
  }
}

function formatTopBucket(
  buckets: Record<string, number>,
  total: number,
): string {
  let topKey = "";
  let topCount = 0;

  for (const [key, count] of Object.entries(buckets)) {
    if (count > topCount) {
      topKey = key;
      topCount = count;
    }
  }

  return topKey === "" ? "" : `${topKey} ${formatCountPct(topCount, total)}`;
}

function formatCountPct(count: number, total: number): string {
  return `${count} (${((count / total) * 100).toFixed(2)}%)`;
}

function logNormalizedProfileTables(): void {
  const rows = profileScenarios.map(measureProfileScenario);

  console.log("\n[bench:runtime] normalized propagation costs");
  console.table(rows.map(formatNormalizedCostRow));

  console.log("\n[bench:runtime] fanout scaling");
  console.table(
    rows.filter((row) => row.group === "fanout").map(formatTopologyCostRow),
  );

  console.log("\n[bench:runtime] pull chain depth scaling");
  console.table(
    rows.filter((row) => row.group === "pull-depth").map(formatPullDepthRow),
  );

  console.log("\n[bench:runtime] diamond/layered/shared topology profiles");
  console.table(
    rows.filter((row) => row.group === "topology").map(formatTopologyCostRow),
  );

  console.log("\n[bench:runtime] cache-locality smoke profiles");
  console.table(
    rows.filter((row) => row.group === "locality").map(formatTopologyCostRow),
  );

  console.log("\n[bench:runtime] scheduler boundary profiles");
  console.table(
    rows.filter((row) => row.group === "scheduler").map(formatSchedulerRow),
  );

  console.log("\n[bench:runtime] dynamic dependency tracking profiles");
  console.table(
    rows.filter((row) => row.group === "tracking").map(formatTrackingRow),
  );

  console.log("\n[bench:runtime] app-like dependency tracking profiles");
  console.table(
    rows.filter((row) => row.group === "app").map(formatTrackingRow),
  );
}

type MeasuredProfileScenario = {
  id: string;
  group: ProfileScenario["group"];
  label: string;
  iterations: number;
  elapsedNs: number;
  counters: RuntimeProfileCounters;
  push: RuntimeProfileTopologyWalker;
  pull: RuntimeProfileTopologyWalker;
};

function measureProfileScenario(
  scenario: ProfileScenario,
): MeasuredProfileScenario {
  const instance = scenario.create();
  let checksum = 0;
  let elapsedNs = 0;

  const { counters, topology } = profileRuntime(() => {
    const start = performance.now();

    for (let iteration = 1; iteration <= scenario.iterations; iteration += 1) {
      checksum ^= instance.step(iteration);
    }

    elapsedNs = (performance.now() - start) * 1_000_000;
    return checksum;
  });

  instance.verify?.(checksum);
  instance.dispose?.();
  setRuntimeProfilingEnabled(false);

  return {
    id: scenario.id,
    group: scenario.group,
    label: scenario.label,
    iterations: scenario.iterations,
    elapsedNs,
    counters,
    push: topology.push,
    pull: topology.pull,
  };
}

function formatNormalizedCostRow(
  row: MeasuredProfileScenario,
): Record<string, string | number> {
  const counters = row.counters;

  return {
    scenario: row.id,
    group: row.group,
    "ns/op": formatNs(elapsedPer(row.elapsedNs, row.iterations)),
    "ns/directEdge": formatNs(
      elapsedPer(row.elapsedNs, counters.pushDirectEdgesVisited),
    ),
    "ns/transitiveEdge": formatNs(
      elapsedPer(row.elapsedNs, counters.pushTransitiveEdgesVisited),
    ),
    "ns/skippedEdge": formatNs(
      elapsedPer(row.elapsedNs, counters.pushAlreadyDirtySkipped),
    ),
    "ns/watcherEdge": formatNs(
      elapsedPer(row.elapsedNs, counters.pushWatchersInvalidated),
    ),
    "ns/pullDescend": formatNs(
      elapsedPer(row.elapsedNs, counters.pullDescents),
    ),
    "ns/pullBubble": formatNs(
      elapsedPer(row.elapsedNs, counters.pullChangedBubbles),
    ),
  };
}

function formatTopologyCostRow(
  row: MeasuredProfileScenario,
): Record<string, string | number> {
  return {
    scenario: row.id,
    "ns/op": formatNs(elapsedPer(row.elapsedNs, row.iterations)),
    pushEvents: row.push.total,
    pushMaxDepth: row.push.maxDepth,
    pushMaxStack: row.push.maxStack,
    pushFanIn: formatTopBucket(row.push.fanIn, row.push.total),
    pushFanOut: formatTopBucket(row.push.fanOut, row.push.total),
    pushDepth: formatTopBucket(row.push.depth, row.push.total),
    pushHot: formatHotPaths(row.push),
    pullEvents: row.pull.total,
    pullMaxDepth: row.pull.maxDepth,
    pullMaxStack: row.pull.maxStack,
    pullHot: formatHotPaths(row.pull),
  };
}

function formatPullDepthRow(
  row: MeasuredProfileScenario,
): Record<string, string | number> {
  return {
    scenario: row.id,
    "ns/op": formatNs(elapsedPer(row.elapsedNs, row.iterations)),
    pullEvents: row.pull.total,
    pullMaxDepth: row.pull.maxDepth,
    pullMaxStack: row.pull.maxStack,
    descends: row.counters.pullDescents,
    bubbles: row.counters.pullChangedBubbles,
    "ns/descend": formatNs(
      elapsedPer(row.elapsedNs, row.counters.pullDescents),
    ),
    "ns/bubble": formatNs(
      elapsedPer(row.elapsedNs, row.counters.pullChangedBubbles),
    ),
    hot: formatHotPaths(row.pull),
  };
}

function formatSchedulerRow(
  row: MeasuredProfileScenario,
): Record<string, string | number> {
  const counters = row.counters;

  return {
    scenario: row.id,
    "ns/op": formatNs(elapsedPer(row.elapsedNs, row.iterations)),
    writes: counters.writeCalls,
    scopeEnter: counters.propagationScopesEntered,
    scopeLeave: counters.propagationScopesLeft,
    settledChecks: counters.contextSettledChecks,
    settledEmits: counters.contextSettledEmits,
    settledDeferred: counters.contextSettledDeferred,
    nodeInvalidated: counters.nodeInvalidatedEmits,
    watcherRuns: counters.watcherRunCalls,
    watcherExecutions: counters.watcherExecutions,
    pushEvents: row.push.total,
    pushHot: formatHotPaths(row.push),
  };
}

function formatTrackingRow(
  row: MeasuredProfileScenario,
): Record<string, string | number> {
  const counters = row.counters;
  const total = counters.trackingResolveCalls;
  const output: Record<string, string | number> = {
    scenario: row.id,
    "ns/op": formatNs(elapsedPer(row.elapsedNs, row.iterations)),
    reads: total,
    cleanupRuns: counters.cleanupCalls,
    cleanupDropped: counters.cleanupEdgesDropped,
    "ns/nextHit": formatNs(elapsedPer(row.elapsedNs, counters.trackingNextHit)),
    "ns/oneHopReorder": formatNs(
      elapsedPer(row.elapsedNs, counters.trackingOneHopReorder),
    ),
    "ns/appendAfterCursor": formatNs(
      elapsedPer(row.elapsedNs, counters.trackingAppendAfterCursor),
    ),
    "ns/slowPath": formatNs(
      elapsedPer(row.elapsedNs, counters.trackingSlowPath),
    ),
    "ns/outgoingProbe": formatNs(
      elapsedPer(
        row.elapsedNs,
        counters.trackingOutgoingProbeHit1 + counters.trackingOutgoingProbeMiss,
      ),
    ),
  };

  for (const counter of trackingRouteCounters) {
    const count = counters[counter];

    if (count !== 0) {
      output[counter] = formatCountPct(count, total);
    }
  }

  return output;
}

function elapsedPer(elapsedNs: number, count: number): number | undefined {
  return count === 0 ? undefined : elapsedNs / count;
}

function formatNs(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} us`;
  return `${value.toFixed(1)} ns`;
}

function formatHotPaths(walker: RuntimeProfileTopologyWalker): string {
  return walker.hotPaths
    .slice(0, 2)
    .map((item) => `${item.path} ${formatCountPct(item.count, walker.total)}`)
    .join(" | ");
}

logPushPullTopologyProfiles();
logNormalizedProfileTables();

for (const scenario of scenarios) {
  describe(`runtime push-pull components | ${scenario.group}`, () => {
    let instance: BenchCase | null = null;
    let iteration = 0;
    let checksum = 0;

    beforeAll(() => {
      printProfile(scenario);
      instance = scenario.create();
    });

    bench(
      scenario.label,
      () => {
        instance ??= scenario.create();
        iteration += 1;
        checksum = instance.step(iteration);
        blackhole(checksum);
        return blackholeValue;
      },
      {
        warmupIterations: WARMUP_ITERATIONS,
        iterations: ITERATIONS,
        warmupTime: 20,
        time: 100,
      },
    );
  });
}
