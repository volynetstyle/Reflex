import { GraphNode } from "../core";
import { findEdgeInOutList } from "./findEdgeInOutList";
import { isLastOutEdgeTo } from "./isLastOutEdgeTo";

/**
 * Returns true if an edge exists: source → observer (via OUT-list)
 *
 * OPTIMIZATION: Check lastOut first (O(1) fast path).
 */
export const hasSourceUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): boolean => {
  return (
    isLastOutEdgeTo(source, observer) ||
    findEdgeInOutList(source, observer) !== null
  );
};
