import {
  ReactiveNode,
  ReactiveNodeState,
  trackRead,
  DIRTY_STATE,
  shouldRecompute,
  recompute,
  propagateOnce,
  clearDirtyState,
  UNINITIALIZED,
} from "../reactivity";
import runtime from "../reactivity/context";

export function readProducer<T>(node: ReactiveNode<T>): T {
  trackRead(node);
  return node.payload as T;
}

export function readConsumer<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if (__DEV__ && state & ReactiveNodeState.Computing) {
    throw new Error("Cycle detected while refreshing reactive graph");
  }

  if ((state & DIRTY_STATE) === 0) {
    trackRead(node);
    return node.payload as T;
  }

  // if clean - even dont need request for recomputation
  const needs = state & ReactiveNodeState.Changed || shouldRecompute(node);

  if (needs) {
    if (recompute(node)) propagateOnce(node);
  } else {
    clearDirtyState(node);
  }

  trackRead(node);
  return node.payload as T;
}

export function runAndReadConsumer<T>(node: ReactiveNode<T>): T {
  if (node.payload === UNINITIALIZED) {
    trackRead(node);
    return node.payload;
  }

  return readConsumer(node);
}

export function untracked<T>(fn: () => T): T {
  const prev = runtime.activeComputed;
  runtime.activeComputed = null;

  try {
    return fn();
  } finally {
    runtime.activeComputed = prev;
  }
}
