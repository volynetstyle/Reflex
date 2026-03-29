import type { ReactiveNode } from "../reactivity";
import type { ExecutionContext } from "../reactivity/context";
import {
  ReactiveNodeState,
  trackRead,
  DIRTY_STATE,
  shouldRecompute,
  recompute,
  propagateOnce,
  clearDirtyState,
} from "../reactivity";
import { recordDebugEvent } from "../debug";
import { getDefaultContext } from "../reactivity/context";

export enum ConsumerReadMode {
  lazy = 1 << 0,
  eager = 1 << 1,
}

export function readProducer<T>(
  node: ReactiveNode<T>,
  context: ExecutionContext = getDefaultContext(),
): T {
  trackRead(node, context);

  if (__DEV__) {
    recordDebugEvent(context, "read:producer", {
      consumer: context.activeComputed ?? undefined,
      node,
      detail: {
        value: node.payload,
      },
    });
  }

  return node.payload as T;
}

function stabilizeConsumer<T>(
  node: ReactiveNode<T>,
  context: ExecutionContext,
): T {
  const state = node.state;

  if (__DEV__ && state & ReactiveNodeState.Computing) {
    throw new Error("Cycle detected while refreshing reactive graph");
  }

  if ((state & DIRTY_STATE) !== 0) {
    const needs =
      (state & ReactiveNodeState.Changed) !== 0 || shouldRecompute(node);

    if (needs) {
      if (recompute(node, context)) propagateOnce(node, context);
    } else {
      clearDirtyState(node);
    }
  }

  return node.payload as T;
}

export function readConsumer<T>(
  node: ReactiveNode<T>,
  mode: ConsumerReadMode = ConsumerReadMode.lazy,
  context: ExecutionContext = getDefaultContext(),
): T {
  if (mode === ConsumerReadMode.eager) {
    const value = untracked(() => stabilizeConsumer(node, context), context);

    if (__DEV__) {
      recordDebugEvent(context, "read:consumer", {
        node,
        detail: {
          mode: "eager",
          value,
        },
      });
    }

    return value;
  }

  const value = stabilizeConsumer(node, context);
  trackRead(node, context);

  if (__DEV__) {
    recordDebugEvent(context, "read:consumer", {
      consumer: context.activeComputed ?? undefined,
      node,
      detail: {
        mode: "lazy",
        value,
      },
    });
  }

  return value;
}

export function untracked<T>(
  fn: () => T,
  context: ExecutionContext = getDefaultContext(),
): T {
  const prev = context.activeComputed;
  context.activeComputed = null;

  try {
    return fn();
  } finally {
    context.activeComputed = prev;
  }
}
