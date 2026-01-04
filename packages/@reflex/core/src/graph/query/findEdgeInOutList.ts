import { GraphNode, GraphEdge } from "../core";

/**
 * Finds an edge from source to observer by scanning the OUT-list.
 * Returns null if not found.
 */
export const findEdgeInOutList = (source: GraphNode, observer: GraphNode): GraphEdge | null => {
  let edge = source.firstOut;
  while (edge !== null) {
    if (edge.to === observer) return edge;
    edge = edge.nextOut;
  }
  return null;
};