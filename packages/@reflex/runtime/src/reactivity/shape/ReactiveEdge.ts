import type ReactiveNode from "./ReactiveNode";

/**
 * Plain-object edge shaped after alien-signals' Link.
 * A single edge lives in both the source's outgoing list and the target's
 * incoming list, so pointer rewrites must keep both views in sync.
 */
class ReactiveEdge {
  prevOut: ReactiveEdge | null;
  nextOut: ReactiveEdge | null;
  from: ReactiveNode;
  to: ReactiveNode;
  prevIn: ReactiveEdge | null;
  nextIn: ReactiveEdge | null;

  constructor(
    prevOut: ReactiveEdge | null,
    nextOut: ReactiveEdge | null,
    from: ReactiveNode,
    to: ReactiveNode,
    prevIn: ReactiveEdge | null,
    nextIn: ReactiveEdge | null,
  ) {
    this.prevOut = prevOut;
    this.nextOut = nextOut;
    this.from = from;
    this.to = to;
    this.prevIn = prevIn;
    this.nextIn = nextIn;
  }
}

export function clearReactiveEdgeLinks(edge: ReactiveEdge): void {
  edge.prevOut = edge.nextOut = edge.prevIn = edge.nextIn = null;
}

export { ReactiveEdge };
