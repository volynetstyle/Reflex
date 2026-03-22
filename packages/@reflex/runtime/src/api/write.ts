import { ReactiveNode, ReactiveNodeState, propagate } from "../reactivity";

export function writeProducer<T>(node: ReactiveNode<T>, value: T): void {
  if (Object.is(node.pendingPayload, value)) return;

  node.pendingPayload = value;
  node.state =
    (node.state & ~ReactiveNodeState.Invalid) | ReactiveNodeState.Changed;

  const firstSubscriberEdge = node.firstOut;

  if (firstSubscriberEdge) {
    propagate(firstSubscriberEdge);
  }
}
