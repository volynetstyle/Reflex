import { GraphEdge } from "../core";

/**
 * Removes a single directed edge from both intrusive adjacency lists.
 *
 * OPTIMIZATION: O(1) operation - accepts edge directly.
 */
export const unlinkEdgeUnsafe = (edge: GraphEdge): void => {
  const from = edge.from;
  const to = edge.to;

  const prevOut = edge.prevOut;
  const nextOut = edge.nextOut;

  if (prevOut) prevOut.nextOut = nextOut;
  else from.firstOut = nextOut;

  if (nextOut) nextOut.prevOut = prevOut;
  else from.lastOut = prevOut;

  const prevIn = edge.prevIn;
  const nextIn = edge.nextIn;

  if (prevIn) prevIn.nextIn = nextIn;
  else to.firstIn = nextIn;

  if (nextIn) nextIn.prevIn = prevIn;
  else to.lastIn = prevIn;

  --to.inCount;
  --from.outCount;

  edge.prevOut = edge.nextOut = edge.prevIn = edge.nextIn = null;
};
