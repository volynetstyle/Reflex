import type { ReactiveNode } from "../kernel";
import {
  DIRTY_STATE,
  defaultContext,
  currentConsumer,
  trackingEpoch,
  trackReadResolved,
  Changed,
  Visited,
} from "../kernel";
import {
  devAssertConsumerCanStabilize,
  devRecordReadConsumer,
} from "../kernel/dev";
import { advance } from "../kernel/walkers/ensureFresh";
import { walkBranch } from "../kernel/walkers/recomputeBranch";
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
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const node = this;
  const state = node.state;

  const value =
    (state & DIRTY_STATE) === 0
      ? (node.payload as T)
      : stabilizeDirtyConsumer<T>(node, state);

  const consumer = currentConsumer;

  if (consumer !== null) {
    trackReadResolved(node, consumer, trackingEpoch, true);
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

/**
 * Read a consumer without tracking the final dependency edge.
 *
 * Clean nodes return immediately. Dirty nodes are stabilized without binding
 * the current `currentConsumer` to this read.
 */
export function readConsumerEager<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  return (state & DIRTY_STATE) === 0
    ? (node.payload as T)
    : stabilizeDirtyConsumer<T>(node, state);
}

const FORCE_RECOMPUTE_STATE = Changed | Visited;

function shouldRecomputeDirty(node: ReactiveNode, state: number): boolean {
  if ((state & FORCE_RECOMPUTE_STATE) !== 0) return true;

  const edge = node.firstIn;
  return edge !== null && walkBranch(node, edge);
}

function stabilizeDirtyConsumer<T>(node: ReactiveNode<T>, state: number): T {
  if (__DEV__) devAssertConsumerCanStabilize(state);

  if (shouldRecomputeDirty(node, state)) {
    if (!advance(node)) {
      node.state &= ~DIRTY_STATE;
    }
  } else {
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
  const state = node.state;

  if (__DEV__) devAssertConsumerCanStabilize(state);

  if ((mode & LAZY) === 0) {
    if ((state & DIRTY_STATE) === 0) {
      const value = node.payload as T;

      if (__DEV__) devRecordReadConsumer(node, "eager", value, defaultContext);

      return value;
    }

    const value = stabilizeDirtyConsumer(node, state);

    if (__DEV__) devRecordReadConsumer(node, "eager", value, defaultContext);

    return value;
  }

  if ((state & DIRTY_STATE) === 0) {
    const value = node.payload as T;

    const consumer = currentConsumer;
    if (consumer !== null) {
      trackReadResolved(node, consumer, trackingEpoch, true);
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

  const value = stabilizeDirtyConsumer(node, state);

  const consumer = currentConsumer;
  if (consumer !== null) {
    trackReadResolved(node, consumer, trackingEpoch, true);
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
