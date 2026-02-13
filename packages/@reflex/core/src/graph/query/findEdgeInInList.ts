import { GraphNode, GraphEdge } from "../core";

/**
 * Finds an edge from source to observer by scanning the IN-list.
 * Returns null if not found.
 */
export const findEdgeInInList = (
  observer: GraphNode,
  source: GraphNode,
): GraphEdge | null => {
  for (let edge = observer.firstIn; edge !== null; edge = edge.nextIn) {
    if (edge.from === source) {
      return edge;
    }
  }

  return null;
};
