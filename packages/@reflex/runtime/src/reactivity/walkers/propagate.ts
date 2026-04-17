import { dispatchEffectInvalidated } from "../context";
import { devAssertPropagateAlive } from "../dev";
import { type ReactiveEdge, ReactiveNodeState } from "../shape";
import {
  NON_IMMEDIATE,
} from "./propagate.constants";
import {
  commitInvalidatedSubscriberState,
  dispatchInvalidatedWatcher,
  getInvalidatedSubscriberState,
  isWatcherInvalidatedState,
} from "./propagate.invalidate";

// Resume points stay edge-based: we must come back to a specific sibling link.
const propagateEdgeStack: ReactiveEdge[] = [];
const propagatePromoteStack: number[] = [];

function propagateBranching(
  edge: ReactiveEdge,
  promote: number,
  thrown: unknown,
  parentResume: ReactiveEdge | null,
  parentResumePromote: number,
): unknown {
  const edgeStack = propagateEdgeStack;
  const promoteStack = propagatePromoteStack;
  const stackBase = edgeStack.length;
  let stackTop = stackBase;
  let next: ReactiveEdge | null = edge.nextOut;
  const dispatch = dispatchEffectInvalidated;

  if (parentResume !== null) {
    edgeStack[stackTop] = parentResume;
    promoteStack[stackTop++] = parentResumePromote;
  }

  while (true) {
    const sub = edge.to;
    const subState = sub.state;
    const nextState = getInvalidatedSubscriberState(edge, sub, subState, promote);

    if (nextState !== 0) {
      const firstOut = commitInvalidatedSubscriberState(
        edge,
        sub,
        nextState,
        promote,
      );

      if (firstOut !== null) {
        if (next !== null) {
          edgeStack[stackTop] = next;
          promoteStack[stackTop++] = promote;
        }

        edge = firstOut;
        next = edge.nextOut;
        promote = NON_IMMEDIATE;
        continue;
      }

      if (isWatcherInvalidatedState(nextState)) {
        thrown = dispatchInvalidatedWatcher(sub, dispatch, thrown);
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
      next = edge.nextOut;
      continue;
    }

    edgeStack.length = stackBase;
    promoteStack.length = stackBase;
    return thrown;
  }
}

function propagateLinear(
  edge: ReactiveEdge,
  promote: number,
): unknown {
  let thrown: unknown = null;
  const dispatch = dispatchEffectInvalidated;

  while (true) {
    const sub = edge.to;
    const next = edge.nextOut;
    const subState = sub.state;
    const nextState = getInvalidatedSubscriberState(edge, sub, subState, promote);

    if (nextState !== 0) {
      const firstOut = commitInvalidatedSubscriberState(
        edge,
        sub,
        nextState,
        promote,
      );

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

      if (isWatcherInvalidatedState(nextState)) {
        thrown = dispatchInvalidatedWatcher(sub, dispatch, thrown);
      }
    }

    if (next === null) return thrown;
    edge = next;
  }
}

export function propagate(
  startEdge: ReactiveEdge,
  promoteImmediate: number = NON_IMMEDIATE,
) {
  const root = startEdge.from;

  if ((root.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  const thrown = propagateLinear(startEdge, promoteImmediate);

  return thrown;
}
