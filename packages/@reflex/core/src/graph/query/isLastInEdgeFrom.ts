import { GraphNode } from "../graph.node";

/**
 * Checks if the most recent incoming edge comes from the target source.
 */
export const isLastInEdgeFrom = (
  observer: GraphNode,
  source: GraphNode,
): boolean => observer.lastIn !== null && observer.lastIn.from === source;
