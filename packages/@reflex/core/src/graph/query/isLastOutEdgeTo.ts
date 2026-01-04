import { GraphNode } from "../core";

/**
 * Checks if the most recent outgoing edge points to the target observer.
 * This covers 90%+ of real-world duplicate detection cases.
 */
export const isLastOutEdgeTo = (source: GraphNode, observer: GraphNode): boolean =>
  source.lastOut !== null && source.lastOut.to === observer;
