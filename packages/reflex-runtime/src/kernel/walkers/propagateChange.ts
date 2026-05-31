import { defaultContext, emitSinkInvalidated } from "../context";
import { devRecordPropagate } from "../dev";
import {
  Changed,
  Invalid,
  Visited,
  Computing,
  Watcher,
  type ReactiveEdge,
  type ReactiveNode,
} from "../shape";

import {
  getPropagateStackBase,
  pushPropagateStack,
  readPropagateStack,
  readPropagateStackStats as readPropagateStackStatsFromStorage,
  restorePropagateStackBase,
  setPropagateStackHigh,
} from "./propagationStack";

// 
function invalidateSlow(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  state: number,
  changed: boolean,
): number {
  // Slow path matters only while the consumer is currently recomputing.
  // Outside recompute, this edge does not need tracking-tail validation here.
  if ((state & Computing) === 0) {
    return 0;
  }

  // During recompute, tailIn is the current boundary of the confirmed
  // incoming dependency prefix.
  const tail = sub.tailIn;

  // If there is no tracking cursor, no old dependency edge is confirmed.
  if (tail === null) {
    return 0;
  }

  // If walking backwards from `edge` reaches `tail`, then `edge` is after
  // the confirmed prefix. It belongs to the unconfirmed suffix and may be
  // removed/reused by dynamic dependency reconciliation, so skip it.
  if (edge !== tail) {
    for (let prev = edge.prevIn; prev !== null; prev = prev.prevIn) {
      if (prev === tail) {
        return 0;
      }
    }
  }

  // `edge` is either exactly at the cursor or before it, meaning it belongs
  // to the confirmed part of the current dependency list. A write through it
  // can invalidate the currently computing consumer.
  const next = state | Visited | Invalid;
  sub.state = next;

  if (__DEV__) {
    devRecordPropagate(edge, next, changed, defaultContext);
  }

  return next;
}

const PROPAGATE_BLOCK_MASK = Changed | Invalid | Computing;

// 
function markChanged(edge: ReactiveEdge): number {
  const sub = edge.to;
  const state = sub.state;

  if ((state & PROPAGATE_BLOCK_MASK) === 0) {
    const next = (state & ~Visited) | Changed;
    sub.state = next;

    if (__DEV__) {
      devRecordPropagate(edge, next, true, defaultContext);
    }

    return next;
  }

  return invalidateSlow(edge, sub, state, true);
}

// 
function markInvalid(edge: ReactiveEdge): number {
  const sub = edge.to;
  const state = sub.state;

  if ((state & PROPAGATE_BLOCK_MASK) === 0) {
    const next = (state & ~Visited) | Invalid;
    sub.state = next;

    if (__DEV__) {
      devRecordPropagate(edge, next, false, defaultContext);
    }

    return next;
  }

  return invalidateSlow(edge, sub, state, false);
}

// 
export function propagateOnceChanged(
  startEdge: ReactiveEdge,
  top: number = getPropagateStackBase(),
): ReactiveEdge | null {
  let pendingChild: ReactiveEdge | null = null;

  for (
    let edge: ReactiveEdge | null = startEdge;
    edge !== null;
    edge = edge.nextOut
  ) {
    const next = markChanged(edge);

    if (next === 0) {
      continue;
    }

    const sub = edge.to;

    if ((next & Watcher) !== 0) {
       setPropagateStackHigh(top);
       emitSinkInvalidated(sub);
      continue;
    }

    const child = sub.firstOut;

    if (child === null) {
      continue;
    }

    if (pendingChild !== null) {
      top =  pushPropagateStack(pendingChild, top);
    }

    pendingChild = child;
  }

   setPropagateStackHigh(top);
  return pendingChild;
}

// 
// 
export function propagateInvalid(
  edge: ReactiveEdge,
  top: number = getPropagateStackBase(),
  base: number = top,
): void {
  let nextEdge: ReactiveEdge | null = edge.nextOut;

  while (true) {
    const next = markInvalid(edge);

    if (next !== 0) {
      const sub = edge.to;

      if ((next & Watcher) !== 0) {
         setPropagateStackHigh(top);
         emitSinkInvalidated(sub);
      } else {
        const child = sub.firstOut;

        if (child !== null) {
          if (nextEdge !== null) {
            top =  pushPropagateStack(nextEdge, top);
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
       restorePropagateStackBase(base);
      return;
    }

    edge =  readPropagateStack(--top);
    nextEdge = edge.nextOut;
  }
}

export function propagateChanged(startEdge: ReactiveEdge): void {
  const base =  getPropagateStackBase();
  const pendingInvalid =  propagateOnceChanged(startEdge, base);

  if (pendingInvalid === null) {
     restorePropagateStackBase(base);
    return;
  }

   propagateInvalid(
    pendingInvalid,
    getPropagateStackBase(),
    base,
  );
}

export const propagate = propagateChanged;

export function readPropagateStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readPropagateStackStatsFromStorage();
}
