import { GraphNode } from "../core";

/**
 * Checks if the most recent incoming edge comes from the target source.
 */
export const isLastInEdgeFrom = (
  observer: GraphNode,
  source: GraphNode,
): boolean => observer.lastIn !== null && observer.lastIn.from === source;
