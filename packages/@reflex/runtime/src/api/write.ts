import {
  ReactiveNode,
  MAYBE_CHANGE_STATE,
  CHANGED_STATE,
  propagate,
} from "../reactivity";

export function writeProducer<T>(node: ReactiveNode<T>, value: T): void {
  if (Object.is(node.pendingPayload, value)) return;

  node.pendingPayload = value;
  node.state = (node.state & ~MAYBE_CHANGE_STATE) | CHANGED_STATE;

  const firstSubscriberEdge = node.firstOut;

  if (firstSubscriberEdge) {
    propagate(firstSubscriberEdge);
  }
}
