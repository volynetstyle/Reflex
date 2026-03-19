import ReactiveNode from "../reactivity/shape/ReactiveNode";
import { propagate } from "../reactivity/walkers/propagate";
import { getNodeContext } from "../reactivity/shape/ReactiveMeta";

export function writeProducer<T>(node: ReactiveNode<T>, value: T): void {
  if (Object.is(node.payload, value)) return;

  applyProducerWrite(node, value, getNodeContext(node).bumpEpoch());
}

export function applyProducerWrite<T>(
  node: ReactiveNode<T>,
  value: T,
  epoch: number,
): void {
  if (Object.is(node.payload, value)) return;

  node.payload = value;
  node.t = epoch;

  for (let e = node.firstOut; e; e = e.nextOut) {
    propagate(e);
  }
}
