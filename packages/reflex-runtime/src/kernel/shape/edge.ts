import type ReactiveNode from "./node";

export interface ReactiveEdge {
  version: number;
  from: ReactiveNode;
  to: ReactiveNode;
  prevOut: ReactiveEdge | null;
  nextOut: ReactiveEdge | null;
  prevIn: ReactiveEdge | null;
  nextIn: ReactiveEdge | null;
}

export const createReactiveEdge = (
  version: number,
  from: ReactiveNode,
  to: ReactiveNode,
): ReactiveEdge => ({
  version: version | 0,
  from,
  to,
  prevOut: null,
  nextOut: null,
  prevIn: null,
  nextIn: null,
}); // Order matters!

export const clearReactiveEdgeLinks = (edge: ReactiveEdge): void =>
  void (edge.prevOut = edge.prevIn = edge.nextIn = null);
