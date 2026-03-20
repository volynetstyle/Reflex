import ReactiveNode from "../reactivity/shape/ReactiveNode";
import {
  CHANGED_STATE,
  DIRTY_STATE,
  ReactiveNodeKind,
  ReactiveNodeState,
  clearDirtyState,
} from "../reactivity/shape/ReactiveMeta";
import { recompute } from "../reactivity/engine/compute";
import { updateSignal } from "../reactivity/engine/updateSignal";
import { propagateOnce } from "../reactivity/walkers/propagate";
import { trackRead } from "../reactivity/tracking";
import { shouldRecompute } from "../reactivity/walkers/shouldRecompute";

export function readProducer<T>(node: ReactiveNode<T>): T {
  if (
    node.kind === ReactiveNodeKind.Signal &&
    (node.state & CHANGED_STATE) !== 0
  ) {
    updateSignal(node);
  }

  trackRead(node);
  return node.payload as T;
}

export function readConsumer<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if (state & DIRTY_STATE) {
    if ((state & ReactiveNodeState.Computing) !== 0) {
      throw new Error("Cycle detected while refreshing reactive graph");
    }

    const changed = shouldRecompute(node);

    if (state & CHANGED_STATE || changed) {
      if (recompute(node)) {
        propagateOnce(node);
      }
    } else {
      clearDirtyState(node);
    }
  }

  trackRead(node);
  return node.payload as T;
}
