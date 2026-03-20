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

    if ((sourceState & ReactiveNodeState.Computing) !== 0) {
      throw new Error("Cycle detected while refreshing reactive graph");
    }

    if (source.kind === ReactiveNodeKind.Signal) {
      if (source.t > nodeVersion) {
        node.state |= CHANGED_STATE;
        return true;
      }

      continue;
    }

    const sourceDirtyState = sourceState & DIRTY_STATE;

    if ((sourceDirtyState & CHANGED_STATE) !== 0) {
      if (recompute(source)) {
        shallowPropagate(source);
      }
    } else if (sourceDirtyState !== 0 || source.v === 0) {
      if (checkDirty(source) && recompute(source)) {
        shallowPropagate(source);
      } else {
        source.state &= ~DIRTY_STATE;
      }
    }

    if (source.t > nodeVersion) {
      node.state |= CHANGED_STATE;
      return true;
    }
  }

  node.state &= ~PENDING_STATE;
  return false;
}
