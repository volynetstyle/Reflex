import type { GraphEdge } from "@reflex/core";
import ReactiveNode from "./ReactiveNode";

/**
 * MUST BE valid with respect to GraphEdge and contain the same field as the inherited one.
 * ReactiveEdge represents a directed, intrusive, bi-directional connection between two ReactiveNodes.
 */
class ReactiveEdge implements GraphEdge {
  /** Source node (the node that has this edge in its OUT-list) */
  from: ReactiveNode;
  /** Observer node (the node that has this edge in its IN-list) */
  to: ReactiveNode;

  v: number;

  /** Previous edge in the source's OUT-list (or null if this is the first) */
  prevOut: ReactiveEdge | null;
  /** Next edge in the source's OUT-list (or null if this is the last) */
  nextOut: ReactiveEdge | null;
  /** Previous edge in the observer's IN-list (or null if this is the first) */
  prevIn: ReactiveEdge | null;
  /** Next edge in the observer's IN-list (or null if this is the last) */
  nextIn: ReactiveEdge | null;

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
    from: ReactiveNode,
    to: ReactiveNode,
    prevOut: ReactiveEdge | null,
    nextOut: ReactiveEdge | null,
    prevIn: ReactiveEdge | null,
    nextIn: ReactiveEdge | null,
  ) {
    this.from = from;
    this.to = to;
    this.v = 0;
    this.prevOut = prevOut;
    this.nextOut = nextOut;
    this.prevIn = prevIn;
    this.nextIn = nextIn;
  }
}

export { ReactiveEdge };
