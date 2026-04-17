import { type ReactiveEdge } from "../shape";
import { NON_IMMEDIATE, WATCHER_MASK } from "./propagate.constants";
import {
  dispatchInvalidatedWatcher,
  invalidateSubscriber,
} from "./propagate.invalidate";

// Resume points stay edge-based: we must come back to a specific sibling link.
const propagateEdgeStack: ReactiveEdge[] = [];
const propagatePromoteStack: number[] = [];
let propagateStackHigh = 0;

function propagateBranching(
  edge: ReactiveEdge,
  promote: number,
  thrown: unknown,
  parentResume: ReactiveEdge | null,
  parentResumePromote: number,
): unknown {
  const edgeStack = propagateEdgeStack;
  const promoteStack = propagatePromoteStack;
  const stackBase = propagateStackHigh;
  let stackTop = stackBase;
  let next: ReactiveEdge | null = edge.nextOut;

  if (parentResume !== null) {
    edgeStack[stackTop] = parentResume;
    promoteStack[stackTop++] = parentResumePromote;
    propagateStackHigh = stackTop;
  }

  while (true) {
    const sub = edge.to;
    const subState = sub.state;
    const nextState = invalidateSubscriber(edge, sub, subState, promote);

    if (nextState !== 0) {
      if ((nextState & WATCHER_MASK) === 0) {
        const firstOut = sub.firstOut;

        if (firstOut !== null) {
          if (next !== null) {
            edgeStack[stackTop] = next;
            promoteStack[stackTop++] = promote;
            propagateStackHigh = stackTop;
          }

          edge = firstOut;
          next = edge.nextOut;
          promote = NON_IMMEDIATE;
          continue;
        }
      } else {
        propagateStackHigh = stackTop;
        thrown = dispatchInvalidatedWatcher(sub, thrown);
      }
    }

    if (next !== null) {
      edge = next;
      next = edge.nextOut;
      continue;
    }

    if (stackTop !== stackBase) {
      edge = edgeStack[--stackTop]!;
      promote = promoteStack[stackTop]!;
      propagateStackHigh = stackTop;
      next = edge.nextOut;
      continue;
    }

    propagateStackHigh = stackBase;
    return thrown;
  }
}

export function propagate(edge: ReactiveEdge, promote: number): unknown {
  let thrown: unknown = null;

  while (true) {
    const sub = edge.to;
    const next = edge.nextOut;
    const subState = sub.state;
    const nextState = invalidateSubscriber(edge, sub, subState, promote);

    if (nextState !== 0) {
      if ((nextState & WATCHER_MASK) === 0) {
        const firstOut = sub.firstOut;

        if (firstOut !== null) {
          edge = firstOut;

          if (next !== null) {
            return propagateBranching(
              edge,
              NON_IMMEDIATE,
              thrown,
              next,
              promote,
            );
          }

          promote = NON_IMMEDIATE;
          continue;
        }
      } else {
        thrown = dispatchInvalidatedWatcher(sub, thrown);
      }
    }

    if (next === null) return thrown;
    edge = next;
  }
}
