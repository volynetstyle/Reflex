import {
  ReactiveNode,
  ReactiveNodeState,
  trackRead,
  DIRTY_STATE,
  shouldRecompute,
  recompute,
  propagateOnce,
  clearDirtyState,
} from "../reactivity";
import runtime from "../reactivity/context";

export  enum ConsumerReadMode {
  lazy = 1 << 0,
  eager = 1 << 1,
}

export function readProducer<T>(node: ReactiveNode<T>): T {
  trackRead(node);
  return node.payload as T;
}

function stabilizeConsumer<T>(node: ReactiveNode<T>): T {
  const state = node.state;

  if (__DEV__ && state & ReactiveNodeState.Computing) {
    throw new Error("Cycle detected while refreshing reactive graph");
  }

  if ((state & DIRTY_STATE) !== 0) {
    const needs =
      (state & ReactiveNodeState.Changed) !== 0 || shouldRecompute(node);

    if (needs) {
      if (recompute(node)) propagateOnce(node);
    } else {
      clearDirtyState(node);
    }
  }

  return node.payload as T;
}

export function readConsumer<T>(
  node: ReactiveNode<T>,
  mode: ConsumerReadMode = ConsumerReadMode.lazy,
): T {
  if (mode === ConsumerReadMode.eager) {
    return untracked(() => stabilizeConsumer(node));
  }

  const value = stabilizeConsumer(node);
  trackRead(node);
  return value;
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
