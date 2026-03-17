import {
  EngineContext,
  ReactiveNode,
  isDisposedState,
  hasState,
  ReactiveNodeState,
  isEffectKind,
  clearDirtyState,
  isComputingState,
  isDirtyState,
  isSignalKind,
} from "./core";
import { recompute } from "./engine/compute";

function assertFreshNode(node: ReactiveNode): void {
  if (isSignalKind(node)) return;

  let maxSourceEpoch = 0;
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (e.from.t > maxSourceEpoch) {
      maxSourceEpoch = e.from.t;
    }

    console.assert(
      e.from.t <= node.v,
      "stale node detected: dependency newer than node validation epoch",
    );
  }

  console.assert(
    node.v >= maxSourceEpoch,
    "freshness invariant violated: node.v must cover all dependency epochs",
  );
  console.assert(
    !isDirtyState(node.state),
    "recompute invariant violated: fresh node must not stay dirty",
  );
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
    if (isEffectKind(n)) ctx.notifyEffectInvalidated(n);

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

export function needsUpdate(node: ReactiveNode): boolean {
  return needsUpdateFromSourceT(node, -1);
}

function needsUpdateFromSourceT(
  node: ReactiveNode,
  maxSourceEpoch: number,
): boolean {
  // first reason - never compute
  if (node.v === 0) return true;

  // next reason - stale
  if (hasState(node.state, ReactiveNodeState.Obsolete)) return true;

  // but if not outdated, let's make sure it is
  if (maxSourceEpoch < 0) {
    for (let e = node.firstIn; e; e = e.nextIn) {
      if (e.from.t > node.v) {
        node.state |= ReactiveNodeState.Obsolete;
        return true;
      }
    }

    return false;
  }

  if (maxSourceEpoch > node.v) {
    node.state |= ReactiveNodeState.Obsolete;
    return true;
  }

  return false;
}

export function ensureFresh(ctx: EngineContext, node: ReactiveNode): void {
  if (!isDirtyState(node.state) && isSignalKind(node) && node.v !== 0) return;

  const { worklist: stack } = ctx;
  let top = 0;
  const workEpoch = ++ctx.workEpoch;

  const next = (n: ReactiveNode) => {
    if (n.w === workEpoch) return;
    n.w = workEpoch;
    stack[top] = n;
    ++top;
  };

  next(node);

  while (top) {
    const current = stack[--top]!;
    current.w = -workEpoch;

    if (!isDirtyState(current.state)) {
      if (__DEV__) {
        assertFreshNode(current);
      }
      continue;
    }

    let maxSourceEpoch = 0;
    let blockedByDirtySource: ReactiveNode | null = null;
    
    for (let e = current.firstIn; e; e = e.nextIn) {
      const source = e.from;

      if (__DEV__ && isComputingState(source.state)) {
        throw new Error("Cycle detected while refreshing reactive graph");
      }

      if (isDirtyState(source.state)) {
        blockedByDirtySource = source;
        break;
      }

      if (source.t > maxSourceEpoch) {
        maxSourceEpoch = source.t;
      }
    }

    if (blockedByDirtySource) {
      next(current);
      next(blockedByDirtySource);
      continue;
    }

    if (needsUpdateFromSourceT(current, maxSourceEpoch)) {
      recompute(ctx, current);
    } else {
      clearDirtyState(current);
    }

    if (__DEV__) {
      assertFreshNode(current);
    }
  }
}
