import { bench, describe } from "vitest";
import {
  Changed,
  resetState,
  Scheduled,
  setPropagationScopeDepth,
} from "@volynets/reflex-runtime/internal";
import { createWatcherNode } from "../src/infra/factory";
import { effect, signal, createRuntime } from "../src";
import {
  createEffectScheduler,
  createRingQueue,
  EffectSchedulerMode,
  type EffectScheduler,
  pushRingQueue,
  type RingQueue,
  shiftRingQueue,
  tryEnqueue,
} from "../src/policy/scheduler";
import { blackhole } from "./shared";

const WATCHER_COUNT = 1024;
const SMALL_QUEUE_COUNT = 16;
const GROW_QUEUE_COUNT = 1024;
const MANY_EFFECT_COUNT = 512;
const MANY_EFFECT_WRITES = 8;

type WatcherNode = ReturnType<typeof createWatcherNode>;
type Setter = (value: number) => void;

function createWatchers(count: number, onRun?: (index: number) => void) {
  const nodes: WatcherNode[] = new Array(count);

  for (let index = 0; index < count; ++index) {
    nodes[index] = createWatcherNode(() => {
      onRun?.(index);
    });
  }

  return nodes;
}

function clearScheduled(nodes: readonly WatcherNode[]): void {
  for (let index = 0; index < nodes.length; ++index) {
    nodes[index]!.state &= ~Scheduled;
  }
}

function pregrowQueue(
  queue: RingQueue<WatcherNode>,
  nodes: readonly WatcherNode[],
) {
  for (let index = 0; index < nodes.length; ++index) {
    pushRingQueue(queue, nodes[index]!);
  }

  while (shiftRingQueue(queue) !== null) {}
}

describe("scheduler: ring queue primitives", () => {
  let smallQueue: RingQueue<WatcherNode>;
  let smallNodes: WatcherNode[];
  let nodes1024: WatcherNode[];
  let enqueueQueue: RingQueue<WatcherNode>;
  let duplicateQueue: RingQueue<WatcherNode>;

  bench(
    "push/shift stable capacity/16",
    () => {
      for (let index = 0; index < SMALL_QUEUE_COUNT; ++index) {
        pushRingQueue(smallQueue, smallNodes[index]!);
      }

      for (let index = 0; index < SMALL_QUEUE_COUNT; ++index) {
        blackhole(shiftRingQueue(smallQueue) === smallNodes[index]! ? 1 : 0);
      }
    },
    {
      setup() {
        smallQueue = createRingQueue<WatcherNode>();
        smallNodes = createWatchers(SMALL_QUEUE_COUNT);
      },
    },
  );

  bench(
    "push grow/1024",
    () => {
      const queue = createRingQueue<WatcherNode>();

      for (let index = 0; index < GROW_QUEUE_COUNT; ++index) {
        pushRingQueue(queue, nodes1024[index]!);
      }

      blackhole(queue.tail - queue.head);
    },
    {
      setup() {
        nodes1024 = createWatchers(GROW_QUEUE_COUNT);
      },
    },
  );

  bench(
    "tryEnqueue unique stable capacity/1024",
    () => {
      enqueueQueue.head = 0;
      enqueueQueue.tail = 0;
      clearScheduled(nodes1024);

      for (let index = 0; index < WATCHER_COUNT; ++index) {
        blackhole(tryEnqueue(enqueueQueue, nodes1024[index]!) ? 1 : 0);
      }
    },
    {
      setup() {
        nodes1024 = createWatchers(WATCHER_COUNT);
        enqueueQueue = createRingQueue<WatcherNode>();
        pregrowQueue(enqueueQueue, nodes1024);
      },
    },
  );

  bench(
    "tryEnqueue duplicate guard/1024",
    () => {
      for (let index = 0; index < WATCHER_COUNT; ++index) {
        blackhole(tryEnqueue(duplicateQueue, nodes1024[index]!) ? 1 : 0);
      }
    },
    {
      setup() {
        duplicateQueue = createRingQueue<WatcherNode>();
        nodes1024 = createWatchers(WATCHER_COUNT);

        for (let index = 0; index < WATCHER_COUNT; ++index) {
          nodes1024[index]!.state |= Scheduled;
        }
      },
    },
  );
});

