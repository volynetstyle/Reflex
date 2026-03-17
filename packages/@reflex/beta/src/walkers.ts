import {
  EngineContext,
  ReactiveNode,
  isDisposedState,
  hasState,
  ReactiveNodeState,
  isEffectKind,
  isCleanOrSignal,
  CLEANUP_STATE,
  isDirtyState,
} from "./core";
import { recompute } from "./engine/compute";

export function needsUpdate(node: ReactiveNode): boolean {
  // first reason - never compute
  if (node.v === 0) return true;

  // next reason - stale
  if (hasState(node.state, ReactiveNodeState.Obsolete)) return true;

  // but if not outdated, let's make sure it is
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (e.from.t > node.v) {
      node.state |= ReactiveNodeState.Obsolete;
      return true;
    }
  }

  // otherway - clean, full cycle
  return false;
}

export function getFirstDirtyDependency(
  node: ReactiveNode,
): ReactiveNode | undefined {
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (isDirtyState(e.from.state)) return e.from;
  }
  return undefined;
}

export function markInvalid(ctx: EngineContext, node: ReactiveNode): void {
  if (isDisposedState(node.state)) return;
  if (hasState(node.state, ReactiveNodeState.Invalid)) return;

  const stack = ctx.trawelList;
  let top = 0;

  stack[top] = node;
  ++top;

  while (top) {
    const n = stack[--top]!;

    if (isDisposedState(n.state)) continue;
    if (hasState(n.state, ReactiveNodeState.Invalid)) continue;

    n.state |= ReactiveNodeState.Invalid;
    if (isEffectKind(n.kind)) ctx.notifyEffectInvalidated(n);

    // const first = ctx.firstDirty;
    // if (!first /* || n.order < first.order */) ctx.firstDirty = n;

    for (let e = n.firstOut; e; e = e.nextOut) {
      const to = e.to;

      if (!hasState(to.state, ReactiveNodeState.Invalid)) {
        stack[top] = to;
        ++top;
      }
    }
  }
}

export function ensureFresh(ctx: EngineContext, node: ReactiveNode): void {
  if (isCleanOrSignal(node.state, node.kind) && node.v !== 0) return;

  const { worklist: stack } = ctx;
  let top = 0,
    tmp = undefined;

  const next = (n: ReactiveNode) => {
    stack[top] = n;
    ++top;
  };

  next(node);

  while (top) {
    const current = stack[--top]!;

    if (isCleanOrSignal(current.state, current.kind)) {
      continue;
    }

    if ((tmp = getFirstDirtyDependency(current))) {
      next(current);
      next(tmp);
      continue;
    }

    if (needsUpdate(current)) {
      recompute(ctx, current);
    } else {
      current.state &= CLEANUP_STATE;
    }
  }
}
