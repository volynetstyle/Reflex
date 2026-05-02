import {
  disposeWatcher,
  registerWatcherCleanup,
  Scheduled,
  runWatcher,
  untracked,
  withCleanupRegistrar,
} from "@volynets/reflex-runtime";
import type { ReactiveNode } from "@volynets/reflex-runtime";
import { createWatcherNode, createWatcherRankedrNode } from "../infra/factory";

/**
 * Marks an effect watcher node as scheduled.
 *
 * This is a low-level helper used by scheduler integrations and tests to set
 * the runtime's scheduled flag on a watcher node.
 */
export function effectScheduled(
  node: ReactiveNode<typeof undefined | Destructor>,
) {
  node.state |= Scheduled;
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
  node.state &= ~Scheduled;
}

/**
 * Receives cleanup functions created by helpers running inside an effect-owned
 * setup scope.
 *
 * The callback does not run the cleanup immediately. It records the cleanup so
 * the owner can dispose it later, usually when an effect reruns or an ownership
 * scope is torn down.
 */
export type EffectCleanupReceiver = (cleanup: Destructor) => void;

/**
 * @deprecated Use {@link EffectCleanupReceiver}.
 */
export type EffectCleanupRegistrar = EffectCleanupReceiver;

/**
 * Runs `fn` with a temporary cleanup receiver installed on the active runtime
 * context.
 *
 * Any effect/resource created while `fn` is running may call the runtime's
 * cleanup hook. That hook forwards the produced cleanup into `receiveCleanup`,
 * letting framework integrations bind plain Reflex effects to a larger
 * ownership scope.
 *
 * @typeParam T - Return type of `fn`.
 *
 * @param receiveCleanup - Callback that records cleanups created during `fn`,
 * or `null` to intentionally disable parent cleanup capture.
 * @param fn - Callback executed with the temporary cleanup receiver installed.
 *
 * @returns The value returned by `fn`.
 *
 * @remarks
 * - The receiver is scoped to the synchronous duration of `fn`.
 * - Passing `null` creates an explicit boundary: nested helpers still work, but
 *   their cleanups are not forwarded to an outer scope.
 * - This is a low-level integration helper. Most application code should use
 *   `effect()` directly.
 */
export function withEffectCleanupScope<T>(
  receiveCleanup: EffectCleanupReceiver | null,
  fn: () => T,
): T {
  return withCleanupRegistrar(receiveCleanup, fn);
}

/**
 * @deprecated Use {@link withEffectCleanupScope}.
 */
export function withEffectCleanupRegistrar<T>(
  receiveCleanup: EffectCleanupReceiver | null,
  fn: () => T,
): T {
  return withEffectCleanupScope(receiveCleanup, fn);
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
 * const [count, setCount] = signal(0);
 *
 * const stop = effect(() => {
 *   console.log(count());
 * });
 *
 * setCount(1);
 * rt.flush();
 *
 * stop();
 * ```
 *
 * @remarks
 * - The first run happens synchronously during `effect()` creation.
 * - With the default runtime strategy, later re-runs are queued until
 *   `rt.flush()`.
 * - With `createRuntime({ effectStrategy: "ranked" })`, later re-runs are
 *   queued until `rt.flush()` and then drained in descending watcher rank.
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
export function effect(fn: EffectFn): Destructor {
  const node = createWatcherNode(fn);
  runWatcher(node);

  const dispose = disposeWatcher.bind(null, node) as Destructor;
  registerWatcherCleanup(dispose);
  return dispose;
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
  return {
    subscribe(fn: ReactionFn<T>): Destructor {
      return subscribeReaction(read, fn);
    },
  };
}

function subscribeReaction<T>(read: () => T, fn: ReactionFn<T>): Destructor {
  let initialized = false;
  let prev: T;

  return effect(() => {
    const value = read();

    if (initialized) {
      untracked(() => {
        fn(value, prev);
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
  return reaction(read);
}

/**
 * @deprecated
 */
export function effectRanked(
  fn: EffectFn,
  options: EffectOptions = {},
): Destructor {
  const node = createWatcherRankedrNode(fn, options.priority ?? 0);
  runWatcher(node);

  const dispose = disposeWatcher.bind(null, node) as Destructor;
  registerWatcherCleanup(dispose);
  return dispose;
}
