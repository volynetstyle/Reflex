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
  const incoming = node.incoming;

  for (let i = 0; i < incoming.length; ++i) {
    const edge = incoming[i]!;
    if (edge.from.t > maxSourceEpoch) {
      maxSourceEpoch = edge.from.t;
    }

    console.assert(
      edge.from.t <= node.v,
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
    const current = stack[--top]!;

    if (isDisposedState(current.state)) continue;
    if (hasState(current.state, ReactiveNodeState.Invalid)) continue;

    current.state |= ReactiveNodeState.Invalid;
    if (isEffectKind(current)) ctx.notifyEffectInvalidated(current);

    // const first = ctx.firstDirty;
    // if (!first /* || current.order < first.order */) ctx.firstDirty = current;

    const outgoing = current.outgoing;
    for (let i = 0; i < outgoing.length; ++i) {
      const edge = outgoing[i]!;
      const to = edge.to;

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
  if (node.v === 0) return true;
  if (hasState(node.state, ReactiveNodeState.Obsolete)) return true;

  if (maxSourceEpoch < 0) {
    const incoming = node.incoming;
    for (let i = 0; i < incoming.length; ++i) {
      const edge = incoming[i]!;
      if (edge.from.t > node.v) {
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

  const next = (current: ReactiveNode) => {
    if (current.w === workEpoch) return;
    current.w = workEpoch;
    stack[top] = current;
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
    const incoming = current.incoming;

    for (let i = 0; i < incoming.length; ++i) {
      const edge = incoming[i]!;
      const source = edge.from;

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
