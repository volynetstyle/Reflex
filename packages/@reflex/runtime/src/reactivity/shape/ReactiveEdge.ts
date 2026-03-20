import ReactiveNode from "./ReactiveNode";

/**
 * MUST BE valid with respect to GraphEdge and contain the same field as the inherited one.
 * ReactiveEdge represents a directed, intrusive, bi-directional connection between two ReactiveNodes.
 */
class ReactiveEdge {
  prevOut: ReactiveEdge | null = null;
  nextOut: ReactiveEdge | null = null;
  prevIn: ReactiveEdge | null = null;
  nextIn: ReactiveEdge | null = null;

  constructor(
    public from: ReactiveNode,
    public to: ReactiveNode,
  ) {}
}

export { ReactiveEdge };
