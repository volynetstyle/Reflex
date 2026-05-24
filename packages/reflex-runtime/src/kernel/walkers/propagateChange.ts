import { Changed, Invalid, Watcher, type ReactiveEdge } from "../shape";
import { notifyWatcher, invalidateSub } from "./invalidateBranch";
import {
  getPropagateStackBase,
  pushPropagateStack,
  readPropagateStack,
  readPropagateStackStats as readPropagateStackStatsFromStorage,
  restorePropagateStackBase,
  setPropagateStackHigh,
} from "./propagationStack";

/**
 * Drains Invalid propagation from an edge list.
 *
 * Contract:
 * - `edge` is already selected as the current edge.
 * - `top` is the current stack top.
 * - if caller popped `edge` from stack, it must pass the decremented `top`.
 *
 * This preserves the original DFS + sibling-stack traversal order.
 */
// @__INLINE__
function drainInvalidPropagation(
  edge: ReactiveEdge,
  top: number,
  base: number,
): number {
  let nextEdge: ReactiveEdge | null = edge.nextOut;

  while (true) {
    const sub = edge.to;
    const next = invalidateSub(edge, sub, sub.state, Invalid);

    if (next !== 0) {
      if ((next & Watcher) !== 0) {
        setPropagateStackHigh(top);
        notifyWatcher(sub);
      } else {
        const child = sub.firstOut;

        if (child !== null) {
          if (nextEdge !== null) {
            top = pushPropagateStack(nextEdge, top);
          }

          edge = child;
          nextEdge = edge.nextOut;
          continue;
        }
      }
    }

    if (nextEdge !== null) {
      edge = nextEdge;
      nextEdge = edge.nextOut;
      continue;
    }

    if (top === base) {
      return top;
    }

    edge = readPropagateStack(--top);
    nextEdge = edge.nextOut;
  }
}

/**
 * API write-path specialization.
 *
 * `writeProducer()` already filters null fanout and always promotes direct
 * subscribers to Changed, so this entry skips those generic dispatch branches.
 */
export function propagateChanged(startEdge: ReactiveEdge): void {
  const base = getPropagateStackBase();
  let top = base;

  if (startEdge.nextOut === null) {
    const sub = startEdge.to;
    const next = invalidateSub(startEdge, sub, sub.state, Changed);

    if (next === 0) {
      return;
    }

    if ((next & Watcher) !== 0) {
      setPropagateStackHigh(top);
      notifyWatcher(sub);
      return;
    }

    const child = sub.firstOut;

    if (child === null) {
      return;
    }

    drainInvalidPropagation(child, top, base);
    restorePropagateStackBase(base);
    return;
  }

  for (
    let edge: ReactiveEdge | null = startEdge;
    edge !== null;
    edge = edge.nextOut
  ) {
    const sub = edge.to;
    const next = invalidateSub(edge, sub, sub.state, Changed);

    if (next === 0) {
      continue;
    }

    if ((next & Watcher) !== 0) {
      setPropagateStackHigh(top);
      notifyWatcher(sub);
      continue;
    }

    const child = sub.firstOut;

    if (child !== null) {
      top = pushPropagateStack(child, top);
    }
  }

  if (top === base) {
    return;
  }

  const edge = readPropagateStack(--top);
  drainInvalidPropagation(edge, top, base);
  restorePropagateStackBase(base);
}

export function propagate(startEdge: ReactiveEdge, _promote: typeof Changed): void {
  propagateChanged(startEdge);
}

export function readPropagateStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readPropagateStackStatsFromStorage();
}