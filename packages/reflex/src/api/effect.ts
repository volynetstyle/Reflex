import {
  disposeWatcher,
  registerWatcherCleanup,
  Scheduled,
  runWatcher,
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
 * Callback used to register cleanup produced by nested helpers with an
 * enclosing effect scope.
 */
export type EffectCleanupRegistrar = (cleanup: Destructor) => void;

/**
 * Runs `fn` with a temporary cleanup registrar installed on the active runtime
 * context.
 *
 * Helpers that allocate resources during `fn` can forward their teardown to
 * `registrar`, allowing the surrounding effect or integration to dispose them
 * automatically.
 *
 * @typeParam T - Return type of `fn`.
 *
 * @param registrar - Cleanup registrar to expose during `fn`, or `null` to run
 * without one.
 * @param fn - Callback executed with the temporary registrar installed.
 *
 * @returns The value returned by `fn`.
 *
 * @remarks
 * - The registrar is scoped to the duration of `fn`.
 * - This is a low-level integration helper. Most application code should use
 *   `effect()` directly.
 */
export function withEffectCleanupRegistrar<T>(
  registrar: EffectCleanupRegistrar | null,
  fn: () => T,
): T {
  return withCleanupRegistrar(registrar, fn);
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
