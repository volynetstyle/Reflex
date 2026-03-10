import { GraphEdge } from "../core";
import { unlinkEdgeUnsafe } from "./unlinkEdgeUnsafe";

/**
 * Fast-path handler for unlinking when count <= 1.
 * Returns true if handled, false if caller should continue.
 */
export const tryUnlinkFastPath = (
  firstEdge: GraphEdge | null,
  count: number,
): boolean => {
  if (count === 0) return true;
  if (count === 1) return (unlinkEdgeUnsafe(firstEdge!), true);
  return false;
};
