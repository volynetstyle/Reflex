import {
  disposeWatcher as dispose,
  runWatcher as run,
} from "@runtime/kernel/engine/watcher";

/**
 * Public watcher controls.
 *
 * The runtime keeps watcher lifecycle operations grouped under a single
 * namespace-like export so the public API stays compact while the engine keeps
 * its lower-level verbs internally.
 */
export const watcher = {
  run,
  dispose,
} as const;

export { runWatcher, disposeWatcher } from "@runtime/kernel/engine/watcher";
