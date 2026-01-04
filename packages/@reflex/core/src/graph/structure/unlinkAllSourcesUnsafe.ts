import { GraphNode } from "../core";
import { unlinkEdgeUnsafe } from "../unlink/unlinkEdgeUnsafe";

/**
 * Removes all incoming edges to the given node: source* → node
 *
 * OPTIMIZATION: Single-pass, no allocations.
 */
export const unlinkAllSourcesUnsafe = (observer: GraphNode): void => {
  let edge = observer.firstIn;

  while (edge !== null) {
    const next = edge.nextIn;
    unlinkEdgeUnsafe(edge);
    edge = next;
  }
};