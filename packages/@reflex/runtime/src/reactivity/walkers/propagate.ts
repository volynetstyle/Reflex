import type { ExecutionContext } from "../context";
import type { ReactiveNode } from "../shape";
import { recordDebugEvent } from "../../debug";
import {
  type ReactiveEdge,
  DIRTY_STATE,
  WALKER_STATE,
  ReactiveNodeState,
} from "../shape";

/**
 * Propagation modes for change notification.
 *
 * @constant {0} NON_IMMEDIATE - Mark subscribers as Invalid (might have changed).
 *   Used for transitive subscribers (not direct children of the changed node).
 *   These nodes will need verification via shouldRecompute() before re-executing.
 *
 * @constant {1} IMMEDIATE - Promote Invalid subscribers to Changed (definitely changed).
 *   Used for direct subscribers of a changed node.
 *   These nodes will recompute immediately when read, skipping verification.
 */
export const NON_IMMEDIATE = 0;
export const IMMEDIATE = 1;

/**
 * Fast-path rejection mask for propagation.
 *
 * A subscriber is skipped if ANY of these flags are set:
 * - DIRTY_STATE: Already marked dirty (double-marking is pointless)
 * - Disposed: Node is dead, no propagation needed
 * - WALKER_STATE (Visited|Tracking): Node is currently being traversed
 *   or is accepting new dependencies (re-entrance case)
 *
 * If NONE of these flags are set, use fast path: just set dirty bit.
 * Otherwise, use slow path: check specific conditions (disposed, re-entrant, etc.)
 */
const INVALIDATION_SLOW_PATH_MASK =
  DIRTY_STATE | ReactiveNodeState.Disposed | WALKER_STATE;

/**
 * Check if an edge is part of the actively-tracked dependency prefix.
 *
 * During compute(), as dependencies are read, they're added to the incoming edge list.
 * depsTail marks the end of "current execution's dependencies". Everything before
 * depsTail (in the backwards chain) is part of the active prefix.
 *
 * This function is called during re-entrant invalidation:
 * - Compute() is running and has read some dependencies (depsTail set)
 * - Meanwhile, an ancestor invalidates this consumer
 * - We need to know: is the edge being invalidated part of what was already read?
 *
 * If yes: keep it (Visited | Invalid)
 * If no: drop it (don't propagate, it became inactive)
 *
 * @param {ReactiveEdge} edge - The edge being checked for inclusion in prefix
 * @param {ReactiveEdge | null} depsTail - The cursor marking end of active prefix
 * @returns {boolean} True if edge is in the tracked prefix, false otherwise
 *
 * @example
 * // depsTail points to edge(B → consumer)
 * // Check if edge(A → consumer) is before it
 * isTrackedPrefixEdge(edgeA, depsTail)  // true
 * isTrackedPrefixEdge(edgeC, depsTail)  // false (C comes after B)
 *
 * @invariant Walks backwards from depsTail via prevIn chain
 * @cost O(prefix_length) in worst case
 */
function isTrackedPrefixEdge(
  edge: ReactiveEdge,
  depsTail: ReactiveEdge | null,
): boolean {
  // If no cursor, nothing is tracked
  if (depsTail === null) return false;
  // If this edge IS the cursor, it's definitely in prefix
  if (edge === depsTail) return true;

  // Walk backwards through the active prefix
  // If we reach depsTail before cycling back, edge is in prefix
  for (let cursor = edge.prevIn; cursor !== null; cursor = cursor.prevIn) {
    if (cursor === depsTail) return false;
  }

  // Reached end of list without finding depsTail, so edge is before it (in prefix)
  return true;
}

/**
 * Notify a watcher node that one of its dependencies has changed.
 *
 * Watchers are nodes that execute side-effects when dependencies change.
 * When invalidation reaches a watcher, we immediately dispatch an event to
 * notify the host scheduler that this watcher needs re-execution.
 *
 * If the host's dispatchWatcherEvent() throws, we collect the error and
 * re-throw it after attempting to notify all watchers. This ensures one
 * watcher's exception doesn't prevent others from being notified.
 *
 * @param {ReactiveNode} node - The watcher node being invalidated
 * @param {unknown} thrown - Previously thrown error (if any), to collect multiple errors
 * @param {ExecutionContext} context - Execution context with dispatchWatcherEvent hook
 * @returns {unknown} The original thrown error, or a new error from this notification
 *
 * @throws Does NOT throw immediately; errors are collected and re-thrown later
 * @cost O(1) for notification dispatch
 */
