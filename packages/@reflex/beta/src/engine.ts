import {
  ReactiveNode,
  ReactiveNodeState,
  EngineContext,
  CLEANUP_STATE,
} from "./core.js";
//import { OrderList } from "./order.js";
import { beginTracking, finishTracking } from "./tracking.js";

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
  if (node.state & ReactiveNodeState.Invalid) return;

  const stack = ctx.trawelList;
  let top = 0;

  stack[top] = node;
  ++top;

  while (top) {
    const n = stack[--top]!;

    if (n.state & ReactiveNodeState.Invalid) continue;

    n.state |= ReactiveNodeState.Invalid;
    if (n.isEffect) ctx.notifyEffectInvalidated(n);

    // const first = ctx.firstDirty;
    // if (!first /* || n.order < first.order */) ctx.firstDirty = n;

    for (let e = n.firstOut; e; e = e.nextOut) {
      const to = e.to;

      if (!(to.state & ReactiveNodeState.Invalid)) {
        stack[top] = to;
        ++top;
      }
    }
  }
}

function isNeverComputed(node: ReactiveNode): boolean {
  return node.computedAt === 0;
}

function isKnownObsolete(node: ReactiveNode): boolean {
  return !!(node.state & ReactiveNodeState.Obsolete);
}

function hasStaleParent(node: ReactiveNode): boolean {
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (e.from.changedAt > node.computedAt) {
      node.state |= ReactiveNodeState.Obsolete;
      return true;
    }
  }
  return false;
}

export function needsUpdate(node: ReactiveNode): boolean {
  return isNeverComputed(node) || isKnownObsolete(node) || hasStaleParent(node);
}

export function recompute(ctx: EngineContext, node: ReactiveNode): boolean {
  const compute = node.compute;
  if (!compute) return false;

  const stable = !!(node.state & ReactiveNodeState.Tracking);
  beginTracking(node);

  const prevValue = node.value;
  const prevActive = ctx.activeComputed;

  ctx.activeComputed = node;
  let newValue: unknown;

  try {
    newValue = compute();
  } finally {
    ctx.activeComputed = prevActive;
  }

  node.value = newValue;
  node.computedAt = ctx.getEpoch();
  node.state &= CLEANUP_STATE;

  if (!stable || !(node.state & ReactiveNodeState.Tracking)) finishTracking(node);

  const changed = !Object.is(prevValue, newValue);
  if (changed) {
    node.changedAt = node.computedAt; // той самий epoch
  }

  return changed;
}

export function ensureFresh(ctx: EngineContext, node: ReactiveNode): void {
  if (!node.isDirty && !isNeverComputed(node)) return;

  const { worklist: stack } = ctx;
  let top = 0;
  stack[top] = node;
  ++top;

  while (top > 0) {
    const current = stack[--top]!;

    if (!current.isDirty || current.isSignal) continue;

    if (isNeverComputed(current)) {
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
    if (e.from.isDirty) return true;
  }
  return false;
}

function getFirstDirtyDependency(node: ReactiveNode): ReactiveNode | undefined {
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (e.from.isDirty) return e.from;
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
  node.changedAt = ctx.bumpEpoch();
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
    node.changedAt = ctx.getEpoch();
    for (let e = node.firstOut; e; e = e.nextOut) markInvalid(ctx, e.to);
  }
}
