import {
  ReactiveNode,
  isDisposedNode,
  trackRead,
  defaultContext,
} from "../reactivity";
import {
  devAssertReadDeadProducer,
  devRecordReadProducer,
} from "../reactivity/dev";

/**
 * Read the value of a producer (source) node.
 * 
 * A producer is a mutable source of data (e.g., a signal). Calling this function:
 * 
 * 1. Returns the current payload value
 * 2. If called during active computation, registers a dependency relationship
 *    so the consumer will be notified if this producer changes
 * 3. Does NOT perform any recomputation (producers hold mutable state directly)
 * @template T - The type of value stored in the producer node
 * @param {ReactiveNode<T>} node - The producer node to read from
 * @returns {T} The current payload of the producer
 * @example const signal = createProducer(42)
const value = readProducer(signal)  // 42

const computed = createConsumer(() => {
  const val = readProducer(signal)  // Registers dependency
  return val * 2
})
 * @invariant Always returns node.payload (no computation needed)
 * @invariant If called during compute, creates edge from producer to active consumer
 * @cost O(1) for value access + O(k) for dependency tracking (k = cursor distance)
 */
export function readProducer<T>(node: ReactiveNode<T>): T {
  const value = node.payload;

  if (isDisposedNode(node)) {
    if (__DEV__) {
      devAssertReadDeadProducer();
    }

    return value;
  }

  // Register this read as a dependency if there's an active computation
  trackRead(node);

  if (__DEV__) {
    devRecordReadProducer(node, node.payload, defaultContext);
  }

  return value;
}
