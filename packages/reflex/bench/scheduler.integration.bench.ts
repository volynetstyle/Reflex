import { bench, describe } from "vitest";
import {
  readConsumer,
  readProducer,
  resetRuntimeContext,
  runWatcher,
  configureRuntimeContext,
  writeProducer,
  type ReactiveNode,
} from "@volynets/reflex-runtime/internal";
import {
  createComputedNode,
  createSignalNode,
  createWatcherNode,
} from "../src/infra/factory";
import {
  createEffectScheduler,
  EffectSchedulerMode,
  type EffectScheduler,
} from "../src/policy/scheduler";
import { blackhole } from "./shared";

const WATCHER_COUNT = 512;
const WRITE_COUNT = 16;
const WARMUP_ITERATIONS = 80;
const ITERATIONS = 600;

type SchedulerVariant =
  | "runtime-direct"
  | "scheduler-flush"
  | "scheduler-eager"
  | "scheduler-sab";

interface DrainController {
  readonly label: SchedulerVariant;
  batch<T>(fn: () => T): T;
  flush(): void;
  dispose(): void;
}

interface IntegrationCase {
  readonly label: string;
  step(iteration: number): number;
  dispose(): void;
}

let checksum = 0;

function record(value: number): void {
  checksum = (checksum + value) | 0;
}

function createDirectController(): DrainController {
  const queue: ReactiveNode[] = [];
  let head = 0;

  configureRuntimeContext({
    hooks: {
      sinkInvalidatedDispatcher(node) {
        queue.push(node);
      },
    },
  });

  return {
    label: "runtime-direct",
    batch(fn) {
      return fn();
    },
    flush() {
      while (head < queue.length) {
        runWatcher(queue[head++]!);
      }

      if (head > 1024) {
        queue.splice(0, head);
        head = 0;
      }
    },
    dispose() {
      queue.length = 0;
      configureRuntimeContext({ hooks: {} });
    },
  };
}

function createSchedulerController(
  label: Exclude<SchedulerVariant, "runtime-direct">,
  mode: EffectSchedulerMode,
): DrainController {
  const scheduler: EffectScheduler = createEffectScheduler(mode);

  configureRuntimeContext({
    hooks: {
      sinkInvalidatedDispatcher(node) {
        scheduler.enqueue(node);
      },
      reactiveSettledDispatcher() {
        scheduler.runtimeNotifySettled?.();
      },
    },
  });

  return {
    label,
    batch(fn) {
      return scheduler.batch(fn);
    },
    flush() {
      scheduler.flush();
    },
    dispose() {
      scheduler.reset();
      configureRuntimeContext({ hooks: {} });
    },
  };
}

function createController(variant: SchedulerVariant): DrainController {
  switch (variant) {
    case "runtime-direct":
      return createDirectController();
    case "scheduler-flush":
      return createSchedulerController(
        "scheduler-flush",
        EffectSchedulerMode.Flush,
      );
    case "scheduler-eager":
      return createSchedulerController(
        "scheduler-eager",
        EffectSchedulerMode.Eager,
      );
    case "scheduler-sab":
      return createSchedulerController(
        "scheduler-sab",
        EffectSchedulerMode.SAB,
      );
  }
}

function setupRuntime(variant: SchedulerVariant): DrainController {
  resetRuntimeContext();
  configureRuntimeContext({ hooks: {} });
  checksum = 0;
  return createController(variant);
}

function createEffectLeavesCase(variant: SchedulerVariant): IntegrationCase {
  const controller = setupRuntime(variant);
  const source = createSignalNode(0);
  const watchers: ReactiveNode[] = new Array(WATCHER_COUNT);

  for (let index = 0; index < WATCHER_COUNT; index += 1) {
    watchers[index] = createWatcherNode(() => {
      record(readProducer(source) + index);
    });
    runWatcher(watchers[index]!);
  }

  return {
    label: `${variant} | effect leaves | watchers=${WATCHER_COUNT} writes=1`,
    step(iteration) {
      controller.batch(() => {
        writeProducer(source, iteration);
      });
      controller.flush();
      return checksum;
    },
    dispose() {
      controller.dispose();
    },
  };
}

function createComputedFanoutCase(variant: SchedulerVariant): IntegrationCase {
  const controller = setupRuntime(variant);
  const source = createSignalNode(0);
  const shared = createComputedNode(() => readProducer(source) * 2);
  const watchers: ReactiveNode[] = new Array(WATCHER_COUNT);

  for (let index = 0; index < WATCHER_COUNT; index += 1) {
    watchers[index] = createWatcherNode(() => {
      record(readConsumer(shared) + index);
    });
    runWatcher(watchers[index]!);
  }

  return {
    label: `${variant} | computed fanout | watchers=${WATCHER_COUNT} writes=1 runtimeCompute=1`,
    step(iteration) {
      controller.batch(() => {
        writeProducer(source, iteration);
      });
      controller.flush();
      return checksum;
    },
    dispose() {
      controller.dispose();
    },
  };
}

function createBatchedWritesCase(variant: SchedulerVariant): IntegrationCase {
  const controller = setupRuntime(variant);
  const source = createSignalNode(0);
  const watchers: ReactiveNode[] = new Array(WATCHER_COUNT);

  for (let index = 0; index < WATCHER_COUNT; index += 1) {
    watchers[index] = createWatcherNode(() => {
      record(readProducer(source) + index);
    });
    runWatcher(watchers[index]!);
  }

  return {
    label: `${variant} | batched writes | watchers=${WATCHER_COUNT} writes=${WRITE_COUNT} expectedRuns=${WATCHER_COUNT}`,
    step(iteration) {
      controller.batch(() => {
        for (let write = 0; write < WRITE_COUNT; write += 1) {
          writeProducer(source, iteration * WRITE_COUNT + write);
        }
      });
      controller.flush();
      return checksum;
    },
    dispose() {
      controller.dispose();
    },
  };
}

const variants: readonly SchedulerVariant[] = [
  "runtime-direct",
  "scheduler-flush",
  "scheduler-eager",
  "scheduler-sab",
];

const cases: readonly [
  string,
  (variant: SchedulerVariant) => IntegrationCase,
][] = [
  ["effect leaves", createEffectLeavesCase],
  ["computed fanout", createComputedFanoutCase],
  ["batched writes", createBatchedWritesCase],
];

describe("scheduler integration overhead", () => {
  for (const [caseName, createCase] of cases) {
    describe(caseName, () => {
      for (const variant of variants) {
        let instance: IntegrationCase | null = null;
        let iteration = 0;

        bench(
          `${variant} | ${caseName}`,
          () => {
            instance ??= createCase(variant);
            iteration += 1;
            blackhole(instance.step(iteration));
          },
          {
            warmupIterations: WARMUP_ITERATIONS,
            iterations: ITERATIONS,
            warmupTime: 20,
            time: 100,
            setup() {
              instance = createCase(variant);
              iteration = 0;
            },
            teardown() {
              instance?.dispose();
              instance = null;
              iteration = 0;
            },
          },
        );
      }
    });
  }
});
