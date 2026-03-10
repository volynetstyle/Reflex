import { GraphNode } from "../core";
import { findEdgeInInList } from "./findEdgeInInList";
import { isLastInEdgeFrom } from "./isLastInEdgeFrom";

/**
 * Returns true if an edge exists: source → observer (via IN-list)
 *
 * OPTIMIZATION: Check lastIn first (O(1) fast path).
 */
export const hasObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): boolean => {
  return (
    isLastInEdgeFrom(observer, source) ||
    findEdgeInInList(observer, source) !== null
  );
};
