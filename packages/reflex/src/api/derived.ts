import {
  readConsumerEager,
  readConsumerLazy,
} from "@reflex/runtime";
import { createComputedNode } from "../infra/factory";

/**
 * Creates a lazy derived accessor.
 *
 * `computed` runs `fn` only when the returned accessor is read. During that
 * evaluation it tracks the reactive values that `fn` touches, caches the
 * result, and reuses the cached value for subsequent clean reads.
 *
 * @typeParam T - Derived value type.
 *
 * @param fn - Pure synchronous computation that derives a value from reactive
 * reads.
 *
 * @returns Tracked accessor that returns the latest derived value.
 *
 * @example
 * ```ts
 * createRuntime();
 *
 * const [count, setCount] = signal(1);
 * const doubled = computed(() => count() * 2);
 *
 * console.log(doubled()); // 2
 *
 * setCount(2);
 *
 * console.log(doubled()); // 4
 * ```
 *
 * @remarks
 * - `fn` does not run until the first read.
 * - Dependencies are tracked dynamically on each execution, so branch changes
 *   automatically update the dependency set.
 * - Dirty computeds recompute on demand when read again.
 * - Reading a computed does not require `rt.flush()`; `flush()` is only for
 *   scheduled effects.
 * - Keep `fn` pure and synchronous.
 *
 * @see memo
 * @see effect
 */
export function computed<T>(fn: () => T): Computed<T> {
  const node = createComputedNode(fn);
  return readConsumerLazy.bind(null, node) as Computed<T>;
}

/**
 * Creates a computed accessor and warms it eagerly once.
 *
 * `memo` has the same dependency tracking and caching semantics as
 * `computed()`, but it performs one eager read immediately after creation.
 * This is useful when you want the initial value materialized up front while
 * still interacting with a normal accessor afterward.
 *
 * @typeParam T - Derived value type.
 *
 * @param fn - Pure synchronous computation that derives a value from reactive
 * reads.
 *
 * @returns Tracked accessor that returns the latest memoized value.
 *
 * @example
 * ```ts
 * createRuntime();
 *
 * const [price, setPrice] = signal(100);
 * const total = memo(() => price() * 1.2);
 *
 * console.log(total()); // 120
 *
 * setPrice(200);
 *
 * console.log(total()); // 240
 * ```
 *
 * @remarks
 * - `memo(fn)` is equivalent to `computed(fn)` plus one immediate warm-up read.
 * - After the warm-up, clean reads reuse the cached value exactly like
 *   `computed()`.
 * - Later invalidations still follow normal computed semantics.
 *
 * @see computed
 */
export function memo<T>(fn: () => T): Memo<T> {
  const node = createComputedNode(fn);
  readConsumerEager(node);
  return readConsumerLazy.bind(null, node) as Memo<T>;
}
