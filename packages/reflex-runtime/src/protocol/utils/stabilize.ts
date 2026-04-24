import { ReactiveNode, DIRTY_STATE, shouldRecomputeDirtyConsumer, clearDirtyState, recompute, propagateOnce, activeConsumer } from "../../reactivity";
import { untracked } from "./untracked";

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
export function stabilizeConsumerKnownAlive<T>(
  node: ReactiveNode<T>,
  state: number,
): T {
  if (!shouldRecomputeDirtyConsumer(node, state)) {
    clearDirtyState(node);
    return node.payload as T;
  }

  if (recompute(node) && node.firstOut !== null) {
    propagateOnce(node);
  }

  return node.payload as T;
}

export function stabilizeConsumerUntracked<T>(
  node: ReactiveNode<T>,
  state: number,
): T {
  if ((state & DIRTY_STATE) === 0) return node.payload as T;
  if (activeConsumer === null) return stabilizeConsumerKnownAlive(node, state);
  return untracked(() => stabilizeConsumerKnownAlive(node, state));
}
