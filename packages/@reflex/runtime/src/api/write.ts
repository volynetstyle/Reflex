import { compare } from "./compare";
import type { ReactiveNode} from "../reactivity";
import { DIRTY_STATE, propagate } from "../reactivity";
import runtime from "../reactivity/context";

export function writeProducer<T>(node: ReactiveNode<T>, value: T): void {
  if (compare(node.payload, value)) return;

  node.payload = value;
  node.state &= ~DIRTY_STATE;

  const firstSubscriberEdge = node.firstOut;

  if (firstSubscriberEdge === null) return;

  runtime.enterPropagation();

  try {
    propagate(firstSubscriberEdge, true);
  } finally {
    runtime.leavePropagation();
  }
}
