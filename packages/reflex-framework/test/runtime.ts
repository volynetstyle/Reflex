import {
  configureRuntimeContext,
  createProducer,
  readProducer,
  runWatcher,
  writeProducer,
  type WatcherNode,
} from "@volynets/reflex-runtime";

export interface TestRuntimeHost {
  run<T>(fn: () => T): T;
  flush(): void;
}

let activeHost: TestRuntimeHost | null = null;

export function createRuntimeHarness(): TestRuntimeHost {
  const queue: WatcherNode[] = [];
  const queued = new Set<WatcherNode>();
  const host: TestRuntimeHost = {
    run<T>(fn: () => T): T {
      const result = fn();
      host.flush();
      return result;
    },
    flush() {
      while (queue.length > 0) {
        const watcher = queue.shift()!;
        queued.delete(watcher);
        runWatcher(watcher);
      }
    },
  };
  configureRuntimeContext({
    hooks: {
      onNodeInvalidated(node) {
        const watcher = node as WatcherNode;
        if (!queued.has(watcher)) {
          queued.add(watcher);
          queue.push(watcher);
        }
      },
    },
  });
  activeHost = host;
  return host;
}

export function createTestProducer<T>(initial: T) {
  const host = activeHost ?? createRuntimeHarness();
  const node = createProducer(initial);
  const read = () => readProducer(node);
  const write = (input: T | ((previous: T) => T)) => {
    const next =
      typeof input === "function"
        ? (input as (previous: T) => T)(readProducer(node))
        : input;
    writeProducer(node, next);
    host.flush();
  };
  return [read, write] as const;
}
