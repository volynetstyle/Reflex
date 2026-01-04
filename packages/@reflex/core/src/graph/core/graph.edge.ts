import type { GraphNode } from "./graph.node";

/**
 * GraphEdge represents a directed, intrusive, bi-directional connection between two GraphNodes.
 *
 * It participates in two separate doubly-linked lists:
 *   - OUT-list: chained from the source node's outgoing edges (dependencies → observers)
 *   - IN-list:  chained from the observer node's incoming edges (dependents → source)
 *
 * All mutations (link/unlink) are O(1) and require no additional metadata.
 *
 * Memory layout is carefully grouped for cache locality:
 *   - Node references first (from/to)
 *   - Then OUT pointers (prevOut/nextOut)
 *   - Then IN pointers (prevIn/nextIn)
 */
class GraphEdge {
  /** Source node (the node that has this edge in its OUT-list) */
  from: GraphNode;
  /** Observer node (the node that has this edge in its IN-list) */
  to: GraphNode;

  /** Previous edge in the source's OUT-list (or null if this is the first) */
  prevOut: GraphEdge | null = null;
  /** Next edge in the source's OUT-list (or null if this is the last) */
  nextOut: GraphEdge | null = null;

  /** Previous edge in the observer's IN-list (or null if this is the first) */
  prevIn: GraphEdge | null = null;
  /** Next edge in the observer's IN-list (or null if this is the last) */
  nextIn: GraphEdge | null = null;

  /**
   * Creates a new edge and inserts it at the end of both lists.
   * This constructor is intentionally low-level and mirrors the manual linking
   * performed in functions like `linkSourceToObserverUnsafe`.
   *
   * @param from     Source node
   * @param to       Observer node
   * @param prevOut  Previous OUT edge (typically source.lastOut before insertion)
   * @param nextOut  Next OUT edge (always null for tail insertion)
   * @param prevIn   Previous IN edge (typically observer.lastIn before insertion)
   * @param nextIn   Next IN edge (always null for tail insertion)
   */
  constructor(
    from: GraphNode,
    to: GraphNode,
    prevOut: GraphEdge | null = null,
    nextOut: GraphEdge | null = null,
    prevIn: GraphEdge | null = null,
    nextIn: GraphEdge | null = null,
  ) {
    this.from = from;
    this.to = to;
    this.prevOut = prevOut;
    this.nextOut = nextOut;
    this.prevIn = prevIn;
    this.nextIn = nextIn;
  }
}

export { GraphEdge };

