import { GraphEdge } from "../graph.node";

/**
 * Removes a single directed edge from both intrusive adjacency lists.
 * 
 * OPTIMIZATION: O(1) operation - accepts edge directly.
 */
export const unlinkEdgeUnsafe = (edge: GraphEdge): void => {
  const from = edge.from;
  const to = edge.to;

  // Unlink from OUT-list
  if (edge.prevOut) {
    edge.prevOut.nextOut = edge.nextOut;
  } else {
    from.firstOut = edge.nextOut;
  }
  if (edge.nextOut) {
    edge.nextOut.prevOut = edge.prevOut;
  } else {
    from.lastOut = edge.prevOut;
  }

  // Unlink from IN-list
  if (edge.prevIn) {
    edge.prevIn.nextIn = edge.nextIn;
  } else {
    to.firstIn = edge.nextIn;
  }
  if (edge.nextIn) {
    edge.nextIn.prevIn = edge.prevIn;
  } else {
    to.lastIn = edge.prevIn;
  }

  --to.inCount;
  --from.outCount;

  edge.prevOut = edge.nextOut = edge.prevIn = edge.nextIn = null;
};
