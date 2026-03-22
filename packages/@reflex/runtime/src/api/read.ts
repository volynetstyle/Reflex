import {
  ReactiveNode,
  ReactiveNodeState,
  changePayload,
  trackRead,
  DIRTY_STATE,
  shouldRecompute,
  recompute,
  propagateOnce,
  clearDirtyState,
  PRODUCER_CHANGED,
} from "../reactivity";

export function readProducer<T>(node: ReactiveNode<T>): T {
  if ((node.state & PRODUCER_CHANGED)) {
    changePayload(node);
  }

  trackRead(node);
  return node.payload as T;
}

export function readConsumer<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if (__DEV__ && (state & ReactiveNodeState.Computing)) {
    throw new Error("Cycle detected while refreshing reactive graph");
  }

  if ((state & DIRTY_STATE) === 0) {
    trackRead(node);
    return node.payload as T;
  }

  const needs =
    (state & ReactiveNodeState.Changed) ||
    shouldRecompute(node);

  if (needs) {
    if (recompute(node)) propagateOnce(node);
  } else {
    clearDirtyState(node);
  }

  trackRead(node);
  return node.payload as T;
}