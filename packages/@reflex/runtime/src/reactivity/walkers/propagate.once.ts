import { recordDebugEvent } from "../../debug";
import { defaultContext } from "../context";
import { devAssertPropagateAlive } from "../dev";
import type { ReactiveNode } from "../shape";
import { DIRTY_STATE, ReactiveNodeState } from "../shape";
import { WATCHER_MASK } from "./propagate.constants";

export function propagateOnce(node: ReactiveNode): void {
  if ((node.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  let thrown: unknown = null;
  const context = defaultContext;
  const dispatch = context.effectInvalidatedDispatch;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    const state = sub.state;

    if ((state & DIRTY_STATE) !== ReactiveNodeState.Invalid) continue;

    const nextState =
      (state & ~ReactiveNodeState.Invalid) | ReactiveNodeState.Changed;
    sub.state = nextState;

    if (__DEV__) {
      recordDebugEvent(context, "propagate", {
        detail: { immediate: true, nextState },
        source: edge.from,
        target: sub,
      });
    }

    if ((nextState & WATCHER_MASK) === 0) continue;

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

  if (thrown !== null) throw thrown;
}
