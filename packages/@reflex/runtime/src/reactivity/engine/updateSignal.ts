import { ReactiveNode, clearDirtyState } from "../shape";
import { propagateOnce } from "../walkers/propagate";

export function updateSignal<T>(node: ReactiveNode<T>): boolean {
  const changed = !Object.is(node.payload, node.pendingPayload);
  node.payload = node.pendingPayload;
  clearDirtyState(node);

  if (changed) {
    propagateOnce(node);
  }

  return changed;
}
