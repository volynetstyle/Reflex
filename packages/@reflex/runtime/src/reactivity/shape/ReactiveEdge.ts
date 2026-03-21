import type ReactiveNode from "./ReactiveNode";

/**
 * Plain-object edge shaped after alien-signals' Link.
 * A single edge lives in both the source's outgoing list and the target's
 * incoming list, so pointer rewrites must keep both views in sync.
 */
interface ReactiveEdge {
  from: ReactiveNode;
  to: ReactiveNode;
  prevOut: ReactiveEdge | null;
  nextOut: ReactiveEdge | null;
  prevIn: ReactiveEdge | null;
  nextIn: ReactiveEdge | null;
}

export function createReactiveEdge(
  from: ReactiveNode,
  to: ReactiveNode,
  prevOut: ReactiveEdge | null,
  prevIn: ReactiveEdge | null,
  nextIn: ReactiveEdge | null,
): ReactiveEdge {
  return {
    from,
    to,
    prevOut,
    nextOut: null,
    prevIn,
    nextIn,
  };
}

export function clearReactiveEdgeLinks(edge: ReactiveEdge): void {
  edge.prevOut = null;
  edge.nextOut = null;
  edge.prevIn = null;
  edge.nextIn = null;
}

export type { ReactiveEdge };
