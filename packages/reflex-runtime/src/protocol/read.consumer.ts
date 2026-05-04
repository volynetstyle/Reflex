import type { ReactiveNode } from "../reactivity";
import {
  DIRTY_STATE,
  trackRead,
  defaultContext,
  activeConsumer,
  Disposed,
  shouldRecomputeDirtyConsumer,
  recompute,
  propagateOnce,
} from "../reactivity";
import {
  devAssertReadDeadConsumer,
  devAssertConsumerCanStabilize,
  devRecordReadConsumer,
} from "../reactivity/dev";
import { ConsumerReadMode } from "./utils/constants";

/**
 * Read a consumer in tracking mode.
 *
 * This is the common read path for computed values:
 *
 * 1. Reject disposed consumers
 * 2. Assert that the current state may be stabilized
 * 3. Fast-path clean nodes by returning `node.payload` directly
 * 4. Stabilize dirty nodes before observing the value
 * 5. Register the read in the active reactive context
 *
 * The fast-path intentionally stays here, with dirty stabilization isolated in
 * a local slow path so clean reads do not bounce through helper layers.
 */
export function readConsumerLazy<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if ((state & Disposed) !== 0) {
    if (__DEV__) devAssertReadDeadConsumer();
    return node.payload;
  }

  if (__DEV__) devAssertConsumerCanStabilize(state);

  if ((state & DIRTY_STATE) === 0) {
    const value = node.payload as T;

    if (activeConsumer !== null) trackRead(node);

    if (__DEV__)
      devRecordReadConsumer(
        node,
        "lazy",
        value,
        defaultContext,
        activeConsumer ?? undefined,
      );

    return value;
  }

  return readConsumerLazySlow(node, state);
}

function readConsumerLazySlow<T>(node: ReactiveNode<T>, state: number): T {
  const value = stabilizeDirtyConsumer(node, state);

  trackRead(node);

  if (__DEV__)
    devRecordReadConsumer(
      node,
      "lazy",
      value,
      defaultContext,
      activeConsumer ?? undefined,
    );

  return value;
}

/**
 * Read a consumer without tracking the final dependency edge.
 *
 * Clean nodes return immediately. Dirty nodes are stabilized without binding
 * the current `activeConsumer` to this read.
 */
export function readConsumerEager<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if ((state & Disposed) !== 0) {
    if (__DEV__) devAssertReadDeadConsumer();
    return node.payload;
  }

  if (__DEV__) devAssertConsumerCanStabilize(state);

  if ((state & DIRTY_STATE) === 0) return node.payload as T;

  return readConsumerEagerSlow(node, state);
}

function readConsumerEagerSlow<T>(node: ReactiveNode<T>, state: number): T {
  if (activeConsumer === null) return stabilizeDirtyConsumer(node, state);

  return stabilizeDirtyConsumer(node, state);
}

/**
 * Read the value of a consumer (computed) node.
 * 
 * A consumer is a pure derived computation that caches its result and re-executes
 * when dependencies change. This function:
 * 
 * 1. Synchronizes the node to reflect all upstream changes (eager or lazy)
 * 2. Returns the current payload value
 * 3. If lazy mode (default), registers this read as a dependency of the active
 *    consumer (if any). This allows the calling code to be notified if this
 *    computed node's value changes.
 * 
 * Two modes are available:
 * - **Lazy** (default): Stabilization happens in the current context, preserving
 *   dependency tracking. Use when the computed value is a real dependency.
 * - **Eager**: Stabilization happens without the final dependency registration.
 *   Use for probing the value without creating a dependency edge.
 * @template T - The type of value stored in the node
 * @param {ReactiveNode<T>} node - The consumer node to read from
 * @param {ConsumerReadMode} mode - How to read the node (lazy or eager)
 * @returns {T} The current, up-to-date payload value
 * @example const signal = createProducer(1)
const doubled = createConsumer(() => readProducer(signal) * 2)

// Lazy read: synchronize and register dependency
const computed = createConsumer(() => {
  return readConsumer(doubled)  // Depends on doubled
})

// Eager read: synchronize without dependency
const debugValue = readConsumer(doubled, ConsumerReadMode.eager)
 * @invariant Returns node.payload after stabilization
 * @invariant In lazy mode, if called during compute, registers edge to active consumer
 * @invariant In eager mode, no dependency edge is created
 * @cost O(1) + stabilization cost (depends on upstream changes)
 */
export function readConsumer<T>(
  node: ReactiveNode<T>,
  mode: ConsumerReadMode = ConsumerReadMode.lazy,
): T {
  const state = node.state;

  if ((state & Disposed) !== 0) {
    if (__DEV__) devAssertReadDeadConsumer();
    return node.payload as T;
  }

  if (__DEV__) devAssertConsumerCanStabilize(state);

  if (mode !== ConsumerReadMode.lazy) {
    if ((state & DIRTY_STATE) === 0) {
      const value = node.payload as T;

      if (__DEV__) devRecordReadConsumer(node, "eager", value, defaultContext);

      return value;
    }

    const value = readConsumerEagerSlow(node, state);

    if (__DEV__) devRecordReadConsumer(node, "eager", value, defaultContext);

    return value;
  }

  if ((state & DIRTY_STATE) === 0) {
    const value = node.payload as T;

    if (activeConsumer !== null) trackRead(node);

    if (__DEV__)
      devRecordReadConsumer(
        node,
        "lazy",
        value,
        defaultContext,
        activeConsumer ?? undefined,
      );

    return value;
  }

  return readConsumerSlow(node, state);
}

function readConsumerSlow<T>(node: ReactiveNode<T>, state: number): T {
  const value = stabilizeDirtyConsumer(node, state);

  // Skip tracking if the node was disposed during stabilization
  if ((node.state & Disposed) === 0) trackRead(node);

  if (__DEV__)
    devRecordReadConsumer(
      node,
      "lazy",
      value,
      defaultContext,
      activeConsumer ?? undefined,
    );

  return value;
}

function stabilizeDirtyConsumer<T>(node: ReactiveNode<T>, state: number): T {
  if (!shouldRecomputeDirtyConsumer(node, state)) {
    node.state &= ~DIRTY_STATE;
    return node.payload as T;
  }

  if (recompute(node)) propagateOnce(node);

  return node.payload as T;
}
