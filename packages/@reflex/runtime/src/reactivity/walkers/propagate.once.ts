import { recordDebugEvent } from "../../debug/debug.runtime";
import { defaultContext } from "../context";
import { devAssertPropagateAlive } from "../dev";
import type { ReactiveNode } from "../shape";
import { DIRTY_STATE, ReactiveNodeState } from "../shape";
import { WATCHER_MASK } from "./propagate.constants";
import { dispatchInvalidatedWatcher } from "./propagate.invalidate";

export function propagateOnce(node: ReactiveNode): void {
  if ((node.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  const invalidState = ReactiveNodeState.Invalid;
  let thrown: unknown = null;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    const state = sub.state;

    if ((state & DIRTY_STATE) !== invalidState) continue;

    const nextState = state ^ DIRTY_STATE;
    sub.state = nextState;

    if (__DEV__) {
      recordDebugEvent(defaultContext, "propagate", {
        detail: { immediate: true, nextState },
        source: edge.from,
        target: sub,
      });
    }

    if ((nextState & WATCHER_MASK) === 0) continue;

    thrown = dispatchInvalidatedWatcher(sub, thrown);
  }

  if (thrown !== null) throw thrown;
}
