import { GraphEdge } from "../core";

/**
 * Collects all edges from a linked list into a pre-sized array.
 * Generic helper to avoid duplication between IN/OUT list collection.
 */
export const collectEdges = (
  firstEdge: GraphEdge | null,
  count: number,
  getNext: (edge: GraphEdge) => GraphEdge | null,
): GraphEdge[] => {
  const edges = new Array<GraphEdge>(count);

  for (let idx = 0, edge = firstEdge; edge !== null; edge = getNext(edge)) {
    edges[idx++] = edge;
  }

  return edges.slice();
};
