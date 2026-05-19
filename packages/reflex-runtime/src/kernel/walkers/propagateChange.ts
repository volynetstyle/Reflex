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
