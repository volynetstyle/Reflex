import { type ReactiveEdge } from "../shape";
import { NON_IMMEDIATE, WATCHER_MASK } from "./propagate.constants";
import {
  dispatchInvalidatedWatcher,
  invalidateSubscriber,
} from "./propagate.invalidate";
import {
  noteResumeEdgeStackUsage,
  readRuntimeWalkerStackStats,
  trimWalkerStackIfSparse,
} from "./stack.stats";

const resumeEdgeStack: ReactiveEdge[] = [];
let resumeStackHigh = 0;

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

export function propagate(
  startEdge: ReactiveEdge,
  startPromote: number,
): void {
  const edgeStack = resumeEdgeStack;
  const stackBase = resumeStackHigh;
  let stackTop = stackBase;

  for (
    let edge: ReactiveEdge | null = startEdge;
    edge !== null;
    edge = edge.nextOut
  ) {
    const subscriber = edge.to;
    const nextSubscriberState = invalidateSubscriber(
      edge,
      subscriber,
      subscriber.state,
      startPromote,
    );

    if (nextSubscriberState === 0) {
      continue;
    }

    if ((nextSubscriberState & WATCHER_MASK) !== 0) {
      resumeStackHigh = stackTop;
      dispatchInvalidatedWatcher(subscriber);
      continue;
    }

    const firstChildEdge = subscriber.firstOut;
    if (firstChildEdge !== null) {
      edgeStack[stackTop++] = firstChildEdge;
      if (__DEV__) noteResumeEdgeStackUsage(stackTop);
    }
  }

  if (stackTop === stackBase) {
    return;
  }

  while (stackTop !== stackBase) {
    let currentEdge = edgeStack[--stackTop]!;
    let nextSiblingEdge: ReactiveEdge | null = currentEdge.nextOut;

    while (true) {
      const subscriber = currentEdge.to;
      const nextSubscriberState = invalidateSubscriber(
        currentEdge,
        subscriber,
        subscriber.state,
        NON_IMMEDIATE,
      );

      if (nextSubscriberState === 0) {
      } else if ((nextSubscriberState & WATCHER_MASK) !== 0) {
        resumeStackHigh = stackTop;
        dispatchInvalidatedWatcher(subscriber);
      } else {
        const firstChildEdge = subscriber.firstOut;

        if (firstChildEdge !== null) {
          if (nextSiblingEdge !== null) {
            edgeStack[stackTop++] = nextSiblingEdge;
            if (__DEV__) noteResumeEdgeStackUsage(stackTop);
          }

          currentEdge = firstChildEdge;
          nextSiblingEdge = currentEdge.nextOut;
          continue;
        }
      }

      if (nextSiblingEdge !== null) {
        currentEdge = nextSiblingEdge;
        nextSiblingEdge = currentEdge.nextOut;
        continue;
      }

      break;
    }
  }

  restoreResumeStackBase(stackBase);
}
