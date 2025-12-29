import { GraphNode } from "../graph.node";
import { findEdgeInOutList } from "../query/findEdgeInOutList";
import { isLastOutEdgeTo } from "../query/isLastOutEdgeTo";
import { unlinkEdgeUnsafe } from "./unlinkEdgeUnsafe";

/**
 * Removes the first occurrence of an edge source → observer.
 *
 * OPTIMIZATION: Check lastOut first (O(1) fast path).
 */
export const unlinkSourceFromObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): void => {
  if (isLastOutEdgeTo(source, observer)) {
    unlinkEdgeUnsafe(source.lastOut!);
    return;
  }

  const edge = findEdgeInOutList(source, observer);

  if (edge !== null) {
    unlinkEdgeUnsafe(edge);
  }
};
