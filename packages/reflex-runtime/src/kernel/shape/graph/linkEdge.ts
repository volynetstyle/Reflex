import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";

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

  if (prevOut === null) from.firstOut = edge;
  else prevOut.nextOut = edge;

  from.lastOut = edge;

  if (after === null) to.firstIn = edge;
  else after.nextIn = edge;

  if (nextIn === null) to.lastIn = edge;
  else nextIn.prevIn = edge;

  return edge;
}

/** Links the first incoming edge during dependency tracking. */
export function linkFirstTrackedEdgeUnchecked(
  from: ReactiveNode,
  to: ReactiveNode,
  version = 0,
): ReactiveEdge {
  const prevOut = from.lastOut;

  const edge: ReactiveEdge = {
    version: version | 0,
    from,
    to,
    prevOut,
    nextOut: null,
    prevIn: null,
    nextIn: null,
  } satisfies ReactiveEdge;

  if (prevOut !== null) prevOut.nextOut = edge;
  else from.firstOut = edge;

  from.lastOut = edge;
  to.firstIn = to.lastIn = to.tailIn = edge;

  return edge;
}

/** Appends an incoming edge after a non-null tracking cursor at list tail. */
export function appendTrackedEdgeAfterCursorUnchecked(
  from: ReactiveNode,
  to: ReactiveNode,
  cursor: ReactiveEdge,
  version = 0,
): ReactiveEdge {
  const prevOut = from.lastOut;

  const edge: ReactiveEdge = {
    version: version | 0,
    from,
    to,
    prevOut,
    nextOut: null,
    prevIn: cursor,
    nextIn: null,
  } satisfies ReactiveEdge;

  if (prevOut !== null) prevOut.nextOut = edge;
  else from.firstOut = edge;

  from.lastOut = edge;
  cursor.nextIn = edge;
  to.lastIn = to.tailIn = edge;

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