function notifyWatcherInvalidation(
  node: ReactiveNode,
  thrown: unknown,
  context: ExecutionContext,
): unknown {
  try {
    // Call the host's watcher notification hook
    context.dispatchWatcherEvent(node);
  } catch (error) {
    // Collect this error; we'll re-throw after all watchers
    return thrown ?? error;
  }

  // Return any previously thrown error (might throw later)
  return thrown;
}

/**
 * Record a propagation event for debugging.
 *
 * In development mode, every state transition during propagation is logged
 * for analysis. In production, this is a no-op.
 *
 * @param {ReactiveEdge} edge - The edge through which propagation travels
 * @param {number} nextState - The new state being assigned to the subscriber
 * @param {number} promote - Whether this is immediate (1) or non-immediate (0)
 * @param {ExecutionContext} context - Execution context with debug event handler
 */
function recordPropagation(
  edge: ReactiveEdge,
  nextState: number,
  promote: number,
  context: ExecutionContext,
): void {
  if (!__DEV__) return;

  recordDebugEvent(context, "propagate", {
    detail: {
      immediate: promote !== 0,
      nextState,
    },
    source: edge.from,
    target: edge.to,
  });
}

/**
 * Compute the next state for a subscriber in the slow path.
 *
 * The slow path handles edge cases that can't use simple state transitions:
 * 1. Subscribers that are already dirty (don't double-mark)
 * 2. Disposed subscribers (never mark, they're dead)
 * 3. Subscribers that are currently computing and accepting dependencies
 *    (re-entrance case: check if invalidating edge was already read)
 *
 * @param {ReactiveEdge} edge - The edge through which invalidation arrives
 * @param {number} state - Current state of the subscriber
 * @param {number} promoteImmediate - Whether to set Invalid (0) or Changed (1)
 * @returns {number} The new state to assign, or 0 to skip (no change)
 *
 * @example
 * // Direct subscriber of a change, can be promoted
 * getSlowInvalidatedSubscriberState(edge, ConsumerState, IMMEDIATE)
 * // → Consumer | Changed
 *
 * // Transitive, less certainty
 * getSlowInvalidatedSubscriberState(edge, ConsumerState, NON_IMMEDIATE)
 * // → Consumer | Invalid
 *
 * // Already dirty, skip
 * getSlowInvalidatedSubscriberState(edge, Consumer | Invalid, ...)
 * // → 0 (skip)
 */
