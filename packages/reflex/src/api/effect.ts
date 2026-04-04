import {
  disposeWatcher,
  getDefaultContext,
  runWatcher,
} from "@reflex/runtime";
import type { ReactiveNode } from "@reflex/runtime";
import type { UNINITIALIZED } from "../infra/factory";
import { createWatcherNode } from "../infra/factory";

type EffectNode = ReactiveNode<typeof UNINITIALIZED | Destructor>;
const EFFECT_SCHEDULED = Symbol("reflex.effect_scheduled");
type ScheduledEffectNode = EffectNode & {
  [EFFECT_SCHEDULED]?: 0 | 1;
};

/**
 * Marks an effect watcher node as queued in the host scheduler.
 *
 * This is a low-level helper used by scheduler integrations and tests. Reflex
 * stores the queued marker on the watcher instance itself so the host
 * scheduler can dedupe enqueues without mutating runtime state bits.
 */
export function effectScheduled(
  node: EffectNode,
) {
  (node as ScheduledEffectNode)[EFFECT_SCHEDULED] = 1;
}

/**
 * Clears the scheduler-owned queued marker from an effect watcher node.
 *
 * This is a low-level helper used by scheduler integrations and tests to mark
 * a watcher as no longer queued for execution.
 */
export function effectUnscheduled(
  node: EffectNode,
) {
  (node as ScheduledEffectNode)[EFFECT_SCHEDULED] = 0;
}

/**
 * Returns whether the host scheduler currently considers the watcher queued.
 */
export function isEffectScheduled(node: EffectNode): boolean {
  return (node as ScheduledEffectNode)[EFFECT_SCHEDULED] === 1;
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
  const context = getDefaultContext();
  return context.withCleanupRegistrar(registrar, fn);
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
  const context = getDefaultContext();
  runWatcher(node, context);

  const dispose = () => disposeWatcher(node);
  context.registerWatcherCleanup(dispose);
  return dispose;
}
