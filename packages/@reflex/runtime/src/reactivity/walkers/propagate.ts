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

function pushResumeEdge(
  stack: ReactiveEdge[],
  stackTop: number,
  edge: ReactiveEdge,
  promote: number,
): { nextTop: number; promotedIndex: number } {
  stack[stackTop] = edge;
  const promotedIndex = promote !== NON_IMMEDIATE ? stackTop : -1;
  const nextTop = stackTop + 1;
  noteResumeEdgeStackUsage(nextTop);
  return { nextTop, promotedIndex };
}

function propagateBranchingWave(
  currentEdge: ReactiveEdge,
  currentPromote: number,
  deferredSiblingEdge: ReactiveEdge | null,
  deferredSiblingPromote: number,
): void {
  const edgeStack = resumeEdgeStack;
  const stackBase = resumeStackHigh;
  const directSiblingPromote = deferredSiblingPromote;

  let stackTop = stackBase;
  let nextSiblingEdge: ReactiveEdge | null = currentEdge.nextOut;
  let directSiblingResumeIndex = -1;

  if (deferredSiblingEdge !== null) {
    const pushed = pushResumeEdge(
      edgeStack,
      stackTop,
      deferredSiblingEdge,
      deferredSiblingPromote,
    );
    stackTop = pushed.nextTop;
    directSiblingResumeIndex = pushed.promotedIndex;
  }

  while (true) {
    const subscriber = currentEdge.to;
    const nextSubscriberState = invalidateSubscriber(
      currentEdge,
      subscriber,
      subscriber.state,
      currentPromote,
    );

    if (nextSubscriberState === 0) {
    } // no-op, fall through to sibling/unwind
    else if ((nextSubscriberState & WATCHER_MASK) !== 0) {
      resumeStackHigh = stackTop;
      dispatchInvalidatedWatcher(subscriber);
    } else {
      const firstChildEdge = subscriber.firstOut;
      if (firstChildEdge !== null) {
        if (nextSiblingEdge !== null) {
          const pushed = pushResumeEdge(
            edgeStack,
            stackTop,
            nextSiblingEdge,
            currentPromote,
          );
          stackTop = pushed.nextTop;
          if (pushed.promotedIndex !== -1) {
            directSiblingResumeIndex = pushed.promotedIndex;
          }
        }

        currentEdge = firstChildEdge;
        nextSiblingEdge = currentEdge.nextOut;
        currentPromote = NON_IMMEDIATE;
        continue;
      }
    }

    if (nextSiblingEdge !== null) {
      currentEdge = nextSiblingEdge;
      nextSiblingEdge = currentEdge.nextOut;
      continue;
    }

    if (stackTop === stackBase) {
      restoreResumeStackBase(stackBase);
      return;
    }

    const resumeIndex = --stackTop;
    currentEdge = edgeStack[resumeIndex]!;
    currentPromote =
      resumeIndex === directSiblingResumeIndex
        ? ((directSiblingResumeIndex = -1), directSiblingPromote)
        : NON_IMMEDIATE;
    nextSiblingEdge = currentEdge.nextOut;
  }
}

export function propagate(
  startEdge: ReactiveEdge,
  startPromote: number,
): void {

  while (true) {
    const subscriber = startEdge.to;
    const nextSiblingEdge = startEdge.nextOut;
    const nextSubscriberState = invalidateSubscriber(
      startEdge,
      subscriber,
      subscriber.state,
      startPromote,
    );

    if (nextSubscriberState === 0) {
    } // fall through
    else if ((nextSubscriberState & WATCHER_MASK) !== 0) {
      dispatchInvalidatedWatcher(subscriber);
    } else {
      const firstChildEdge = subscriber.firstOut;
      if (firstChildEdge !== null) {
        startEdge = firstChildEdge;

        if (nextSiblingEdge !== null) {
          propagateBranchingWave(
            startEdge,
            NON_IMMEDIATE,
            nextSiblingEdge,
            startPromote,
          );
          return;
        }

        startPromote = NON_IMMEDIATE;
        continue;
      }
    }

    if (nextSiblingEdge === null) {
      return;
    }

    startEdge = nextSiblingEdge;
  }
}
