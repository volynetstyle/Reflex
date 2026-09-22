import {
  Changed,
  claimWatcherSchedule,
  configureRuntimeContext,
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  releaseWatcherSchedule,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";
import { createFlushScheduler } from "@volynets/reflex-scheduler";

export type CumulativeLeg =
  | "claim-release"
  | "queue-roundtrip"
  | "empty-wrapper"
  | "direct-source"
  | "scheduler-bypass"
  | "shared-derived";

export interface CumulativeCase {
  step(): void;
  dispose(): void;
}

let cumulativeSink = 0;

export function createCumulativeCase(
  leg: CumulativeLeg,
  width: number,
): CumulativeCase {
  resetRuntimeContext();
  const scheduler = createFlushScheduler();

  if (leg === "claim-release") {
    const watchers = Array.from({ length: width }, () =>
      createWatcher(() => undefined),
    );
    return {
      step() {
        for (const watcher of watchers) claimWatcherSchedule(watcher);
        for (const watcher of watchers) releaseWatcherSchedule(watcher);
      },
      dispose: resetRuntimeContext,
    };
  }

  if (leg === "queue-roundtrip") {
    const watchers = Array.from({ length: width }, () => {
      const watcher = createWatcher(() => undefined);
      watcher.compute = undefined;
      return watcher;
    });
    return {
      step() {
        for (const watcher of watchers) {
          watcher.state |= Changed;
          scheduler.enqueue(watcher);
        }
        scheduler.flush();
      },
      dispose: resetRuntimeContext,
    };
  }

  if (leg === "empty-wrapper") {
    const watchers = Array.from({ length: width }, () =>
      createWatcher(() => {
        cumulativeSink += 1;
      }),
    );
    watchers.forEach(runWatcher);
    return {
      step() {
        for (const watcher of watchers) {
          watcher.state |= Changed;
          scheduler.enqueue(watcher);
        }
        scheduler.flush();
      },
      dispose: resetRuntimeContext,
    };
  }

  if (leg !== "scheduler-bypass") {
    configureRuntimeContext({
      hooks: {
        onNodeInvalidated(node) {
          scheduler.enqueue(node as WatcherNode);
        },
      },
    });
  }
  const source = createProducer(0);
  let value = 0;

  if (leg === "direct-source") {
    const watchers = Array.from({ length: width }, () =>
      createWatcher(() => {
        cumulativeSink ^= readProducer(source);
      }),
    );
    watchers.forEach(runWatcher);
    return {
      step() {
        writeProducer(source, ++value);
        scheduler.flush();
      },
      dispose: resetRuntimeContext,
    };
  }

  const derived = createConsumer(() => readProducer(source) + 1);
  const watchers = Array.from({ length: width }, () =>
    createWatcher(() => {
      cumulativeSink ^= readConsumer(derived);
    }),
  );
  watchers.forEach(runWatcher);
  return {
    step() {
      writeProducer(source, ++value);
      if (leg === "scheduler-bypass") {
        // Diagnostic only: execute the known watcher set directly. This does
        // not implement queue ownership, dedup, failure, or reentrancy
        // semantics and must never be used as a competitor result.
        watchers.forEach(runWatcher);
      } else {
        scheduler.flush();
      }
    },
    dispose: resetRuntimeContext,
  };
}
