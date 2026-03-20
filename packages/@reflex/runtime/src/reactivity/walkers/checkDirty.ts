import { recompute } from "../engine/compute";
import {
  CHANGED_STATE,
  DIRTY_STATE,
  MAYBE_CHANGE_STATE,
  getNodeContext,
  ReactiveNode,
  ReactiveNodeKind,
  ReactiveNodeState,
} from "../shape";
import { shallowPropagate } from "./propagate";

function updateDirtySource(node: ReactiveNode): boolean {
  if (node.kind === ReactiveNodeKind.Signal) {
    const changed = !Object.is(node.payload, node.pendingPayload);
    node.payload = node.pendingPayload;
    node.state &= ~DIRTY_STATE;
    return changed;
  }

  return recompute(node);
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

  const ctx = getNodeContext(node);
  const nodeStack = ctx.trawelList;
  const edgeStack = ctx.edgeStack;
  const baseStackSize = nodeStack.length;

  nodeStack[baseStackSize] = node;
  edgeStack[baseStackSize] = node.firstIn;

  let stackSize = baseStackSize + 1;

  while (stackSize > baseStackSize) {
    const frameIndex = stackSize - 1;
    const current = nodeStack[frameIndex]!;
    let edge = edgeStack[frameIndex];

    if ((current.state & CHANGED_STATE) !== 0) {
      --stackSize;

      if (stackSize === baseStackSize) {
        return true;
      }

      const parentIndex = stackSize - 1;
      if (updateDirtySource(current)) {
        const firstSubscriberEdge = current.firstOut;
        if (firstSubscriberEdge?.nextOut) {
          shallowPropagate(current);
        }

        nodeStack[parentIndex]!.state |= CHANGED_STATE;
        edgeStack[parentIndex] = null;
      } else {
        current.state &= ~DIRTY_STATE;
      }

      continue;
    }

    if (edge == null) {
      current.state &= ~MAYBE_CHANGE_STATE;
      --stackSize;

      if (stackSize === baseStackSize) {
        return false;
      }

      continue;
    }

    edgeStack[frameIndex] = edge.nextIn;

    const source = edge.from;
    const sourceState = source.state;

    if ((sourceState & ReactiveNodeState.Computing) !== 0) {
      throw new Error("Cycle detected while refreshing reactive graph");
    }

    const sourceDirtyState = sourceState & DIRTY_STATE;
    if (sourceDirtyState === 0) {
      continue;
    }

    if ((sourceDirtyState & CHANGED_STATE) !== 0) {
      if (updateDirtySource(source)) {
        const firstSubscriberEdge = source.firstOut;
        if (firstSubscriberEdge?.nextOut) {
          shallowPropagate(source);
        }

        current.state |= CHANGED_STATE;
        edgeStack[frameIndex] = null;
      } else {
        source.state &= ~DIRTY_STATE;
      }

      continue;
    }

    if (source.kind !== ReactiveNodeKind.Signal) {
      nodeStack[stackSize] = source;
      edgeStack[stackSize] = source.firstIn;
      ++stackSize;
    }
  }

  return false;
}
