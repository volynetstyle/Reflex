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
  if (isLastOutEdgeTo(source, observer)) return true;
  return findEdgeInOutList(source, observer) !== null;
};
