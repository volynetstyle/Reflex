/// @dev-only
/**
 * temporal_relaxations:
 *    allowed_within_operations:
 *      - head_tail_inconsistency
 *      - partial_edge_attachment
 *      - transient_list_disconnection
 *
 *    boundary_requirement:
 *      - all invariants must hold at operation boundaries
 */
import { GraphNode } from "./graph.node";

export function assertNodeInvariant(node: GraphNode): void {
  // 1. Пустота списков (⇔)
  if ((node.firstOut === null) !== (node.lastOut === null)) {
    throw new Error("Out list head/tail mismatch");
  }
  if ((node.firstIn === null) !== (node.lastIn === null)) {
    throw new Error("In list head/tail mismatch");
  }

  // 2. Границы списков
  if (node.firstOut && node.firstOut.prevOut !== null) {
    throw new Error("firstOut.prevOut must be null");
  }
  if (node.lastOut && node.lastOut.nextOut !== null) {
    throw new Error("lastOut.nextOut must be null");
  }

  if (node.firstIn && node.firstIn.prevIn !== null) {
    throw new Error("firstIn.prevIn must be null");
  }
  if (node.lastIn && node.lastIn.nextIn !== null) {
    throw new Error("lastIn.nextIn must be null");
  }

  // 3. Корректность двусвязности + принадлежности (out)
  for (let e = node.firstOut; e !== null; e = e.nextOut) {
    if (e.from !== node) {
      throw new Error("Out edge.from mismatch");
    }
    if (e.nextOut && e.nextOut.prevOut !== e) {
      throw new Error("Out next.prev mismatch");
    }
    if (e.prevOut && e.prevOut.nextOut !== e) {
      throw new Error("Out prev.next mismatch");
    }
  }

  // 4. Корректность двусвязности + принадлежности (in)
  for (let e = node.firstIn; e !== null; e = e.nextIn) {
    if (e.to !== node) {
      throw new Error("In edge.to mismatch");
    }
    if (e.nextIn && e.nextIn.prevIn !== e) {
      throw new Error("In next.prev mismatch");
    }
    if (e.prevIn && e.prevIn.nextIn !== e) {
      throw new Error("In prev.next mismatch");
    }
  }
}
