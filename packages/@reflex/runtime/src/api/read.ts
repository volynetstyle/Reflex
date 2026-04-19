import type { ReactiveNode } from "../reactivity";
import {
  devAssertConsumerCanStabilize,
  devAssertReadDeadConsumer,
  devAssertReadDeadProducer,
  devRecordReadConsumer,
  devRecordReadProducer,
} from "../reactivity/dev";
import {
  ReactiveNodeState,
  DIRTY_STATE,
  recompute,
  propagateOnce,
  clearDirtyState,
  isDisposedNode,
  shouldRecomputeDirtyConsumer,
  trackRead,
} from "../reactivity";
import {
  activeConsumer,
  defaultContext,
  setActiveConsumer,
} from "../reactivity/context";

/**
 * Read mode for consumer nodes (computed values).
 *
 * @enum {number}
 *
 * @property {1} lazy - Stabilize and register dependency in active context.
 *   The node is synchronized to reflect upstream changes, and this read is
 *   registered as a dependency of the currently executing computation (if any).
 *   If no computation is active, the read is not tracked.
 *
 * @property {2} eager - Stabilize immediately without dependency registration.
 *   The node is synchronized without the final dependency `trackRead()` step.
 *   Useful for force-refreshing a value without creating a dependency relationship.
 */
export const ConsumerReadMode = {
  lazy: 1 << 0,
  eager: 1 << 1,
} as const;

export type ConsumerReadMode =
  (typeof ConsumerReadMode)[keyof typeof ConsumerReadMode];

/**
 * Read the value of a producer (source) node.
 *
 * A producer is a mutable source of data (e.g., a signal). Calling this function:
 *
 * 1. Returns the current payload value
 * 2. If called during active computation, registers a dependency relationship
 *    so the consumer will be notified if this producer changes
 * 3. Does NOT perform any recomputation (producers hold mutable state directly)
 *
 * @template T - The type of value stored in the producer node
 *
 * @param {ReactiveNode<T>} node - The producer node to read from
 * @param {ExecutionContext} context - Execution context (defaults to global context)
 *
 * @returns {T} The current payload of the producer
 *
 * @example
 * const signal = createProducer(42)
 * const value = readProducer(signal)  // 42
 *
 * const computed = createConsumer(() => {
 *   const val = readProducer(signal)  // Registers dependency
 *   return val * 2
 * })
 *
 * @invariant Always returns node.payload (no computation needed)
 * @invariant If called during compute, creates edge from producer to active consumer
 * @cost O(1) for value access + O(k) for dependency tracking (k = cursor distance)
 */
export function readProducer<T>(node: ReactiveNode<T>): T {
  if (isDisposedNode(node)) {
    devAssertReadDeadProducer();
    return node.payload as T;
  }

  // Register this read as a dependency if there's an active computation
  trackRead(node);

  if (__DEV__) {
    devRecordReadProducer(node, node.payload, defaultContext);
  }

  return node.payload as T;
}

/**
 * Synchronize a consumer (computed) node to reflect all upstream changes.
 *
 * This is the "pull phase" of change propagation. It ensures that a consumer's
 * value is up-to-date by:
 *
 * 1. Checking if the node is dirty (has DIRTY_STATE flag)
 * 2. If Changed (directly promoted by push phase), re-executing compute()
 * 3. If Invalid (transitive change), walking the dependency tree via shouldRecompute()
 *    to confirm actual upstream change before re-executing
 * 4. If change is confirmed and has multiple subscribers, notifying siblings via
 *    propagateOnce() to prevent them from missing changes
 *
 * This separation prevents false recomputes: a node marked Invalid due to
 * transitive invalidation is verified before re-executing user code.
 * @template T - The type of value stored in the node
 * @param {ReactiveNode<T>} node - The consumer node to stabilize
 * @returns {T} The up-to-date payload value
 * @throws {Error} If a cycle is detected (node is already Computing)
 * @example const signal = createProducer(1)
 * const doubled = createConsumer(() => readProducer(signal) * 2)
 *
 * const value = stabilizeConsumer(doubled)  // Ensures value is current
 * @invariant Returns node.payload after ensuring it reflects upstream state
 * @invariant Node.state & DIRTY_STATE === 0 after return
 * @invariant If value changed, nodes with fanout are notified via propagateOnce
 * @cost O(deps) for shouldRecompute walk + O(compute) for re-execution if needed
 */
