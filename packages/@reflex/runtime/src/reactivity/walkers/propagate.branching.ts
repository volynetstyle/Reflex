import { recordDebugEvent } from "../../debug";
import type { ExecutionContext } from "../context";
import { DIRTY_STATE, type ReactiveEdge, ReactiveNodeState } from "../shape";
import {
  DISPOSED_MASK,
  IMMEDIATE,
  NON_IMMEDIATE,
  SLOW_INVALIDATION_MASK,
  TRACKING_MASK,
  VISITED_MASK,
  WATCHER_MASK,
} from "./propagate.constants";

const propagateEdgeStack: ReactiveEdge[] = [];
const propagatePromoteStack: Uint32Array = new Uint32Array(512);

export function propagateBranching(
  edge: ReactiveEdge,
  resume: ReactiveEdge | null,
  resumePromote: number,
  thrown: unknown,
  context: ExecutionContext,
  dispatch: ExecutionContext["effectInvalidatedDispatch"],
): unknown {
  const edgeStack = propagateEdgeStack;
  const promoteStack = propagatePromoteStack;
  const stackBase = edgeStack.length;
  let stackTop = stackBase;
  let promoteBit = NON_IMMEDIATE;

  if (resume !== null) {
    edgeStack[stackTop] = resume;
    promoteStack[stackTop++] = resumePromote;
  }

  resume = edge.nextOut;
  resumePromote = promoteBit;

  try {
    while (true) {
      const sub = edge.to;
      const state = sub.state;

      let nextState: number;

      if ((state & SLOW_INVALIDATION_MASK) === 0) {
        nextState = (state & ~VISITED_MASK) | promoteBit;
      } else if ((state & DISPOSED_MASK) !== 0) {
        nextState = 0;
      } else if ((state & TRACKING_MASK) !== 0) {
        const depsTail = sub.depsTail;

        if (depsTail === null) {
          nextState = 0;
        } else if (edge === depsTail) {
          nextState = state | VISITED_MASK | ReactiveNodeState.Invalid;
        } else {
          let cursor = edge.prevIn;

          while (cursor !== null && cursor !== depsTail) {
            cursor = cursor.prevIn;
          }

          nextState =
            cursor === depsTail
              ? 0
              : state | VISITED_MASK | ReactiveNodeState.Invalid;
        }
      } else if ((state & DIRTY_STATE) !== 0) {
        nextState = 0;
      } else {
        nextState = (state & ~VISITED_MASK) | promoteBit;
      }

      if (nextState !== 0) {
        sub.state = nextState;

        if (__DEV__) {
          recordDebugEvent(context, "propagate", {
            detail: { immediate: promoteBit === IMMEDIATE, nextState },
            source: edge.from,
            target: sub,
          });
        }

        if ((nextState & WATCHER_MASK) === 0) {
          const firstOut = sub.firstOut;

          if (firstOut !== null) {
            if (resume !== null) {
              edgeStack[stackTop] = resume;
              promoteStack[stackTop++] = resumePromote;
            }

            edge = firstOut;
            promoteBit = NON_IMMEDIATE;
            resume = firstOut.nextOut;
            resumePromote = promoteBit;
            continue;
          }
        } else {
          if (__DEV__) {
            recordDebugEvent(context, "watcher:invalidated", { node: sub });
          }

          if (dispatch !== undefined) {
            try {
              dispatch(sub);
            } catch (error) {
              if (thrown === null) {
                thrown = error;
              }
            }
          }
        }
      }

      if (resume !== null) {
        edge = resume;
        promoteBit = resumePromote;
      } else if (stackTop > stackBase) {
        edge = edgeStack[--stackTop]!;
        promoteBit = promoteStack[stackTop]!;
      } else {
        return thrown;
      }

      resume = edge.nextOut;
      resumePromote = promoteBit;
    }
  } finally {
    edgeStack.length = stackBase;
  }
}
