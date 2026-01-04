import { GraphEdge } from "../core";
import { unlinkEdgeUnsafe } from "../unlink/unlinkEdgeUnsafe";

/**
 * Unlinks edges from a pre-collected array in reverse order.
 * Shared logic for both chunked unlink operations.
 */
export const unlinkEdgesReverse = (edges: GraphEdge[], count: number): void => {
  for (let i = count - 1; i >= 0; --i) {
    unlinkEdgeUnsafe(edges[i]!);
  }
};