function getSlowInvalidatedSubscriberState(
  edge: ReactiveEdge,
  state: number,
  promoteImmediate: number,
): number {
  const sub = edge.to;

  // Already dirty or disposed? Skip this subscriber (return 0 = no change)
  if ((state & (DIRTY_STATE | ReactiveNodeState.Disposed)) !== 0) return 0;

  // Not currently computing/tracking? Use fast path state transition
  if ((state & ReactiveNodeState.Tracking) === 0) {
    const cleared = state & ~ReactiveNodeState.Visited;
    return (
      cleared |
      (promoteImmediate ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
    );
  }

  // SLOW PATH: Node is computing (accepting dependencies)
  // Check if this invalidating edge is part of what's being tracked
  return isTrackedPrefixEdge(edge, sub.depsTail)
    ? // Edge was read before compute started, mark for re-execution
      state | ReactiveNodeState.Visited | ReactiveNodeState.Invalid
    : // Edge became inactive, skip it
      0;
}

/**
 * Single-level shallow propagation for direct subscribers.
 *
 * When a consumer's value changes during pull-phase evaluation, it might have
 * multiple subscribers (fanout). This function promotes all those subscribers
 * from Invalid to Changed state without descending further (shallow, one level).
 *
 * Why needed? Without propagateOnce, sibling subscribers might not see the change:
 * - Node A changes
 * - propagate() visits subscriber B, marks B as Changed
 * - B's result changes when recomputed
 * - But C (B's sibling subscriber of A) is still Invalid
 * - C gets read before B's change is reflected
 * - C misses B's change
 *
 * propagateOnce(B) fixes this by immediately promoting C.
 *
 * @param {ReactiveNode} node - The node whose value has changed
 * @param {ExecutionContext} context - Execution context
 *
 * @example
 * const source = createProducer(1)
 * const double = createConsumer(() => source * 2)
 * const triple = createConsumer(() => source * 3)
 * const sum = createConsumer(() => double + triple)
 *
 * // When source changes:
 * // 1. propagate() marks double and triple as Changed
 * // 2. When double is read → recomputes → value changes
 * // 3. propagateOnce(double) marks sum invalid (it reads both)
 * // 4. sum will notice the change when read
 *
 * @cost O(out_degree) where out_degree = number of direct subscribers
 */
export function propagateOnce(
  node: ReactiveNode,
  context: ExecutionContext,
): void {
  let thrown: unknown = null;

  // Loop through all direct subscribers (outgoing edges)
  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    const state = sub.state;
    // Only pure Invalid subscribers can be promoted here.
    if ((state & DIRTY_STATE) !== ReactiveNodeState.Invalid) continue;

    const nextState =
      (state & ~ReactiveNodeState.Invalid) | ReactiveNodeState.Changed;
    sub.state = nextState;

    if (__DEV__) {
      recordPropagation(edge, nextState, IMMEDIATE, context);
    }

    // If this subscriber is a watcher, notify it
    if ((nextState & ReactiveNodeState.Watcher) !== 0) {
      thrown = notifyWatcherInvalidation(sub, thrown, context);
    }
  }

  // If any watcher notification threw, re-throw after all watchers notified
  if (thrown !== null) throw thrown;
}

function propagateBranching(
  edge: ReactiveEdge,
  promote: number,
  resume: ReactiveEdge | null,
  resumePromote: number,
  thrown: unknown,
  context: ExecutionContext,
): unknown {
  // Explicit stack for depth-first traversal when fanout is encountered
  const edgeStack: ReactiveEdge[] = [];
  const promoteStack: number[] = [];
  let stackTop = -1;

  // The fast invalidation branch is duplicated here and in propagateLinear.
  // This keeps the hot loop flatter and benchmarks better than routing through
  // a shared helper (function call overhead).
  while (true) {
    const sub = edge.to;
    const state = sub.state;
    // Check if fast path applies, else use slow path logic
    const nextState =
      (state & INVALIDATION_SLOW_PATH_MASK) === 0
        ? state |
          (promote ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
        : getSlowInvalidatedSubscriberState(edge, state, promote);

    if (nextState !== 0) {
      // Non-zero means: update this subscriber's state
      sub.state = nextState;
      if (__DEV__) {
        recordPropagation(edge, nextState, promote, context);
      }

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        // This subscriber is a watcher, notify it
        thrown = notifyWatcherInvalidation(sub, thrown, context);
      } else {
        // Not a watcher, might have subscribers of its own
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          // Fanout: descend into this subscriber's subscribers
          if (resume !== null) {
            // Save the sibling edge for later processing
            stackTop += 1;
            edgeStack[stackTop] = resume;
            promoteStack[stackTop] = resumePromote;
          }

          // Process the first subscriber of sub
          edge = firstOut;
          // The next sibling of firstOut is the other branch
          resume = edge.nextOut;
          // Transitive subscribers: NON_IMMEDIATE (might change)
          promote = resumePromote = NON_IMMEDIATE;
          continue;
        }
      }
    }

    // Move to next edge in current level, or pop stack
    if (resume !== null) {
      // Process the sibling edge
      edge = resume;
      promote = resumePromote;
      resume = edge.nextOut;
    } else if (stackTop >= 0) {
      // Pop stack: resume a previously saved branch
      edge = edgeStack[stackTop]!;
      promote = resumePromote = promoteStack[stackTop]!;
      --stackTop;
      resume = edge.nextOut;
    } else {
      // All branches processed
      return thrown;
    }
  }
}

