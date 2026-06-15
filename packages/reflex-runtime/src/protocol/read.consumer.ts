import type { ReactiveNode } from "../kernel/shape";
import {
  defaultContext,
  currentConsumer,
  trackingEpoch,
} from "../kernel/context";
import { resolveTrackedRead } from "../kernel/engine/tracking";
import { Changed, DIRTY_STATE, Visited } from "../kernel/shape";
import {
  devAssertConsumerCanStabilize,
  devRecordReadConsumer,
} from "../kernel/dev";
import { advance } from "../kernel/stages/second/advance";
import { pull_iterator } from "../kernel/stages/second/pull_iterator";
import {
  runtimeProfileCounters,
  runtimeProfileCountersEnabled,
} from "../profiling";
import { LAZY } from "./utils/constants";

/**
 * Read a consumer in tracking mode.
 *
 * This is the common read path for computed values:
 *
 * 1. Assert that the current state may be stabilized
 * 2. Fast-path clean nodes by returning `node.payload` directly
 * 3. Stabilize dirty nodes before observing the value
 * 4. Register the read in the active reactive context
 *
 * The fast-path intentionally stays here, with dirty stabilization isolated in
 * a local slow path so clean reads do not bounce through helper layers.
 */
export function readConsumerLazy<T>(this: ReactiveNode<T>): T {
  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.readConsumerCalls += 1;
    runtimeProfileCounters.readConsumerLazyCalls += 1;
  }

  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const node = this;
  const state = node.state;
  const isDirty = (state & DIRTY_STATE) !== 0;

  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    if (isDirty) runtimeProfileCounters.readConsumerDirtyPath += 1;
    else runtimeProfileCounters.readConsumerCleanFastPath += 1;
  }

  const value =
    !isDirty
      ? (node.payload as T)
      : stabilizeDirtyConsumer<T>(node, state);

  const consumer = currentConsumer;

  if (consumer === null) return value;

  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.readConsumerTracked += 1;
  }

  resolveTrackedRead(node, consumer, trackingEpoch, true);

  if (__DEV__) {
    devRecordReadConsumer(node, "lazy", value, defaultContext, consumer);
  }

  return value;
}

/**
 * Read a consumer without tracking the final dependency edge.
 *
 * Clean nodes return immediately. Dirty nodes are stabilized without binding
 * the current `currentConsumer` to this read.
 */
export function readConsumerEager<T>(node: ReactiveNode<T>): T {
  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.readConsumerCalls += 1;
    runtimeProfileCounters.readConsumerEagerCalls += 1;
  }

  const state = node.state;
  const isDirty = (state & DIRTY_STATE) !== 0;

  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    if (isDirty) runtimeProfileCounters.readConsumerDirtyPath += 1;
    else runtimeProfileCounters.readConsumerCleanFastPath += 1;
  }

  return !isDirty
    ? (node.payload as T)
    : stabilizeDirtyConsumer<T>(node, state);
}

const FORCE_RECOMPUTE_STATE = Changed | Visited;

function stabilizeDirtyConsumer<T>(node: ReactiveNode<T>, state: number): T {
  if (__DEV__) devAssertConsumerCanStabilize(state);

  if ((state & FORCE_RECOMPUTE_STATE) !== 0) {
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.stabilizeForceAdvance += 1;
    }

    if (!advance(node)) node.state &= ~DIRTY_STATE;
    return node.payload as T;
  }

  const edge = node.firstIn;

  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.stabilizePullAdvance += 1;
  }

  if (edge === null || !pull_iterator(node, edge) || !advance(node)) {
    node.state &= ~DIRTY_STATE;
  }

  return node.payload as T;
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
export function readConsumer<T>(node: ReactiveNode<T>, mode: number = LAZY): T {
  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.readConsumerCalls += 1;
  }

  if (mode !== LAZY) {
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.readConsumerEagerCalls += 1;
    }

    const state = node.state;
    const isDirty = (state & DIRTY_STATE) !== 0;

    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      if (isDirty) runtimeProfileCounters.readConsumerDirtyPath += 1;
      else runtimeProfileCounters.readConsumerCleanFastPath += 1;
    }

    const value =
      !isDirty
        ? (node.payload as T)
        : stabilizeDirtyConsumer(node, state);

    if (__DEV__) {
      devRecordReadConsumer(node, "eager", value, defaultContext);
    }

    return value;
  }

  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.readConsumerLazyCalls += 1;
  }

  const state = node.state;
  const isDirty = (state & DIRTY_STATE) !== 0;

  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    if (isDirty) runtimeProfileCounters.readConsumerDirtyPath += 1;
    else runtimeProfileCounters.readConsumerCleanFastPath += 1;
  }

  const value =
    !isDirty
      ? (node.payload as T)
      : stabilizeDirtyConsumer(node, state);

  const consumer = currentConsumer;
  if (consumer !== null) {
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.readConsumerTracked += 1;
    }

    resolveTrackedRead(node, consumer, trackingEpoch, true);
  }

  if (__DEV__) {
    devRecordReadConsumer(
      node,
      "lazy",
      value,
      defaultContext,
      consumer ?? undefined,
    );
  }

  return value;
}
