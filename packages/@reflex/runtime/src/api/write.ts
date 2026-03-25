import { compare } from "./compare";
import { DIRTY_STATE, ReactiveNode, propagate } from "../reactivity";

export function writeProducer<T>(node: ReactiveNode<T>, value: T): void {
  if (compare(node.payload, value)) return;

  node.payload = value;
  node.state &= ~DIRTY_STATE;

  const firstSubscriberEdge = node.firstOut;

  if (firstSubscriberEdge === null) return;

  propagate(firstSubscriberEdge, true);
}
