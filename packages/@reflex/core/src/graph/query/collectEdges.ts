import { GraphEdge } from "../graph.node";

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
  let idx = 0;
  let edge = firstEdge;

  while (edge !== null) {
    edges[idx++] = edge;
    edge = getNext(edge);
  }

  return edges;
};
