import { devAssertShouldRecomputeAlive } from "../dev";
import type { ReactiveNode } from "../shape";
import { Changed, Disposed, Invalid, Producer, Reentrant } from "../shape";
import { shouldRecomputeWalk } from "./recompute.branch";

const DEAD = Producer | Disposed;
const STALE = Invalid | Reentrant;

function dirty(node: ReactiveNode, state: number): boolean {
  if ((state & Changed) !== 0) return true;
  if ((state & STALE) === STALE) return true;

  const edge = node.firstIn;
  if (edge === null) {
    node.state = state & ~Invalid;
    return false;
  }

  return shouldRecomputeWalk(node, edge);
}

export const shouldRecomputeDirtyConsumer = dirty;
export const shouldRecomputeDirtyWatcher = dirty;

export function shouldRecompute(node: ReactiveNode): boolean {
  const state = node.state;

  if ((state & DEAD) !== 0) {
    if (__DEV__) devAssertShouldRecomputeAlive();
    return false;
  }

  return dirty(node, state);
}
