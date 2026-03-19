import { recompute } from "../engine/compute";
import {
  ReactiveNode,
  clearDirtyState,
  isChangedState,
  isDirtyState,
  isSignalKind,
} from "../shape";
import { checkDirty } from "./checkDirty";
import { shallowPropagate } from "./propagate";

function refreshNode(node: ReactiveNode): void {
  const changed = recompute(node);
  if (changed) {
    shallowPropagate(node);
  }
}

export function ensureFresh(node: ReactiveNode): void {
  if (isSignalKind(node)) return;
  if (!isDirtyState(node.state)) return;

  if (isChangedState(node.state) || checkDirty(node)) {
    refreshNode(node);
    return;
  }

  clearDirtyState(node);
}
