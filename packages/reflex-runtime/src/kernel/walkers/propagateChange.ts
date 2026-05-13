import { Invalid, Watcher, type ReactiveEdge } from "../shape";
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
 * Push invalidation from `startEdge` through outgoing subscriber edges.
 *
 * Depth-zero subscribers receive `startPromote` (usually `Changed`), while
 * descendants are marked `Invalid`. Watchers are terminal: they are notified
 * but propagation does not descend through them.
 */
export function propagate(startEdge: ReactiveEdge | null, startPromote: number): void {
  const base = getPropagateStackBase();
  let top = base;

  if (startEdge !== null && startEdge.nextOut === null) {
    const sub = startEdge.to;
    const next = invalidateSub(startEdge, sub, sub.state, startPromote);

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

    let edge = child;
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
        restorePropagateStackBase(base);
        return;
      }

      edge = readPropagateStack(--top);
      nextEdge = edge.nextOut;
    }
  }

  for (
    let edge: ReactiveEdge | null = startEdge;
    edge !== null;
    edge = edge.nextOut
  ) {
    const sub = edge.to;
    const next = invalidateSub(edge, sub, sub.state, startPromote);

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

  while (top !== base) {
    let edge = readPropagateStack(--top);
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

      break;
    }
  }

  restorePropagateStackBase(base);
}

export function readPropagateStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readPropagateStackStatsFromStorage();
}
