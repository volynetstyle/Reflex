import ReactiveNode from "../reactivity/shape/ReactiveNode";
import {
  isComputingState,
  isDirtyState,
} from "../reactivity/shape/ReactiveMeta";
import { trackRead } from "../reactivity/tracking";
import { ensureFresh } from "../reactivity/walkers/ensureFresh";

export function readProducer<T>(node: ReactiveNode<T>): T {
  trackRead(node);
  return node.payload as T;
}

export function readConsumer<T>(node: ReactiveNode<T>): T {
  if (isComputingState(node.state)) {
    throw new Error("Cycle detected while refreshing reactive graph");
  }

  if (isDirtyState(node.state) || node.v === 0) {
    ensureFresh(node);
  }

  return readProducer(node);
}
