import type { ProducerComparator } from "./compare";
import type { ReactiveNode } from "../reactivity";
import { compare as defaultComparator } from "./compare";
import { devAssertWriteAlive, devRecordWriteProducer } from "../reactivity/dev";
import { PROMOTE_CHANGED, isDisposedNode, propagate } from "../reactivity";
import {
  defaultContext,
  enterPropagation,
  leavePropagation,
} from "../reactivity/context";

/**
 * Write a new value to a producer (source) node.
 * 
 * This is the primary entry point for mutating reactive state. When a producer's
 * value changes, this function:
 * 
 * 1. Compares the old and new values using a stable comparison function
 * 2. If values are equal, returns early (no propagation needed)
 * 3. If values differ:
 *    - Updates node.payload
 *    - Clears dirty state bits (node is now clean)
 *    - Synchronously notifies ALL subscribers through the "push phase"
 *    - All subscribers are marked with Changed state so they'll recompute when read
 * 
 * The propagation is synchronous and immediately promotes direct subscribers.
 * producer are notified before writeProducer returns. This ensures deterministic
 * ordering and allows batching of changes at a higher level (scheduler).
 * 
 * **Important**: This does NOT execute any compute functions. Consumer nodes are
 * marked dirty but only recompute when actually read (lazy evaluation). This
 * decoupling enables:
 * - Batching multiple writes before any recomputes
 * - Skipping recomputes for unread nodes
 * - Deterministic propagation order
 * @template T - The type of value stored in the producer
 * @param {ReactiveNode<T>} node - The producer node to update
 * @param {T} value - The new value to set
 * @returns {void} Nothing; the update is performed as a side-effect
 * @example const signal = createProducer(0)

const doubled = createConsumer(() => {
  return readProducer(signal) * 2
})

// Update the signal
writeProducer(signal, 5)
// - signal.payload becomes 5
// - doubled is marked Changed
// - doubled.compute() is NOT called yet

// Only when doubled is read does it re-execute
const value = readConsumer(doubled)  // Now returns 10
 * @invariant If value hasn't changed (compare returns true), no propagation occurs
 * @invariant If value changed, ALL reachable subscribers are notified synchronously
 * @invariant No compute functions execute during writeProducer
 * @invariant Subscribers are marked with Changed state (will recompute when read)
 * @cost O(n) where n = number of subscribers reachable from this node
 */
export function writeProducer<T>(
  node: ReactiveNode<T>,
  value: T,
  compare: ProducerComparator<T> = defaultComparator,
): void {
  if (isDisposedNode(node)) {
    if (__DEV__) devAssertWriteAlive();
    return;
  }

  const prev = node.payload;

  // Check if the value actually changed using stable comparison
  // This prevents false invalidation when setting to the same value
  if (compare(prev, value)) {
    if (__DEV__) {
      devRecordWriteProducer(
        node,
        false,
        value,
        prev,
        undefined,
        defaultContext,
      );
    }
    // Value didn't change, skip propagation
    return;
  }

  // Update the payload to the new value
  node.payload = value;

  // Get the first subscriber edge (if any)
  const firstSubscriberEdge = node.firstOut;

  if (__DEV__) {
    devRecordWriteProducer(
      node,
      true,
      value,
      prev,
      firstSubscriberEdge !== null,
      defaultContext,
    );
  }

  // If no subscribers, propagation is unnecessary
  if (firstSubscriberEdge === null) return;

  enterPropagation();

  try {
    // Push phase: notify all subscribers depth-first, mark them dirty.
    // Direct subscribers are promoted from Invalid to Changed.
    // This tells them "definitely changed, don't verify, recompute"
    propagate(firstSubscriberEdge, PROMOTE_CHANGED);
  } finally {
    // Always exit propagation phase, even if propagation or hooks fail.
    leavePropagation();
  }
}
