import type { ReactiveEdge } from "../ReactiveEdge";
import type ReactiveNode from "../ReactiveNode";

/** Insert `edge` into `to`'s incoming list right after `after` (or at head). */
export function attachIncomingEdgeAfter(
  to: ReactiveNode,
  edge: ReactiveEdge,
  after: ReactiveEdge | null,
): void {
  const next = after ? after.nextIn : to.firstIn;

  edge.prevIn = after;
  edge.nextIn = next;

  if (next) next.prevIn = edge;
  else to.lastIn = edge;
  if (after) {
    after.nextIn = edge;
  } else {
    to.firstIn = edge;
  }
}

export function detachIncomingEdge(to: ReactiveNode, edge: ReactiveEdge): void {
  const prev = edge.prevIn;
  const next = edge.nextIn;

  if (to.lastInTail === edge) {
    to.lastInTail = prev;
  }

  if (prev !== null) prev.nextIn = next;
  else to.firstIn = next;

  if (next !== null) next.prevIn = prev;
  else to.lastIn = prev;
}

/** Splice `edge` out of `from`'s outgoing list (does not touch the in-list). */
export function detachOutgoingEdge(
  from: ReactiveNode,
  edge: ReactiveEdge,
): void {
  const { prevOut, nextOut } = edge;

  if (prevOut) prevOut.nextOut = nextOut;
  else from.firstOut = nextOut;
  if (nextOut) nextOut.prevOut = prevOut;
  else from.lastOut = prevOut;
  edge.prevOut = null;
  edge.nextOut = null;
}

export function moveIncomingEdgeAfter(
  to: ReactiveNode,
  edge: ReactiveEdge,
  after: ReactiveEdge | null,
): void {
  if (edge === after) return;
  if (edge.prevIn === after) return;
  if (after === null && to.firstIn === edge) return;

  moveIncomingEdgeAfterUnchecked(to, edge, after);
}

export function moveIncomingEdgeAfterUnchecked(
  to: ReactiveNode,
  edge: ReactiveEdge,
  after: ReactiveEdge | null,
): void {
  const prev = edge.prevIn;
  const next = edge.nextIn;

  if (prev) prev.nextIn = next;
  else to.firstIn = next;

  if (next) next.prevIn = prev;
  else to.lastIn = prev;

  const insertNext = after ? after.nextIn : to.firstIn;

  edge.prevIn = after;
  edge.nextIn = insertNext;

  if (insertNext) insertNext.prevIn = edge;
  else to.lastIn = edge;

  if (after) after.nextIn = edge;
  else to.firstIn = edge;
}
