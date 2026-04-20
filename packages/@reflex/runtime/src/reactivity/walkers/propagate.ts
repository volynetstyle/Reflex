import { type ReactiveEdge } from "../shape";
import {
  NON_IMMEDIATE,
  WATCHER_MASK,
} from "./propagate.constants";
import {
  dispatchInvalidatedWatcher,
  invalidateSubscriber,
} from "./propagate.invalidate";

// Resume points stay edge-based: we must come back to a specific sibling link.
const resumeEdgeStack: ReactiveEdge[] = [];
let resumeStackHigh = 0;

// Promote is step-local:
// - it applies only to the current invalidate step
// - every descendant descent resets to NON_IMMEDIATE
// - exactly one deferred sibling lane may restore the direct-wave promote
// - restore happens only through directResumeIndex during unwind
function propagateBranchingWave(
  currentEdge: ReactiveEdge,
  currentPromote: number,
  firstThrownError: unknown,
  deferredSiblingEdge: ReactiveEdge | null,
  deferredSiblingPromote: number,
): unknown {
  const edgeStack = resumeEdgeStack;
  const stackBase = resumeStackHigh;
  const directSiblingPromote = deferredSiblingPromote;
  let stackTop = stackBase;
  let nextSiblingEdge: ReactiveEdge | null = currentEdge.nextOut;
  // Only one resumed sibling lane can carry the direct-wave promote; every
  // deeper descent resets to NON_IMMEDIATE until that lane is restored.
  let directSiblingResumeIndex = -1;

  if (deferredSiblingEdge !== null) {
    edgeStack[stackTop] = deferredSiblingEdge;
    if (deferredSiblingPromote !== NON_IMMEDIATE) {
      directSiblingResumeIndex = stackTop;
    }
    stackTop += 1;
  }

  while (true) {
    const subscriber = currentEdge.to;
    const subscriberState = subscriber.state;
    const nextSubscriberState = invalidateSubscriber(
      currentEdge,
      subscriber,
      subscriberState,
      currentPromote,
    );

    if (nextSubscriberState !== 0) {
      if ((nextSubscriberState & WATCHER_MASK) === 0) {
        const firstChildEdge = subscriber.firstOut;

        if (firstChildEdge !== null) {
          if (nextSiblingEdge !== null) {
            edgeStack[stackTop] = nextSiblingEdge;
            if (currentPromote !== NON_IMMEDIATE) {
              directSiblingResumeIndex = stackTop;
            }
            stackTop += 1;
          }

          currentEdge = firstChildEdge;
          nextSiblingEdge = currentEdge.nextOut;
          currentPromote = NON_IMMEDIATE;
          continue;
        }
      } else {
        // Watcher dispatch may re-enter propagation, so publish the current
        // stack height immediately before crossing that external boundary.
        resumeStackHigh = stackTop;
        firstThrownError = dispatchInvalidatedWatcher(
          subscriber,
          firstThrownError,
        );
      }
    }

    if (nextSiblingEdge !== null) {
      currentEdge = nextSiblingEdge;
      nextSiblingEdge = currentEdge.nextOut;
      continue;
    }

    if (stackTop !== stackBase) {
      const resumeIndex = --stackTop;
      currentEdge = edgeStack[resumeIndex]!;
      if (resumeIndex === directSiblingResumeIndex) {
        directSiblingResumeIndex = -1;
        currentPromote = directSiblingPromote;
      } else {
        currentPromote = NON_IMMEDIATE;
      }
      nextSiblingEdge = currentEdge.nextOut;
      continue;
    }

    resumeStackHigh = stackBase;
    return firstThrownError;
  }
}

export function propagate(
  startEdge: ReactiveEdge,
  startPromote: number,
): unknown {
  let firstThrownError: unknown = null;

  while (true) {
    const subscriber = startEdge.to;
    const nextSiblingEdge = startEdge.nextOut;
    const subscriberState = subscriber.state;
    const nextSubscriberState = invalidateSubscriber(
      startEdge,
      subscriber,
      subscriberState,
      startPromote,
    );

    if (nextSubscriberState !== 0) {
      if ((nextSubscriberState & WATCHER_MASK) === 0) {
        const firstChildEdge = subscriber.firstOut;

        if (firstChildEdge !== null) {
          startEdge = firstChildEdge;

          if (nextSiblingEdge !== null) {
            return propagateBranchingWave(
              startEdge,
              NON_IMMEDIATE,
              firstThrownError,
              nextSiblingEdge,
              startPromote,
            );
          }

          startPromote = NON_IMMEDIATE;
          continue;
        }
      } else {
        firstThrownError = dispatchInvalidatedWatcher(
          subscriber,
          firstThrownError,
        );
      }
    }

    if (nextSiblingEdge === null) return firstThrownError;
    startEdge = nextSiblingEdge;
  }
}
