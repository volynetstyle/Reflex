import { establish_dependencies_add } from "../reactivity/shape/methods/connect";
import ReactiveNode from "../reactivity/shape/ReactiveNode";
import { isDirtyState } from "../reactivity/shape/ReactiveMeta";
import { pullAndRecompute } from "../reactivity/walkers/pullAndRecompute";

export function readProducer<T>(node: ReactiveNode<T>): T {
  establish_dependencies_add(node);
  return node.payload;
}

export function readConsumer<T>(node: ReactiveNode<T>): T {
  establish_dependencies_add(node);

  if (isDirtyState(node.state) || node.v === 0) {
    pullAndRecompute(node);
  }

  return node.payload;
}
