import { ReactiveNode, clearDirtyState } from "../shape";
import { shallowPropagate } from "../walkers/propagate";

export function updateSignal<T>(node: ReactiveNode<T>): boolean {
  const changed = !Object.is(node.payload, node.pendingPayload);
  node.payload = node.pendingPayload;
  clearDirtyState(node);

  if (changed) {
    shallowPropagate(node);
  }

  return changed;
}
