import {
  createWatcher,
  disposeWatcher,
  runWatcher,
  type WatcherFn,
} from "@volynets/reflex-runtime";

import type { Cleanup } from "../types/core";

/** Creates a runtime watcher without invoking the public effect lifecycle. */
export function createRuntimeEffect(fn: WatcherFn): Cleanup {
  const watcher = createWatcher(fn);

  try {
    runWatcher(watcher);
  } catch (error) {
    disposeWatcher(watcher);
    throw error;
  }

  return () => {
    disposeWatcher(watcher);
  };
}
