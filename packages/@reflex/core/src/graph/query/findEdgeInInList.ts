import { GraphNode, GraphEdge } from "../core";

/**
 * Finds an edge from source to observer by scanning the IN-list.
 * Returns null if not found.
 */
export const findEdgeInInList = (observer: GraphNode, source: GraphNode): GraphEdge | null => {
  let edge = observer.firstIn;
  while (edge !== null) {
    if (edge.from === source) return edge;
    edge = edge.nextIn;
  }
  return null;
};