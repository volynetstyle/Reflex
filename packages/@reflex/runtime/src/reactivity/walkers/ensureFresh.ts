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

export function ensureFresh(node: ReactiveNode): void {
  if (isSignalKind(node) || !isDirtyState(node.state)) return;

  if ((isChangedState(node.state) || checkDirty(node)) && recompute(node))
    shallowPropagate(node);
  else clearDirtyState(node);
}
