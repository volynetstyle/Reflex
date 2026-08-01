import { defaultContext } from "@runtime/kernel/config";
import { flushPendingRuntimeIdle } from "@runtime/kernel/batch";
import {
  currentConsumer,
  RuntimeState,
  runtimeState,
  trackingEpoch,
} from "@runtime/kernel/state";
import {
  devAssertConsumerCanStabilize,
  devRecordReadConsumer,
} from "@runtime/kernel/dev";
import { devAssertNoRuntimeHookReactiveRead } from "@runtime/kernel/execution";
import {
  Changed,
  DIRTY_STATE,
  Visited,
  type ConsumerNode,
} from "@runtime/kernel/shape";
import { resolveTrackedRead } from "@runtime/kernel/shape/tracking";
import { advance } from "@runtime/kernel/stages/second/advance";
import { pull_iterator } from "@runtime/kernel/stages/second/pull_iterator";
import {
  profileRuntimeCounter,
  profileRuntimeReadConsumerPath,
} from "@runtime/profiling";

import { LAZY, type ConsumerReadModeValue } from "./utils/constants";

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
export function readConsumerLazy<T>(this: ConsumerNode<T>): T {
  devAssertNoRuntimeHookReactiveRead();

  profileRuntimeCounter("readConsumerCalls");
  profileRuntimeCounter("readConsumerLazyCalls");

  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const producer = this;
  const state = producer.state;
  const isDirty = (state & DIRTY_STATE) !== 0;

  profileRuntimeReadConsumerPath(isDirty);

  const value = isDirty
    ? stabilizeDirtyConsumer(producer, state)
    : producer.payload;

  const consumer = currentConsumer;

  if (consumer === null) return value;

  profileRuntimeCounter("readConsumerTracked");
  resolveTrackedRead(producer, consumer, trackingEpoch, true);
  devRecordReadConsumer(producer, "lazy", value, defaultContext, consumer);

  return value;
}

/**
 * Read a consumer without tracking the final dependency edge.
 *
 * Clean nodes return immediately. Dirty nodes are stabilized without binding
 * the current `currentConsumer` to this read.
 */
export function readConsumerEager<T>(node: ConsumerNode<T>): T {
  devAssertNoRuntimeHookReactiveRead();
  profileRuntimeCounter("readConsumerCalls");
  profileRuntimeCounter("readConsumerEagerCalls");

  const state = node.state;
  const isDirty = (state & DIRTY_STATE) !== 0;

  profileRuntimeReadConsumerPath(isDirty);
  return isDirty ? stabilizeDirtyConsumer(node, state) : node.payload;
}

const FORCE_RECOMPUTE_STATE = Changed | Visited;

function stabilizeDirtyConsumer<T>(node: ConsumerNode<T>, state: number): T {
  devAssertConsumerCanStabilize(state);

  let stabilized: boolean;

  if ((state & FORCE_RECOMPUTE_STATE) !== 0) {
    profileRuntimeCounter("stabilizeForceAdvance");
    stabilized = advance(node);
  } else {
    const edge = node.firstIn;
    profileRuntimeCounter("stabilizePullAdvance");
    // A node is considered newest if it:
    // - has producers,
    // - all top-level dependencies are checked,... and
    // - its eigenvalue is updated to the newest one.
    stabilized = edge !== null && pull_iterator(node, edge) && advance(node);
  }

  if (!stabilized) node.state &= ~DIRTY_STATE;
  if ((runtimeState & RuntimeState.IdlePending) !== RuntimeState.Idle) {
    flushPendingRuntimeIdle();
  }

  return node.payload;
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
  node: ConsumerNode<T>,
  mode: ConsumerReadModeValue = LAZY,
): T {
  devAssertNoRuntimeHookReactiveRead();

  profileRuntimeCounter("readConsumerCalls");

  if (mode !== LAZY) {
    profileRuntimeCounter("readConsumerEagerCalls");

    const state = node.state;
    const isDirty = (state & DIRTY_STATE) !== 0;

    profileRuntimeReadConsumerPath(isDirty);

    const value = !isDirty ? node.payload : stabilizeDirtyConsumer(node, state);

    devRecordReadConsumer(node, "eager", value, defaultContext);

    return value;
  }

  profileRuntimeCounter("readConsumerLazyCalls");

  const state = node.state;
  const isDirty = (state & DIRTY_STATE) !== 0;

  profileRuntimeReadConsumerPath(isDirty);

  const value = !isDirty ? node.payload : stabilizeDirtyConsumer(node, state);

  const consumer = currentConsumer;
  if (consumer !== null) {
    profileRuntimeCounter("readConsumerTracked");

    resolveTrackedRead(node, consumer, trackingEpoch, true);
  }

  devRecordReadConsumer(
    node,
    "lazy",
    value,
    defaultContext,
    consumer ?? undefined,
  );

  return value;
}
