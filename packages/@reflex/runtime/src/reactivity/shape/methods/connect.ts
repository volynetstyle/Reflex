import { ReactiveEdge } from "../ReactiveEdge";
import ReactiveNode from "../ReactiveNode";

function attachOutEdge(from: ReactiveNode, edge: ReactiveEdge): void {
  edge.prevOut = from.lastOut;
  edge.nextOut = null;

  if (from.lastOut) {
    from.lastOut.nextOut = edge;
  } else {
    from.firstOut = edge;
  }

  from.lastOut = edge;
}

function attachInEdge(
  to: ReactiveNode,
  edge: ReactiveEdge,
  after: ReactiveEdge | null,
): void {
  if (after) {
    edge.prevIn = after;
    edge.nextIn = after.nextIn;

    if (after.nextIn) {
      after.nextIn.prevIn = edge;
    } else {
      to.lastIn = edge;
    }

    after.nextIn = edge;
    return;
  }

  edge.prevIn = null;
  edge.nextIn = to.firstIn;

  if (to.firstIn) {
    to.firstIn.prevIn = edge;
  } else {
    to.lastIn = edge;
  }

  to.firstIn = edge;
}

export function linkEdge(
  from: ReactiveNode,
  to: ReactiveNode,
  after: ReactiveEdge | null = to.lastIn,
): ReactiveEdge {
  const edge = new ReactiveEdge(from, to);
  attachOutEdge(from, edge);
  attachInEdge(to, edge, after);
  return edge;
}

export function unlinkEdge(edge: ReactiveEdge): void {
  const { from, to } = edge;
  const { prevOut, nextOut, prevIn, nextIn } = edge;

  if (to.lastTrackedEdge === edge) {
    to.lastTrackedEdge = null;
  }
  if (to.depsTail === edge) {
    to.depsTail = prevIn;
  }

  if (prevOut) {
    prevOut.nextOut = nextOut;
  } else {
    from.firstOut = nextOut;
  }
  if (nextOut) {
    nextOut.prevOut = prevOut;
  } else {
    from.lastOut = prevOut;
  }

  if (prevIn) {
    prevIn.nextIn = nextIn;
  } else {
    to.firstIn = nextIn;
  }
  if (nextIn) {
    nextIn.prevIn = prevIn;
  } else {
    to.lastIn = prevIn;
  }

  edge.prevOut = null;
  edge.nextOut = null;
  edge.prevIn = null;
  edge.nextIn = null;
}

export function unlinkFromSource(edge: ReactiveEdge): void {
  unlinkEdge(edge);
}

/**
 * Full incoming-edge sweep used by disposal paths.
 * This is intentionally a cold-path traversal that tears down every source
 * connection regardless of dependency order or reuse information.
 */
export function unlinkAllSources(node: ReactiveNode): void {
  let edge = node.firstIn;
  node.firstIn = null;
  node.lastIn = null;
  node.depsTail = null;
  node.lastTrackedEdge = null;

  while (edge) {
    const next = edge.nextIn;
    unlinkEdge(edge);
    edge = next;
  }
}

export function moveIncomingEdgeAfter(
  edge: ReactiveEdge,
  to: ReactiveNode,
  after: ReactiveEdge | null,
): void {
  if (edge.prevIn === after) return;
  if (after === null && to.firstIn === edge) return;

  const prevIn = edge.prevIn;
  const nextIn = edge.nextIn;

  if (prevIn) {
    prevIn.nextIn = nextIn;
  } else {
    to.firstIn = nextIn;
  }

  if (nextIn) {
    nextIn.prevIn = prevIn;
  } else {
    to.lastIn = prevIn;
  }

  attachInEdge(to, edge, after);
}

export function connect(parent: ReactiveNode, child: ReactiveNode): ReactiveEdge {
  // Imperative connect is a cold path, so we pay one linear incoming-edge scan
  // to preserve the invariant that a parent-child pair is represented once.
  for (let e = child.firstIn; e; e = e.nextIn) {
    if (e.from === parent) return e;
  }

  return linkEdge(parent, child);
}

export function disconnect(parent: ReactiveNode, child: ReactiveNode): void {
  // Disconnect mirrors connect: scan the child's incoming list until the
  // matching parent edge is found, then unlink it in O(1).
  for (let e = child.firstIn; e; e = e.nextIn) {
    if (e.from === parent) {
      unlinkEdge(e);
      return;
    }
  }
}
