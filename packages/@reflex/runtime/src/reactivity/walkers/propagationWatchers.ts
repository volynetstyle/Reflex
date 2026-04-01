import { recordDebugEvent } from "../../debug";
import type { ExecutionContext } from "../context";
import type { ReactiveEdge, ReactiveNode } from "../shape";

// ─── recordPropagation ────────────────────────────────────────────────────────
//
// __DEV__ guard moved to call sites so the function is never called in prod.
// This eliminates the call overhead + the internal `if (!__DEV__) return` check
// from the tight propagation loop.
export function recordPropagation(
  edge: ReactiveEdge,
  nextState: number,
  promote: number,
  context: ExecutionContext,
): void {
  recordDebugEvent(context, "propagate", {
    detail: { immediate: promote !== 0, nextState },
    source: edge.from,
    target: edge.to,
  });
}

// ─── notifyWatcherInvalidation ────────────────────────────────────────────────
// Unchanged: error collection pattern must stay as-is.
export function notifyWatcherInvalidation(
  node: ReactiveNode,
  thrown: unknown,
  context: ExecutionContext,
): unknown {
  if (__DEV__) {
    recordDebugEvent(context, "watcher:invalidated", { node });
  }

  const onEffectInvalidated = context.onEffectInvalidatedHook;
  if (onEffectInvalidated === undefined) return thrown;

  try {
    onEffectInvalidated(node);
  } catch (error) {
    return thrown ?? error;
  }

  return thrown;
}