function propagateLinear(
  edge: ReactiveEdge,
  promote: number,
  thrown: unknown,
  context: ExecutionContext,
): unknown {
  // Linear propagation for chains without fanout (no sibling edges).
  // This is the hot path for most reactive graphs.
  while (true) {
    const sub = edge.to;
    const state = sub.state;
    // Check fast path first for performance
    const nextState =
      (state & INVALIDATION_SLOW_PATH_MASK) === 0
        ? state |
          (promote ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
        : getSlowInvalidatedSubscriberState(edge, state, promote);
    // Peek at the next sibling edge
    const next = edge.nextOut;

    if (nextState !== 0) {
      // Update subscriber state
      sub.state = nextState;
      if (__DEV__) {
        recordPropagation(edge, nextState, promote, context);
      }

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        // Watcher found, notify it
        thrown = notifyWatcherInvalidation(sub, thrown, context);
      } else {
        // Not a watcher, check if it has subscribers
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          // This subscriber has its own subscribers
          edge = firstOut;

          if (next !== null) {
            // Fanout detected! Switch to branching path with explicit stack
            return propagateBranching(
              edge,
              NON_IMMEDIATE,
              next,
              promote,
              thrown,
              context,
            );
          }

          // No sibling, stay on linear path
          promote = NON_IMMEDIATE;
          continue;
        }
      }
    }

    // Move to next sibling or exit
    if (next === null) return thrown;
    edge = next;
  }
}

/**
 * Deep propagation traversal for all subscribers of a changed node.
 *
 * This is the "push phase" of the two-phase propagation strategy. When a producer's
 * value changes, propagate() visits all reachable subscribers in a depth-first order,
 * marking them dirty so they'll recompute when read (lazy evaluation).
 *
 * The traversal uses an adaptive strategy:
 * - **Linear path**: For chains without fanout (common case), uses tight loop
 * - **Branching path**: For fanout (multiple subscribers), uses explicit stack for DFS
 *
 * Two promotion modes:
 * - **IMMEDIATE**: Direct subscribers are promoted Invalid → Changed (confirmed change)
 * - **NON_IMMEDIATE**: Transitive subscribers marked Invalid (might have changed)
 *
 * The separation allows pull-phase (shouldRecompute) to distinguish between
 * confirmed and possible changes, enabling lazy verification of transitive changes.
 *
 * **Important**: This function does NOT execute any compute functions. Subscribers
 * are only marked dirty. Recomputation happens lazily when nodes are read.
 *
 * @param {ReactiveEdge} startEdge - First edge to process (from changed node)
 * @param {number} promoteImmediate - 0 for NON_IMMEDIATE, 1 for IMMEDIATE
 * @param {ExecutionContext} context - Execution context
 *
 * @throws If any watcher notification throws, collects error and re-throws
 *
 * @example
 * const signal = createProducer(1)
 * const double = createConsumer(() => signal * 2)
 * const quad = createConsumer(() => double * 2)
 *
 * writeProducer(signal, 2)
 *   → propagate(signal→double, IMMEDIATE, context)
 *      → double marked Changed
 *      → propagate(double→quad, NON_IMMEDIATE, context)
 *         → quad marked Invalid
 *      → (no compute yet)
 *
 * readConsumer(quad)
 *   → stabilizeConsumer(quad)
 *      → shouldRecompute(quad)  (walk deps to verify)
 *         → recompute(double)
 *            → result changed
 *         → recompute(quad)
 *      → return new value
 *
 * @cost O(n) where n = transitive subscriber count
 * @invariant All reachable subscribers visited in deterministic depth-first order
 * @invariant No subscriber marked dirty twice (fast path rejects already-dirty)
 * @invariant Disposed nodes skipped (slow path check)
 * @invariant Watcher events dispatched before function returns
 */
export function propagate(
  startEdge: ReactiveEdge,
  promoteImmediate = 0,
  context: ExecutionContext,
): void {
  // Start propagation from the first edge, collecting thrown errors
  const thrown = propagateLinear(startEdge, promoteImmediate, null, context);

  // If any errors were thrown during watcher notification, re-throw now
  if (thrown !== null) throw thrown;
}
