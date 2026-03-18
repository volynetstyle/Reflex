import { recompute } from "../engine/compute";
import {
  ReactiveNode,
  clearDirtyState,
  getNodeContext,
  hasState,
  isComputingState,
  isDirtyState,
  isSignalKind,
  ReactiveNodeState,
} from "../shape";

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

function needsUpdateFromSourceT(
  node: ReactiveNode,
  maxSourceEpoch: number,
): boolean {
  if (node.v === 0) return true;

  if (hasState(node.state, ReactiveNodeState.Obsolete)) return true;

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

export function ensureFresh(node: ReactiveNode): void {
  const ctx = getNodeContext(node);

  if (!isDirtyState(node.state) && !isSignalKind(node)) return;
  if (isSignalKind(node)) return;

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

    for (let e = current.firstIn; e; e = e.nextIn) {
      const source = e.from;

      if (isComputingState(source.state)) {
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
      recompute(current);
    } else {
      clearDirtyState(current);
    }

    if (__DEV__) {
      assertFreshNode(current);
    }
  }
}

export function pullAndRecompute(node: ReactiveNode): void {
  ensureFresh(node);
}
