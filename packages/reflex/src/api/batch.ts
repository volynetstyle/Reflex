import { getBoundEffectScheduler } from "../infra/scheduler_binding";

/**
 * Runs multiple reactive writes inside one scheduler batch.
 *
 * In eager runtimes, invalidated effects are deferred until the outermost batch
 * exits, so multiple writes collapse into one flush against the latest stable
 * snapshot. In flush-mode runtimes, `batch()` still groups the writes but does
 * not call `flush()` for you.
 *
 * If no runtime scheduler is currently bound, `batch()` simply executes `fn`
 * directly.
 *
 * @typeParam T - Return type of `fn`.
 *
 * @param fn - Callback whose writes should be grouped.
 *
 * @returns The value returned by `fn`.
 */
export function batch<T>(fn: () => T): T {
  const scheduler = getBoundEffectScheduler();
  return scheduler === undefined ? fn() : scheduler.batch(fn);
}
