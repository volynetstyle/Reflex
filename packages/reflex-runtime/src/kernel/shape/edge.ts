import type ReactiveNode from "./node";

export interface ReactiveEdge {
  stamp: number;
  /**
   * The stamp the edge was linked with; never rewritten, so born <= stamp.
   * Outgoing lists are append-only: unless the producer is BirthUnordered,
   * its outgoing list is sorted by birth (INV-T4).
   */
  readonly born: number;
  from: ReactiveNode;
  to: ReactiveNode;
  prevOut: ReactiveEdge | null;
  nextOut: ReactiveEdge | null;
  prevIn: ReactiveEdge | null;
  nextIn: ReactiveEdge | null;
}

export const createReactiveEdge = (
  stamp: number,
  from: ReactiveNode,
  to: ReactiveNode,
): ReactiveEdge => ({
  stamp,
  born: stamp,
  from,
  to,
  prevOut: null,
  nextOut: null,
  prevIn: null,
  nextIn: null,
}); // Order matters!
