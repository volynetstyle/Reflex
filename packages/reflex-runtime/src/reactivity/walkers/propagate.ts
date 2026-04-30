import { Invalid, Watcher, type ReactiveEdge } from "../shape";
import { notifyWatcher, invalidateSub } from "./propagate.invalidate";
import {
  noteResumeEdgeStackUsage,
  readRuntimeWalkerStackStats,
  trimWalkerStackIfSparse,
} from "./stack.stats";

const resumeEdgeStack: ReactiveEdge[] = [];
let resumeStackHigh = 0;


export function propagate(
  startEdge: ReactiveEdge,
  startPromote: number,
): void {
  const stack = resumeEdgeStack;
  const base = resumeStackHigh;
  let top = base;

  for (
    let edge: ReactiveEdge | null = startEdge;
    edge !== null;
    edge = edge.nextOut
  ) {
    const sub = edge.to;
    const next = invalidateSub(
      edge,
      sub,
      sub.state,
      startPromote,
    );

    if (next === 0) {
      continue;
    }

    if ((next & Watcher) !== 0) {
      resumeStackHigh = top;
      notifyWatcher(sub);
      continue;
    }

    const child = sub.firstOut;
    if (child !== null) {
      stack[top++] = child;
      if (__DEV__) noteResumeEdgeStackUsage(top);
    }
  }

  if (top === base) {
    return;
  }

  while (top !== base) {
    let edge = stack[--top]!;
    let nextEdge: ReactiveEdge | null = edge.nextOut;

    while (true) {
      const sub = edge.to;
      const next = invalidateSub(edge, sub, sub.state, Invalid);

      if (next !== 0) {
        if ((next & Watcher) !== 0) {
          resumeStackHigh = top;
          notifyWatcher(sub);
        } else {
          const child = sub.firstOut;

          if (child !== null) {
            if (nextEdge !== null) {
              stack[top++] = nextEdge;
              if (__DEV__) noteResumeEdgeStackUsage(top);
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

  restoreResumeStackBase(base);
}

function restoreResumeStackBase(stackBase: number): void {
  resumeStackHigh = stackBase;
  trimWalkerStackIfSparse(resumeEdgeStack, stackBase);
}

export function readPropagateStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(
    0,
    0,
    resumeStackHigh,
    resumeEdgeStack.length,
  );
}