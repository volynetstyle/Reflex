import type ReactiveNode from "./ReactiveNode";

export class ReactiveEdge {
  version: number = 0;

  from: ReactiveNode;
  to: ReactiveNode;

  prevOut: ReactiveEdge | null = null;
  nextOut: ReactiveEdge | null = null;

  prevIn: ReactiveEdge | null = null;
  nextIn: ReactiveEdge | null = null;

  constructor(
    version: number,
    from: ReactiveNode,
    to: ReactiveNode,
    prevOut: ReactiveEdge | null = null,
    nextOut: ReactiveEdge | null = null,
    prevIn: ReactiveEdge | null = null,
    nextIn: ReactiveEdge | null = null,
  ) {
    this.version = version | 0;
    this.from = from;
    this.to = to;
    this.prevOut = prevOut;
    this.nextOut = nextOut;
    this.prevIn = prevIn;
    this.nextIn = nextIn;
  }
}

export function createReactiveEdge(
  version: number,
  from: ReactiveNode,
  to: ReactiveNode,
): ReactiveEdge {
  return new ReactiveEdge(version, from, to);
}

export function clearReactiveEdgeLinks(edge: ReactiveEdge): void {
  edge.prevOut = null;
  edge.nextOut = null;
  edge.prevIn = null;
  edge.nextIn = null;
}