function stabilizeConsumer<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if ((state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertReadDeadConsumer();
    return node.payload as T;
  }

  if (__DEV__) devAssertConsumerCanStabilize(state);

  if ((state & DIRTY_STATE) === 0) return node.payload as T;

  if (!shouldRecomputeDirtyConsumer(node, state)) {
    clearDirtyState(node);
    return node.payload as T;
  }

  if (recompute(node) && node.firstOut !== null) {
    propagateOnce(node);
  }

  return node.payload as T;
}

function stabilizeConsumerUntracked<T>(node: ReactiveNode<T>, state: number): T {
  if ((state & DIRTY_STATE) === 0) return node.payload as T;
  if (activeConsumer === null) return stabilizeConsumer(node);
  return untracked(() => stabilizeConsumer(node));
}

export function readConsumerLazy<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if ((state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertReadDeadConsumer();
    return node.payload as T;
  }

  if (__DEV__) devAssertConsumerCanStabilize(state);

  const value =
    (state & DIRTY_STATE) !== 0 ? stabilizeConsumer(node) : (node.payload as T);

  // Skip tracking if the node was disposed during stabilization
  if (!isDisposedNode(node)) trackRead(node);

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

export function readConsumerEager<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if ((state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertReadDeadConsumer();
    return node.payload as T;
  }

  if (__DEV__) devAssertConsumerCanStabilize(state);

  const value = stabilizeConsumerUntracked(node, state);

  return value;
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

  if ((state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertReadDeadConsumer();
    return node.payload as T;
  }

  if (__DEV__) devAssertConsumerCanStabilize(state);

  const value =
    mode === ConsumerReadMode.lazy
      ? (state & DIRTY_STATE) !== 0
        ? stabilizeConsumer(node)
        : (node.payload as T)
      : stabilizeConsumerUntracked(node, state);

  if (mode === ConsumerReadMode.lazy) {
    // Skip tracking if the node was disposed during stabilization
    if (!isDisposedNode(node)) trackRead(node);

    if (__DEV__)
      devRecordReadConsumer(
        node,
        "lazy",
        value,
        defaultContext,
        activeConsumer ?? undefined,
      );
  } else {
    if (__DEV__) devRecordReadConsumer(node, "eager", value, defaultContext);
  }

  return value;
}

/**
 * Execute a callback function without registering reactive dependencies.
 * 
 * Temporarily clears the active computation context, allowing reads within
 * the callback to NOT create dependency edges. Useful for:
 * 
 * - Debugging or logging values without affecting reactivity
 * - Accessing side-effect values that shouldn't trigger re-execution
 * - Breaking dependency chains when you need a one-time read
 * 
 * The context is always restored after the callback returns, even if an
 * exception is thrown.
 * @template T - The return type of the callback
 * @param {() => T} fn - Function to execute without dependency tracking
 * @returns {T} The return value of the callback
 * @throws Propagates any exception thrown by the callback
 * @example const signal = createProducer(42)

const computed = createConsumer(() => {
  const value = readProducer(signal)  // Creates dependency

  // Read the value without creating dependency
  const debugValue = untracked(() => readProducer(signal))

  return value * 2
})

// If signal changes, computed re-executes (has dependency)
// But untracked read inside doesn't affect this
 * @invariant context.activeConsumer is null during fn() execution
 * @invariant context.activeConsumer is restored after fn() returns/throws
 * @cost O(1) for context manipulation
 */
export function untracked<T>(fn: () => T): T {
  // Save the current active computation context
  const prev = activeConsumer;
  // Clear the active context so reads don't create dependencies
  setActiveConsumer(null);

  try {
    // Execute the callback in untracked context
    return fn();
  } finally {
    // Always restore the previous context
    setActiveConsumer(prev);
  }
}
