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

/**
 * Links a new incoming edge directly after the current tracking cursor and
 * advances the cursor to the inserted edge.
 */
export function linkEdgeAfterCursor(
  from: ReactiveNode,
  to: ReactiveNode,
  version = 0,
): ReactiveEdge {
  const prevOut = from.lastOut;
  const cursor = to.tailIn;
  const nextIn = cursor === null ? to.firstIn : cursor.nextIn;

  const edge: ReactiveEdge = {
    version: version | 0,
    from,
    to,
    prevOut,
    nextOut: null,
    prevIn: cursor,
    nextIn,
  } satisfies ReactiveEdge;

  if (prevOut !== null) prevOut.nextOut = edge;
  else from.firstOut = edge;

  from.lastOut = edge;

  if (cursor !== null) cursor.nextIn = edge;
  else to.firstIn = edge;

  if (nextIn !== null) nextIn.prevIn = edge;
  else to.lastIn = edge;

  to.tailIn = edge;
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
