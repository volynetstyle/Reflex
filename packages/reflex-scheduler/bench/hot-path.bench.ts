import { bench, describe } from "vitest";
import {
  Changed,
  Scheduled,
  createWatcher,
  runWatcher,
  runWatcherWithoutSettledCheckpoint,
  setPropagationScopeDepth,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";
import {
  createEagerScheduler,
  createFlushScheduler,
  createRingQueue,
  createSabScheduler,
  acceptClaimedWatcher,
  flushQueuedWatchers,
  pushRingQueue,
  shiftRingQueue,
  tryEnqueue,
} from "../src";

const OPERATION_COUNT = 1_024;
const OPTIONS = {
  warmupIterations: 100,
  iterations: 1_000,
  warmupTime: 50,
  time: 250,
} as const;

let checksum = 0;

function createWatchers(): WatcherNode[] {
  const nodes = new Array<WatcherNode>(OPERATION_COUNT);

  for (let index = 0; index < OPERATION_COUNT; ++index) {
    nodes[index] = createWatcher(() => {
      checksum = (checksum + index + 1) | 0;
    });
  }

  return nodes;
}

function clearScheduled(nodes: readonly WatcherNode[]): void {
  for (let index = 0; index < nodes.length; ++index) {
    nodes[index]!.state &= ~Scheduled;
  }
}

describe("scheduler hot path", () => {
  let nodes: WatcherNode[];
  let queue: ReturnType<typeof createRingQueue<WatcherNode>>;

  bench(
    "ring push+shift / 1024",
    () => {
      const queue = createRingQueue<WatcherNode>();

      for (let index = 0; index < OPERATION_COUNT; ++index) {
        pushRingQueue(queue, nodes[index]!);
      }
      for (let index = 0; index < OPERATION_COUNT; ++index) {
        checksum ^= shiftRingQueue(queue) === nodes[index]! ? 1 : 0;
      }
    },
    { ...OPTIONS, setup: () => (nodes = createWatchers()) },
  );

  bench(
    "tryEnqueue unique stable capacity / 1024",
    () => {
      queue.head = 0;
      queue.tail = 0;
      clearScheduled(nodes);

      for (let index = 0; index < OPERATION_COUNT; ++index) {
        checksum ^= tryEnqueue(queue, nodes[index]!) ? 1 : 0;
      }
    },
    {
      ...OPTIONS,
      setup() {
        nodes = createWatchers();
        queue = createRingQueue<WatcherNode>();
        for (let index = 0; index < OPERATION_COUNT; ++index) {
          pushRingQueue(queue, nodes[index]!);
        }
        while (shiftRingQueue(queue) !== null) {}
      },
    },
  );

  bench(
    "tryEnqueue duplicate guard / 1024",
    () => {
      for (let index = 0; index < OPERATION_COUNT; ++index) {
        checksum ^= tryEnqueue(queue, nodes[index]!) ? 1 : 0;
      }
    },
    {
      ...OPTIONS,
      setup() {
        nodes = createWatchers();
        queue = createRingQueue<WatcherNode>();
        for (let index = 0; index < OPERATION_COUNT; ++index) {
          nodes[index]!.state |= Scheduled;
        }
      },
    },
  );

  bench(
    "acceptClaimed stable capacity / 1024",
    () => {
      queue.head = 0;
      queue.tail = 0;

      for (let index = 0; index < OPERATION_COUNT; ++index) {
        acceptClaimedWatcher(queue, nodes[index]!);
      }
    },
    {
      ...OPTIONS,
      setup() {
        nodes = createWatchers();
        queue = createRingQueue<WatcherNode>();
        for (let index = 0; index < OPERATION_COUNT; ++index) {
          nodes[index]!.state |= Scheduled;
          pushRingQueue(queue, nodes[index]!);
        }
        queue.head = queue.tail;
      },
    },
  );

  bench(
    "disposed queue drain / 1024",
    () => {
      for (let index = 0; index < OPERATION_COUNT; ++index) {
        pushRingQueue(queue, nodes[index]!);
      }
      flushQueuedWatchers(queue, NO_THROW, NO_THROW);
    },
    {
      ...OPTIONS,
      setup() {
        nodes = createWatchers();
        queue = createRingQueue<WatcherNode>();
        for (let index = 0; index < OPERATION_COUNT; ++index) {
          nodes[index]!.compute = undefined;
        }
      },
    },
  );

  bench(
    "runWatcher direct / 1024",
    () => {
      for (let index = 0; index < OPERATION_COUNT; ++index) {
        const node = nodes[index]!;
        node.state |= Changed;
        runWatcher(node);
      }
    },
    { ...OPTIONS, setup: () => (nodes = createWatchers()) },
  );

  bench(
    "runWatcher scheduler entry / 1024",
    () => {
      for (let index = 0; index < OPERATION_COUNT; ++index) {
        const node = nodes[index]!;
        node.state |= Changed;
        runWatcherWithoutSettledCheckpoint(node);
      }
    },
    { ...OPTIONS, setup: () => (nodes = createWatchers()) },
  );

  bench(
    "explicit enqueue+flush / 1024",
    () => {
      for (let index = 0; index < OPERATION_COUNT; ++index) {
        nodes[index]!.state |= Changed;
        scheduler.enqueue(nodes[index]!);
      }
      scheduler.flush();
    },
    {
      ...OPTIONS,
      setup() {
        nodes = createWatchers();
        scheduler = createFlushScheduler();
      },
    },
  );

  let scheduler = createFlushScheduler();

  bench(
    "empty flush / 1024",
    () => {
      for (let index = 0; index < OPERATION_COUNT; ++index) scheduler.flush();
    },
    { ...OPTIONS, setup: () => (scheduler = createFlushScheduler()) },
  );

  bench(
    "empty batch / 1024",
    () => {
      for (let index = 0; index < OPERATION_COUNT; ++index) {
        scheduler.batch(empty);
      }
    },
    { ...OPTIONS, setup: () => (scheduler = createFlushScheduler()) },
  );

  bench(
    "eager defer+cancel while propagation active / 1024",
    () => {
      scheduler.reset();
      setPropagationScopeDepth(1);
      for (let index = 0; index < OPERATION_COUNT; ++index) {
        scheduler.enqueue(nodes[index]!);
      }
      setPropagationScopeDepth(0);
    },
    {
      ...OPTIONS,
      setup() {
        nodes = createWatchers();
        scheduler = createEagerScheduler();
      },
      teardown: () => setPropagationScopeDepth(0),
    },
  );

  bench(
    "eager enqueue+flush idle / 1024",
    () => {
      for (let index = 0; index < OPERATION_COUNT; ++index) {
        const node = nodes[index]!;
        node.state |= Changed;
        scheduler.enqueue(node);
      }
    },
    {
      ...OPTIONS,
      setup() {
        nodes = createWatchers();
        scheduler = createEagerScheduler();
      },
    },
  );

  bench(
    "SAB batch enqueue+flush / 1024",
    () => {
      scheduler.batch(() => {
        for (let index = 0; index < OPERATION_COUNT; ++index) {
          nodes[index]!.state |= Changed;
          scheduler.enqueue(nodes[index]!);
        }
      });
    },
    {
      ...OPTIONS,
      setup() {
        nodes = createWatchers();
        scheduler = createSabScheduler();
      },
    },
  );
});

function empty(): void {}

const NO_THROW = {};
