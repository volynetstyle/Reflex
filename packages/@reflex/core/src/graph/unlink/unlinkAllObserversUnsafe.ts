import { GraphNode } from "../graph.node";
import { unlinkEdgeUnsafe } from "./unlinkEdgeUnsafe";

/**
 * Removes all outgoing edges from the given node: node → observer*
 *
 * OPTIMIZATION: Single-pass, no allocations.
 */
export const unlinkAllObserversUnsafe = (source: GraphNode): void => {
  let edge = source.firstOut;

  while (edge !== null) {
    const next = edge.nextOut;
    unlinkEdgeUnsafe(edge);
    edge = next;
  }
};