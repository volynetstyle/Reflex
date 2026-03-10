import { GraphNode, GraphEdge } from "../core";

/**
 * Finds an edge from source to observer by scanning the OUT-list.
 * Returns null if not found.
 */
export const findEdgeInOutList = (
  source: GraphNode,
  observer: GraphNode,
): GraphEdge | null => {
  for (let edge = source.firstOut; edge !== null; edge = edge.nextOut) {
    if (edge.to === observer) {
      return edge;
    }
  }
  
  return null;
};
