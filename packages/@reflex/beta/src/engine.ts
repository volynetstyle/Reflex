import {
  ReactiveNode,
  ReactiveEdge,
  ReactiveNodeState,
  EngineContext,
  CLEANUP_STATE,
  hasState,
  isDirtyState,
  isDisposedState,
  isEffectKind,
  isSignalKind,
  isTrackingState,
} from "./core.js";
//import { OrderList } from "./order.js";
import { unlinkAllSources, unlinkFromSource } from "./graph.js";

// ─────────────────────────────────────────────────────────────────────────────
// trackingStable: пропускаємо Set ops коли граф стабільний.
//
// Ключовий інсайт для коректності при conditional branches:
// Якщо під час compute(stable=true) trackRead знаходить НОВЕ ребро →
// beginTracking не був викликаний → треба retroactively заповнити prevEdges.
// Це "lazy beginTracking": відбувається тільки якщо граф справді змінився.
//
// Амортизовано: у стабільному графі (99% випадків) — нуль Set ops.
// При branch switch — один retroactive fill + звичайний finishTracking.
// ─────────────────────────────────────────────────────────────────────────────

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

export function needsUpdate(node: ReactiveNode): boolean {
  if (node.v === 0) return true;
  if (hasState(node.state, ReactiveNodeState.Obsolete)) return true;

  for (let e = node.firstIn; e; e = e.nextIn) {
    if (e.from.t > node.v) {
      node.state |= ReactiveNodeState.Obsolete;
      return true;
    }
  }

  return false;
}

function invokeCompute(
  ctx: EngineContext,
  node: ReactiveNode,
  compute: () => unknown,
): unknown {
  const prevActive = ctx.activeComputed;

  ctx.activeComputed = node;
  try {
    return compute();
  } finally {
    ctx.activeComputed = prevActive;
  }
}

function cleanupStaleSources(node: ReactiveNode): void {
  const epoch = node.s;
  let hasStale = false;
  let prevIn: ReactiveEdge | null = null;
  let e = node.firstIn;

  while (e) {
    const next = e.nextIn;

    if (e.s !== epoch) {
      if (prevIn) prevIn.nextIn = next;
      else node.firstIn = next;

      unlinkFromSource(e);
      hasStale = true;
    } else {
      prevIn = e;
    }

    e = next;
  }

  if (!hasStale) {
    node.state |= ReactiveNodeState.Tracking;
  }
}

function commitComputedValue(
  ctx: EngineContext,
  node: ReactiveNode,
  prevValue: unknown,
  newValue: unknown,
): boolean {
  node.value = newValue;
  node.v = ctx.getEpoch();
  node.state &= CLEANUP_STATE;

  const changed = !Object.is(prevValue, newValue);

  if (changed) {
    node.t = node.v;
  }

  return changed;
}

export function recompute(ctx: EngineContext, node: ReactiveNode): boolean {
  const compute = node.compute;
  if (!compute) return false;

  const stable = isTrackingState(node.state);
  ++node.s;

  const prevValue = node.value;
  const newValue = invokeCompute(ctx, node, compute);

  if (!stable || !isTrackingState(node.state)) {
    cleanupStaleSources(node);
  }

  return commitComputedValue(ctx, node, prevValue, newValue);
}

export function runEffect(ctx: EngineContext, node: ReactiveNode): void {
  const compute = node.compute;
  if (!compute || isDisposedState(node.state)) return;

  const prevCleanup = node.cleanup;
  node.cleanup = null;

  prevCleanup?.();

  const stable = isTrackingState(node.state);
  ++node.s;

  const result = invokeCompute(ctx, node, compute);

  if (!stable || !isTrackingState(node.state)) {
    cleanupStaleSources(node);
  }

  node.v = ctx.getEpoch();
  node.state &= CLEANUP_STATE;

  if (typeof result === "function") {
    node.cleanup = result as () => void;
  }
}

export function disposeEffect(node: ReactiveNode): void {
  if (isDisposedState(node.state)) return;

  node.state |= ReactiveNodeState.Disposed;

  const cleanup = node.cleanup;
  node.cleanup = null;
  cleanup?.();

  unlinkAllSources(node);
}

export function ensureFresh(ctx: EngineContext, node: ReactiveNode): void {
  if (!isDirtyState(node.state) && node.v !== 0) return;

  const { worklist: stack } = ctx;
  let top = 0;
  stack[top] = node;
  ++top;

  while (top > 0) {
    const current = stack[--top]!;

    if (!isDirtyState(current.state) || isSignalKind(current.kind)) continue;

    if (current.v === 0) {
      recompute(ctx, current);
      continue;
    }

    const needsDependencyResolution = hasDirtyDependency(current);

    if (needsDependencyResolution) {
      stack[top] = current;
      ++top;
      stack[top] = getFirstDirtyDependency(current)!;
      ++top;

      continue;
    }

    if (needsUpdate(current)) {
      recompute(ctx, current);
    } else {
      current.state &= CLEANUP_STATE;
    }
  }
}

// Допоміжні функції
function hasDirtyDependency(node: ReactiveNode): boolean {
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (isDirtyState(e.from.state)) return true;
  }
  return false;
}

function getFirstDirtyDependency(node: ReactiveNode): ReactiveNode | undefined {
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (isDirtyState(e.from.state)) return e.from;
  }
  return undefined;
}

// export function run(ctx: EngineContext, list: OrderList): number {
//   let node = ctx.firstDirty;
//   let count = 0;
//   while (node) {
//     if (node.isDirty) {
//       if (needsUpdate(node)) {
//         const changed = recompute(ctx, node, list);
//         count++;
//         if (changed) {
//           for (let e = node.firstOut; e; e = e.nextOut) {
//             if (!(e.to.state & ReactiveNodeState.Invalid))
//               e.to.state |= ReactiveNodeState.Invalid;
//           }
//         }
//       } else node.state &= CLEANUP_STATE;
//     }
//     node = node.next;
//   }
//   ctx.firstDirty = null;
//   return count;
// }

export function writeSignal(
  ctx: EngineContext,
  node: ReactiveNode,
  value: unknown,
): void {
  if (Object.is(node.value, value)) return;
  node.value = value;
  node.t = ctx.bumpEpoch();
  for (let e = node.firstOut; e; e = e.nextOut) markInvalid(ctx, e.to);
}

export function batchWrite(
  ctx: EngineContext,
  writes: Array<[ReactiveNode, unknown]>,
): void {
  ctx.bumpEpoch();
  for (const [node, value] of writes) {
    if (Object.is(node.value, value)) continue;
    node.value = value;
    node.t = ctx.getEpoch();
    for (let e = node.firstOut; e; e = e.nextOut) markInvalid(ctx, e.to);
  }
}
