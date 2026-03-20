import ReactiveNode from "../reactivity/shape/ReactiveNode";
import {
  clearDirtyState,
  isChangedState,
  isComputingState,
  isDirtyState,
  isSignalKind,
} from "../reactivity/shape/ReactiveMeta";
import { trackRead } from "../reactivity/tracking";
import { shallowPropagate } from "../reactivity/walkers/propagate";
import { ensureFresh } from "../reactivity/walkers/ensureFresh";

function settleProducer<T>(node: ReactiveNode<T>): void {
  if (!isSignalKind(node) || !isChangedState(node.state)) {
    return;
  }

  const changed = !Object.is(node.payload, node.pendingPayload);
  node.payload = node.pendingPayload;
  clearDirtyState(node);

  if (changed) {
    shallowPropagate(node);
  }
}

export function readProducer<T>(node: ReactiveNode<T>): T {
  settleProducer(node);
  trackRead(node);
  return node.payload as T;
}

export function readConsumer<T>(node: ReactiveNode<T>): T {
  if (isComputingState(node.state)) {
    throw new Error("Cycle detected while refreshing reactive graph");
  }

  if (isDirtyState(node.state)) {
    ensureFresh(node);
  }

  return readProducer(node);
}
