import type ReactiveNode from "./ReactiveNode";

/**
 * Plain-object edge shaped after alien-signals' Link.
 * A single edge lives in both the source's outgoing list and the target's
 * incoming list, so pointer rewrites must keep both views in sync.
 */
class ReactiveEdge {
  from: ReactiveNode;
  to: ReactiveNode;
  prevOut: ReactiveEdge | null;
  nextOut: ReactiveEdge | null;
  prevIn: ReactiveEdge | null;
  nextIn: ReactiveEdge | null;

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
    this.prevOut = prevOut;
    this.nextOut = nextOut;
    this.prevIn = prevIn;
    this.nextIn = nextIn;
  }
}

export function clearReactiveEdgeLinks(edge: ReactiveEdge): void {
  edge.prevOut = null;
  edge.nextOut = null;
  edge.prevIn = null;
  edge.nextIn = null;
}

export { ReactiveEdge };
