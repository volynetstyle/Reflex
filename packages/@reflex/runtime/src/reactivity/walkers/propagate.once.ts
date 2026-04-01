// ─── propagateOnce ────────────────────────────────────────────────────────────
//
// Shallow one-level promotion: Invalid → Changed for direct subscribers.
// Called from pull-phase when a computed node's value changed and it has fanout.
// No stack needed — single level only.

import type { ExecutionContext } from "../context";
import { getDefaultContext } from "../context";
import { devAssertPropagateAlive } from "../dev";
import type { ReactiveNode } from "../shape";
import { ReactiveNodeState, DIRTY_STATE } from "../shape";
import { IMMEDIATE } from "./propagate.constants";
import {
  recordPropagation,
  notifyWatcherInvalidation,
} from "./propagation.watchers";

export function propagateOnce(
  node: ReactiveNode,
  context: ExecutionContext = getDefaultContext(),
): void {
  if ((node.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  let thrown: unknown = null;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    const state = sub.state;

    if ((state & DIRTY_STATE) !== ReactiveNodeState.Invalid) continue;

    const nextState =
      (state & ~ReactiveNodeState.Invalid) | ReactiveNodeState.Changed;
    sub.state = nextState;

    if (__DEV__) recordPropagation(edge, nextState, IMMEDIATE, context);

    if ((nextState & ReactiveNodeState.Watcher) !== 0) {
      thrown = notifyWatcherInvalidation(sub, thrown, context);
    }
  }

  if (thrown !== null) throw thrown;
}
