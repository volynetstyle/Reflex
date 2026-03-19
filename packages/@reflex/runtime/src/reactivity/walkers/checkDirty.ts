import { recompute } from "../engine/compute";
import {
  CHANGED_STATE,
  DIRTY_STATE,
  PENDING_STATE,
  ReactiveNode,
  ReactiveNodeKind,
  ReactiveNodeState,
} from "../shape";
import { shallowPropagate } from "./propagate";

const enum DirtySourceTransition {
  CompareVersion = 0,
  RefreshChanged = 1,
  RefreshPending = 2,
}

/**
 * Pull-side depth-first walk over incoming dependencies.
 * The walk refreshes only the branches that are already marked pending/changed
 * and exits early as soon as one source proves the current node stale.
 */
export function checkDirty(node: ReactiveNode): boolean {
  if (node.kind === ReactiveNodeKind.Signal) {
    return false;
  }

  const nodeVersion = node.v;
  if (nodeVersion === 0 || (node.state & CHANGED_STATE) !== 0) {
    node.state |= CHANGED_STATE;
    return true;
  }

  for (let edge = node.firstIn; edge; edge = edge.nextIn) {
    const source = edge.from;
    const sourceState = source.state;
    const sourceDirtyState = sourceState & DIRTY_STATE;
    let transition = DirtySourceTransition.CompareVersion;

    if ((sourceState & ReactiveNodeState.Computing) !== 0) {
      throw new Error("Cycle detected while refreshing reactive graph");
    }

    if (source.kind !== ReactiveNodeKind.Signal) {
      if ((sourceDirtyState & CHANGED_STATE) !== 0) {
        transition = DirtySourceTransition.RefreshChanged;
      } else if (sourceDirtyState !== 0 || source.v === 0) {
        transition = DirtySourceTransition.RefreshPending;
      }
    }

    switch (transition) {
      case DirtySourceTransition.RefreshChanged:
        if (recompute(source)) {
          shallowPropagate(source);
        }
        break;
      case DirtySourceTransition.RefreshPending:
        if (checkDirty(source)) {
          if (recompute(source)) {
            shallowPropagate(source);
          }
        } else {
          source.state &= ~DIRTY_STATE;
        }
        break;
      default:
        break;
    }

    if (source.t > nodeVersion) {
      node.state |= CHANGED_STATE;
      return true;
    }
  }

  node.state &= ~PENDING_STATE;
  return false;
}
