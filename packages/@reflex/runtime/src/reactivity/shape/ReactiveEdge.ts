import ReactiveNode from "./ReactiveNode";

/**
 * MUST BE valid with respect to GraphEdge and contain the same field as the inherited one.
 * ReactiveEdge represents a directed, intrusive, bi-directional connection between two ReactiveNodes.
 */
class ReactiveEdge {
  nextOut: ReactiveEdge | null = null;
  nextIn: ReactiveEdge | null = null;
  s: number = 0;

  constructor(
    public from: ReactiveNode,
    public to: ReactiveNode,
  ) {}
}

export { ReactiveEdge };
