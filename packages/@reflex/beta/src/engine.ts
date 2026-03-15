import {
  ReactiveNode,
  ReactiveNodeState,
  EngineContext,
  CLEANUP_STATE,
} from "./core.js";
//import { OrderList } from "./order.js";
import { unlinkEdge, connect } from "./graph.js";

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

  stack[top++] = node;

  while (top) {
    const n = stack[--top]!;

    if (n.state & ReactiveNodeState.Invalid) continue;

    n.state |= ReactiveNodeState.Invalid;

    // const first = ctx.firstDirty;
    // if (!first /* || n.order < first.order */) ctx.firstDirty = n;

    for (let e = n.firstOut; e; e = e.nextOut) {
      const to = e.to;

      if (!(to.state & ReactiveNodeState.Invalid)) {
        stack[top++] = to;
      }
    }
  }
}

export function trackRead(
  ctx: EngineContext,
  source: ReactiveNode,
  //list: OrderList,
): void {
  const consumer = ctx.activeComputed!;

  for (let e = consumer.firstIn; e; e = e.nextIn) {
    if (e.from === source) {
      // Ребро вже є — видаляємо з prevEdges якщо там є (при !stable)
      if (!(consumer.state & ReactiveNodeState.Tracking))
        consumer.prevEdges!.delete(e);
      return;
    }
  }

  // Нове ребро знайдено під час compute.
  if (consumer.state & ReactiveNodeState.Tracking) {
    // Були у stable режимі — beginTracking не викликався.
    // Retroactive fill: заповнити prevEdges всіма ПОТОЧНИМИ ребрами
    // (до додавання нового). Нове ребро туди не потрапить → finishTracking
    // видалить тільки ребра що не були прочитані у цьому compute.
    consumer.prevEdges?.clear();
    for (let e = consumer.firstIn; e; e = e.nextIn) consumer.prevEdges!.add(e);
    consumer.state &= ~ReactiveNodeState.Tracking;
  }

  // Підключити нову залежність
  connect(source, consumer);
  // Нове ребро НЕ потрапляє в prevEdges → finishTracking не видалить його
}

export function beginTracking(consumer: ReactiveNode): void {
  consumer.prevEdges = new Set();
  for (let e = consumer.firstIn; e; e = e.nextIn) consumer.prevEdges.add(e);
}

export function finishTracking(consumer: ReactiveNode): void {
  if (consumer.prevEdges!.size === 0) {
    // Жодне ребро не стало stale → граф стабільний наступного разу
    consumer.state |= ReactiveNodeState.Tracking;
  } else {
    for (const stale of consumer.prevEdges!) unlinkEdge(stale);
    consumer.prevEdges!.clear();
    // stable залишається false: граф щойно змінився, наступний recompute теж з tracking
  }
}

export function needsUpdate(node: ReactiveNode): boolean {
  const computed = node.computedAt;

  if (computed === 0) return true;
  if (node.state & ReactiveNodeState.Obsolete) return true;

  for (let e = node.firstIn; e; e = e.nextIn) {
    if (e.from.changedAt > computed) {
      node.state |= ReactiveNodeState.Obsolete;
      return true;
    }
  }

  return false;
}
export function recompute(
  ctx: EngineContext,
  node: ReactiveNode,
  //list: OrderList,
): boolean {
  const compute = node.compute;
  if (!compute) return false;

  if (!(node.state & ReactiveNodeState.Tracking)) beginTracking(node);

  const prev = node.value;
  const prevActive = ctx.activeComputed;
  ctx.activeComputed = node;

  let next;
  try {
    next = compute();
  } finally {
    ctx.activeComputed = prevActive;
  }

  node.value = next;

  if (!(node.state & ReactiveNodeState.Tracking)) finishTracking(node);

  const epoch = ctx.getEpoch();

  node.computedAt = epoch;
  node.state &= CLEANUP_STATE;

  if (!Object.is(prev, next)) {
    node.changedAt = epoch;
    return true;
  }

  return false;
}

export function ensureFresh(
  ctx: EngineContext,
  node: ReactiveNode,
  //list: OrderList,
): void {
  if (!node.isDirty && node.computedAt !== 0) return;

  const stack = ctx.worklist;
  let top = 0;
  stack[top++] = node;

  while (top) {
    const n = stack[--top]!;

    if (!n.isDirty || n.isSignal) continue;

    if (n.computedAt === 0) {
      recompute(ctx, n);
      continue;
    }

    let clean = true;

    for (let e = n.firstIn; e; e = e.nextIn) {
      const src = e.from;
      if (src.isDirty) {
        stack[top++] = n;
        stack[top++] = src;
        clean = false;
        break;
      }
    }

    if (!clean) continue;

    if (needsUpdate(n)) {
      recompute(ctx, n);
    } else {
      n.state &= CLEANUP_STATE;
    }
  }
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
