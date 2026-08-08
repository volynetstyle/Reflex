import {
  createWatcher,
  disposeWatcher,
  runWatcher,
  untracked,
} from "@volynets/reflex-runtime/internal";
import type { WatcherFn } from "@volynets/reflex-runtime/internal";
import {
  claimWatcherSchedule,
  releaseWatcherSchedule,
  type ReactiveNode,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";
import {
  devassertEffectFn,
  devassertReactionFn,
  devassertReactionReturn,
  devassertSelectorFn,
  devassertSelectorReturn,
  wrapEffectFn,
} from "./effect.dev";

/**
 * Marks an effect watcher node as scheduled.
 *
 * This is a low-level helper used by scheduler integrations and tests to set
 * the runtime's scheduled flag on a watcher node.
 */
export function effectScheduled(
  node: ReactiveNode<typeof undefined | Destructor>,
) {
  claimWatcherSchedule(node as WatcherNode);
}

/**
 * Clears the scheduled flag from an effect watcher node.
 *
 * This is a low-level helper used by scheduler integrations and tests to mark
 * a watcher as no longer queued for execution.
 */
export function effectUnscheduled(
  node: ReactiveNode<typeof undefined | Destructor>,
) {
  releaseWatcherSchedule(node as WatcherNode);
}

/**
 * Creates a reactive effect.
 *
 * `effect` runs `fn` immediately, tracks any reactive values read during that
 * run, and schedules re-execution when those dependencies change.
 *
 * @param fn - Effect body. It may return a cleanup function that runs before
 * the next execution and when the effect is disposed.
 *
 * @returns Destructor that disposes the effect and runs the latest cleanup, if
 * present.
 *
 * @example
 * ```ts
 * const rt = createRuntime();
 * const count = signal(0);
 *
 * const stop = effect(() => {
 *   console.log(count());
 * });
 *
 * count.set(1);
 * rt.flush();
 *
 * stop();
 * ```
 *
 * @remarks
 * - The first run happens synchronously during `effect()` creation.
 * - With the default runtime strategy, later re-runs are queued until
 *   `rt.flush()`.
 * - With `createRuntime({ effectStrategy: "sab" })`, invalidations stay lazy
 *   during propagation but auto-deliver after the outermost `rt.batch()`.
 * - With `createRuntime({ effectStrategy: "eager" })`, invalidations flush
 *   automatically.
 * - Reads performed inside cleanup do not become dependencies of the next run.
 * - Disposing the returned scope prevents future re-runs.
 *
 * @see createRuntime
 * @see computed
 * @see memo
 */
export function effect(fn: WatcherFn): Destructor {
  devassertEffectFn(fn, "effect");

  const compute = __DEV__ ? wrapEffectFn(fn, "effect") : fn;
  const node = createWatcher(compute);

  try {
    runWatcher(node);
  } catch (error) {
    // The initial run may already have linked reactive sources. Since no
    // disposer can be returned on failure, roll the partially created watcher
    // back before propagating the user error.
    disposeWatcher(node);
    throw error;
  }

  const disposer: Destructor = disposeWatcher.bind(null, node);
  return disposer;
}

export type ReactionFn<T> = (value: T, prev: T) => void;

export interface Reaction<T> {
  subscribe(fn: ReactionFn<T>): Destructor;
}

export type Watch<T> = Reaction<T>;

/**
 * Runs `fn` when the value produced by `read` changes.
 *
 * The initial `read` happens immediately to collect dependencies and establish
 * the first previous value. `fn` is called only on later watcher runs, and it
 * receives both the next value and the value observed during the previous run.
 *
 * @typeParam T - Watched value type.
 *
 * @param read - Tracked value selector.
 *
 * @returns Object with `subscribe(fn)` that starts a reaction and returns its
 * disposer.
 */
export function reaction<T>(read: () => T): Reaction<T> {
  devassertSelectorFn<T>(read, "reaction");

  return {
    subscribe(fn: ReactionFn<T>): Destructor {
      devassertReactionFn<T>(fn, "reaction");

      return subscribeReaction(read, fn, "reaction");
    },
  };
}

function subscribeReaction<T>(
  read: () => T,
  fn: ReactionFn<T>,
  kind: "reaction" | "watch",
): Destructor {
  let initialized = false;
  let prev: T;

  return effect(() => {
    const value = read();

    devassertSelectorReturn(value, kind);

    if (initialized) {
      untracked(() => {
        const result = fn(value, prev);

        devassertReactionReturn(result, kind);
      });
    } else {
      initialized = true;
    }

    prev = value;
  });
}

/**
 * Creates a subscribable watcher for a tracked selector.
 *
 * @typeParam T - Watched value type.
 *
 * @param read - Tracked value selector.
 *
 * @returns Object with `subscribe(fn)` that starts a reaction and returns its
 * disposer.
 */
export function watch<T>(read: () => T): Watch<T> {
  devassertSelectorFn<T>(read, "watch");

  return {
    subscribe(fn: ReactionFn<T>): Destructor {
      devassertReactionFn<T>(fn, "watch");

      return subscribeReaction(read, fn, "watch");
    },
  };
}
