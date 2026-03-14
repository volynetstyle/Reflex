import {
  ReactiveNode,
  ReactiveEdge,
  ReactiveNodeState,
  EngineContext,
} from "./core.js";
import { OrderList } from "./order.js";
import { linkEdge, unlinkEdge, connect } from "./graph.js";

// ─────────────────────────────────────────────────────────────────────────────
// LAZY PULL + AUTO-TRACKING ENGINE
//
// Lifecycle вузла:
//   create     → state = Invalid|Ordered, computedAt = 0, firstIn = null
//   first read → ensureFresh → recompute (computedAt=0 → always run)
//                → compute() виконується, trackRead будує ребра
//   next read  → якщо !isDirty → return cached value
//   write sig  → bumpEpoch, markInvalid(consumers) [push]
//   read dirty → ensureFresh → pull вгору → needsUpdate → recompute якщо треба
// ─────────────────────────────────────────────────────────────────────────────

// ─── Push ─────────────────────────────────────────────────────────────────────

export function markInvalid(ctx: EngineContext, node: ReactiveNode): void {
  if (node.state & ReactiveNodeState.Invalid) return;
  node.state |= ReactiveNodeState.Invalid;
  
  if (!ctx.firstDirty || node.order < ctx.firstDirty.order) {
    ctx.firstDirty = node;
  }

  for (let e = node.firstOut; e; e = e.nextOut) {
    markInvalid(ctx, e.to);
  }
}

// ─── Auto-tracking ────────────────────────────────────────────────────────────

export function trackRead(
  ctx: EngineContext,
  source: ReactiveNode,
  list: OrderList,
): void {
  const consumer = ctx.activeComputed!;

  // Ребро вже є у поточному циклі?
  for (let e = consumer.firstIn; e; e = e.nextIn) {
    if (e.from === source) {
      consumer.prevEdges.delete(e); // ребро живе — не видаляємо
      return;
    }
  }

  // Нове ребро
  const edge = connect(source, consumer, list)!;
  consumer.prevEdges.delete(edge);
}

export function beginTracking(consumer: ReactiveNode): void {
  consumer.prevEdges.clear();
  for (let e = consumer.firstIn; e; e = e.nextIn) {
    consumer.prevEdges.add(e);
  }
}

export function finishTracking(consumer: ReactiveNode): void {
  for (const stale of consumer.prevEdges) {
    unlinkEdge(stale);
  }
  consumer.prevEdges.clear();
}

// ─── needsUpdate (pull-перевірка) ────────────────────────────────────────────

export function needsUpdate(node: ReactiveNode): boolean {
  // Ніколи не обчислювався — завжди потрібно
  if (node.computedAt === 0) return true;
  // Вже підтверджено
  if (node.state & ReactiveNodeState.Obsolete) return true;
  // Pull через in-edges
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (e.from.changedAt > node.computedAt) {
      node.state |= ReactiveNodeState.Obsolete;
      return true;
    }
  }
  return false;
}

// ─── recompute ────────────────────────────────────────────────────────────────

export function recompute(
  ctx: EngineContext,
  node: ReactiveNode,
  list: OrderList,
): boolean {
  if (!node.compute) return false;

  beginTracking(node);

  const prev = node.value;
  const prevActive = ctx.activeComputed;
  ctx.activeComputed = node;

  try {
    node.value = node.compute();
  } finally {
    ctx.activeComputed = prevActive;
  }

  finishTracking(node);

  node.computedAt = ctx.getEpoch();
  node.state &= ~(ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete);

  const changed = !Object.is(prev, node.value);
  if (changed) node.changedAt = ctx.getEpoch();

  return changed;
}

// ─── ensureFresh ──────────────────────────────────────────────────────────────
// Lazy pull entry point. Рекурсивно оновлює ланцюг знизу вгору.
// Ключовий момент: якщо джерело теж dirty — спочатку оновлюємо джерело,
// потім pull-перевіряємо поточний вузол.

export function ensureFresh(
  ctx: EngineContext,
  node: ReactiveNode,
  list: OrderList,
): void {
  if (node.isSignal) return;

  // Якщо ніколи не обчислювався — просто recompute (немає ребер ще)
  if (node.computedAt === 0) {
    recompute(ctx, node, list);
    return;
  }

  if (!node.isDirty) return;

  // Спочатку оновити всі джерела рекурсивно
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (e.from.isDirty) ensureFresh(ctx, e.from, list);
  }

  // Pull-перевірка: якщо джерела справді змінились — recompute
  if (needsUpdate(node)) {
    recompute(ctx, node, list);
  } else {
    // false positive — джерела не змінились (SAC)
    node.state &= ~(ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete);
  }
}

// ─── Execution loop (eager scan) ─────────────────────────────────────────────

export function run(ctx: EngineContext, list: OrderList): number {
  let node = ctx.firstDirty;
  let count = 0;
  while (node) {
    if (node.isDirty && needsUpdate(node)) {
      const changed = recompute(ctx, node, list);
      count++;
      if (changed) {
        for (let e = node.firstOut; e; e = e.nextOut) {
          if (!(e.to.state & ReactiveNodeState.Invalid)) {
            e.to.state |= ReactiveNodeState.Invalid;
          }
        }
      }
    } else if (node.isDirty) {
      node.state &= ~(ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete);
    }
    node = node.next;
  }
  ctx.firstDirty = null;
  return count;
}

// ─── Signal write ─────────────────────────────────────────────────────────────

export function writeSignal(
  ctx: EngineContext,
  node: ReactiveNode,
  value: unknown,
): void {
  if (Object.is(node.value, value)) return;
  node.value = value;
  node.changedAt = ctx.bumpEpoch();
  for (let e = node.firstOut; e; e = e.nextOut) {
    markInvalid(ctx, e.to);
  }
}

// ─── Batch write ──────────────────────────────────────────────────────────────

export function batchWrite(
  ctx: EngineContext,
  writes: Array<[ReactiveNode, unknown]>,
): void {
  ctx.bumpEpoch();
  for (const [node, value] of writes) {
    if (Object.is(node.value, value)) continue;
    node.value = value;
    node.changedAt = ctx.getEpoch();
    for (let e = node.firstOut; e; e = e.nextOut) {
      markInvalid(ctx, e.to);
    }
  }
}
