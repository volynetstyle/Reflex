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
  if (after) after.nextIn = edge;
  else to.firstIn = edge;
}

/** Splice `edge` out of `to`'s incoming list (does not touch the out-list). */
export function detachIncomingEdge(
  to: ReactiveNode,
  edge: ReactiveEdge,
): void {
  const { prevIn, nextIn } = edge;

  if (prevIn) prevIn.nextIn = nextIn;
  else to.firstIn = nextIn;
  if (nextIn) nextIn.prevIn = prevIn;
  else to.lastIn = prevIn;
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
  --from.outDegree;
}

export function moveIncomingEdgeAfter(
  edge: ReactiveEdge,
  to: ReactiveNode,
  after: ReactiveEdge | null,
): void {
  if (edge.prevIn === after) return;
  if (after === null && to.firstIn === edge) return;

  detachIncomingEdge(to, edge);
  attachIncomingEdgeAfter(to, edge, after);
}
