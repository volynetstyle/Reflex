import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";

export function linkEdge(
  from: ReactiveNode,
  to: ReactiveNode,
  after: ReactiveEdge | null = to.lastIn,
  version = 0,
): ReactiveEdge {
  const prevOut = from.lastOut;

  const edge: ReactiveEdge = {
    version: version | 0,
    from,
    to,
    prevOut,
    nextOut: null,
    prevIn: after,
    nextIn: null,
  };

  if (prevOut !== null) prevOut.nextOut = edge;
  else from.firstOut = edge;

  from.lastOut = edge;

  if (after === to.lastIn) {
    if (after !== null) after.nextIn = edge;
    else to.firstIn = edge;

    to.lastIn = edge;
    return edge;
  }

  const nextIn = after === null ? to.firstIn : after.nextIn;
  edge.nextIn = nextIn;

  if (nextIn !== null) nextIn.prevIn = edge;
  else to.lastIn = edge;

  if (after !== null) after.nextIn = edge;
  else to.firstIn = edge;

  return edge;
}

export function unlinkEdge(edge: ReactiveEdge): void {
  const { from, to, prevOut, nextOut, prevIn, nextIn } = edge;

  if (prevOut !== null) prevOut.nextOut = nextOut;
  else from.firstOut = nextOut;

  if (nextOut !== null) nextOut.prevOut = prevOut;
  else from.lastOut = prevOut;

  if (prevIn !== null) prevIn.nextIn = nextIn;
  else to.firstIn = nextIn;

  if (nextIn !== null) nextIn.prevIn = prevIn;
  else to.lastIn = prevIn;

  if (to.tailIn === edge) to.tailIn = prevIn;

  edge.prevOut = null;
  edge.nextOut = null;
  edge.prevIn = null;
  edge.nextIn = null;
}
