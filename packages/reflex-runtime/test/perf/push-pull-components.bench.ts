import { beforeAll, bench, describe } from "vitest";
import {
  createConsumer,
  createProducer,
  createWatcher,
  profileRuntime,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
  setRuntimeProfilingEnabled,
  writeProducer,
  type ReactiveNode,
  type RuntimeProfileCounters,
} from "../runtime.test_utils";

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
        throw new Error(`${leafCount}-fanout expected ${expected}, got ${actual}`);
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

function createWatcherFanout(watcherCount: number): BenchCase {
  let scheduled = 0;

  resetRuntime({
    sinkInvalidatedDispatcher() {
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
    id: "watcher.fanout",
    group: "watcher",
    label: "watcher / invalidation fanout / 128 watchers",
    create: () => createWatcherFanout(128),
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