describe("scheduler: policy queue flush", () => {
  let checksum = 0;
  let scheduler: EffectScheduler;
  let nodes: WatcherNode[];

  bench(
    "flush scheduler explicit/1024",
    () => {
      for (let index = 0; index < WATCHER_COUNT; ++index) {
        nodes[index]!.state |= Changed;
        scheduler.enqueue(nodes[index]!);
      }

      scheduler.flush();
      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
        nodes = createWatchers(WATCHER_COUNT, (index) => {
          checksum = (checksum + index + 1) | 0;
        });
      },
    },
  );

  bench(
    "flush scheduler duplicate enqueue/1024",
    () => {
      scheduler.reset();

      for (let index = 0; index < WATCHER_COUNT; ++index) {
        scheduler.enqueue(nodes[index]!);
      }

      for (let index = 0; index < WATCHER_COUNT; ++index) {
        scheduler.enqueue(nodes[index]!);
      }

      blackhole(scheduler.core.queue.tail - scheduler.core.queue.head);
    },
    {
      setup() {
        scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
        nodes = createWatchers(WATCHER_COUNT);
      },
    },
  );

  bench(
    "eager enqueue while propagation active/1024",
    () => {
      scheduler.reset();

      setPropagationScopeDepth(1);
      for (let index = 0; index < WATCHER_COUNT; ++index) {
        scheduler.enqueue(nodes[index]!);
      }
      setPropagationScopeDepth(0);
    },
    {
      setup() {
        scheduler = createEffectScheduler(EffectSchedulerMode.Eager);
        nodes = createWatchers(WATCHER_COUNT);
      },
      teardown() {
        setPropagationScopeDepth(0);
      },
    },
  );

  bench(
    "sab batch enqueue+flush/1024",
    () => {
      scheduler.batch(() => {
        for (let index = 0; index < WATCHER_COUNT; ++index) {
          scheduler.enqueue(nodes[index]!);
        }
      });

      blackhole(checksum);
    },
    {
      setup() {
        checksum = 0;
        scheduler = createEffectScheduler(EffectSchedulerMode.SAB);
        nodes = createWatchers(WATCHER_COUNT, (index) => {
          checksum = (checksum + index + 1) | 0;
        });
      },
    },
  );
});

describe("scheduler: public runtime effect strategies", () => {
  let checksum = 0;
  let setSource: Setter;
  let rt: ReturnType<typeof createRuntime>;
  let disposers: Destructor[];

  function setupRuntime(strategy: "flush" | "sab" | "eager") {
    resetState();
    rt = createRuntime({ effectStrategy: strategy });
    const [source, writeSource] = signal(0);

    setSource = writeSource as Setter;
    checksum = 0;
    disposers = new Array(MANY_EFFECT_COUNT);

    for (let index = 0; index < MANY_EFFECT_COUNT; ++index) {
      disposers[index] = effect(() => {
        checksum = (checksum + source() + index) | 0;
      });
    }
  }

  function teardownRuntime() {
    for (let index = disposers.length - 1; index >= 0; --index) {
      disposers[index]!();
    }
  }

  bench(
    "runtime flush strategy many-effects/512x8",
    () => {
      for (let write = 0; write < MANY_EFFECT_WRITES; ++write) {
        setSource(write + 1);
        rt.flush();
      }

      blackhole(checksum);
    },
    {
      setup() {
        setupRuntime("flush");
      },
      teardown: teardownRuntime,
    },
  );

  bench(
    "runtime sab strategy many-effects/512x8",
    () => {
      for (let write = 0; write < MANY_EFFECT_WRITES; ++write) {
        rt.batch(() => {
          setSource(write + 1);
        });
      }

      blackhole(checksum);
    },
    {
      setup() {
        setupRuntime("sab");
      },
      teardown: teardownRuntime,
    },
  );

  bench(
    "runtime eager strategy many-effects/512x8",
    () => {
      for (let write = 0; write < MANY_EFFECT_WRITES; ++write) {
        setSource(write + 1);
      }

      blackhole(checksum);
    },
    {
      setup() {
        setupRuntime("eager");
      },
      teardown: teardownRuntime,
    },
  );
});
