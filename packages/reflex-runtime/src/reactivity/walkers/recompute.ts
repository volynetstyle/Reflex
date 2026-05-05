import { devAssertShouldRecomputeAlive } from "../dev";
import type { ReactiveNode } from "../shape";
import { Changed, Invalid, Producer, Reentrant } from "../shape";
import { BAIL, DIRTY, walkBranch, walkLine } from "./recompute.branch";

const DEAD = Producer;
const STALE = Invalid | Reentrant;

function dirty(node: ReactiveNode, state: number): boolean {
  if ((state & Changed) !== 0) return true;
  if ((state & STALE) === STALE) return true;

  const edge = node.firstIn;
  if (edge === null) {
    node.state = state & ~Invalid;
    return false;
  }

  if (edge.nextIn === null) {
    const dirty = walkLine(node, edge);
    if (dirty !== BAIL) return dirty === DIRTY;
  }

  return walkBranch(node, edge);
}

export function shouldRecompute(node: ReactiveNode): boolean {
  const state = node.state;

  if ((state & DEAD) !== 0) {
    if (__DEV__) devAssertShouldRecomputeAlive();
    return false;
  }

  return dirty(node, state);
}

export {
  dirty as shouldRecomputeDirtyConsumer,
  dirty as shouldRecomputeDirtyWatcher,
};
