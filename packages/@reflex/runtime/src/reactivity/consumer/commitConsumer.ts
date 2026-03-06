import { CLEAR_INVALID, ReactiveNode, ReactiveNodeState } from "../shape";
import { changePayload } from "../shape/payload";

// commit = state transition
// validation = strategy

/**
 * Store the new value and decide whether downstream nodes must be invalidated.
 *
 * Returns true  → value changed, caller should propagate.
 * Returns false → same value, skip propagate (memoisation hit).
 *
 * Also clears INVALID / OBSOLETE bits and handles FAILED state transitions.
 */
// @__INLINE__
export function commitConsumer(
  consumer: ReactiveNode,
  next: unknown,
  error?: unknown,
): boolean {
  consumer.runtime &= CLEAR_INVALID;

  if (consumer.payload === next) {
    // Value did not change — memoisation hit, no propagation needed.
    return false;
  }

  changePayload(consumer, next);
  return true; // Changed → caller must propagate
}