import {
  ReactiveNode,
  ReactiveNodeKind,
  CHANGED_STATE,
  changePayload,
  trackRead,
  DIRTY_STATE,
  ReactiveNodeState,
  shouldRecompute,
  recompute,
  propagateOnce,
  clearDirtyState,
} from "../reactivity";

export function readProducer<T>(node: ReactiveNode<T>): T {
  if (
    node.kind === ReactiveNodeKind.Signal &&
    (node.state & CHANGED_STATE) !== 0
  ) {
    changePayload(node);
  }

  trackRead(node);
  return node.payload as T;
}

export function readConsumer<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if (state & DIRTY_STATE) {
    if (__DEV__) {
      if ((state & ReactiveNodeState.Computing) !== 0) {
        throw new Error("Cycle detected while refreshing reactive graph");
      }
    }

    let changed = shouldRecompute(node);

    if (state & CHANGED_STATE || changed) {
      changed = recompute(node);

      if (changed) {
        propagateOnce(node);
      }
    } else {
      clearDirtyState(node);
    }
  }

  trackRead(node);
  return node.payload as T;
}
