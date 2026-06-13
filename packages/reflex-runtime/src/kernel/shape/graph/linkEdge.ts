import type { ReactiveEdge } from "../edge";
import type ReactiveNode from "../node";

export function linkEdge(
  from: ReactiveNode,
  to: ReactiveNode,
  after: ReactiveEdge | null = to.lastIn,
  version = 0,
): ReactiveEdge {
  const prevOut = from.lastOut;
  const nextIn = after === null ? to.firstIn : after.nextIn;

  const edge: ReactiveEdge = {
    version: version | 0,
    from,
    to,
    prevOut,
    nextOut: null,
    prevIn: after,
    nextIn,
  };

  if (prevOut !== null) prevOut.nextOut = edge;
  else from.firstOut = edge;

  from.lastOut = edge;

  if (nextIn !== null) nextIn.prevIn = edge;
  else to.lastIn = edge;

  if (after !== null) after.nextIn = edge;
  else to.firstIn = edge;

  return edge;
}

export function unlinkEdge(edge: ReactiveEdge): void {
  const { from, to, prevOut, nextOut, prevIn, nextIn } = edge;

  if (to.tailIn === edge) to.tailIn = prevIn;

  if (prevOut !== null) prevOut.nextOut = nextOut;
  else from.firstOut = nextOut;

  if (nextOut !== null) nextOut.prevOut = prevOut;
  else from.lastOut = prevOut;

  if (prevIn !== null) prevIn.nextIn = nextIn;
  else to.firstIn = nextIn;

  if (nextIn !== null) nextIn.prevIn = prevIn;
  else to.lastIn = prevIn;

  edge.prevOut = null;
  edge.nextOut = null;
  edge.prevIn = null;
  edge.nextIn = null;
}
