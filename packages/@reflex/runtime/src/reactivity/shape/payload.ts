import { ReactiveNode } from ".";
import { CyclicRing32 } from "../../execution/execution.version";

/**
 * @invariant
 * Node.version may mutate only through changePayload.
 * This local alias ensures no external module increments versions directly.
 */
const next_version = CyclicRing32.inc;

/**
 * @invariant
 * A payload mutation implies a strictly monotonic version increment
 * (mod 2^32, half-range ordered).
 *
 * @precondition
 * Must be called only if payload_old !== payload_new.
 *
 * No duplicate detection is performed here.
 *
 * @param node ReactiveNode to mutate
 * @param next New payload value
 *
 * @effect
 * - node.version := next(node.version)
 * - node.payload := next
 * - node.runtime := valid
 */
export function changePayload<T>(node: ReactiveNode<T>, next: T) {
  const currentV = node.v;

  node.payload = next;
  node.v = next_version(currentV);
}
