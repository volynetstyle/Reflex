import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";

export function unlinkDetachedIncomingEdgeSequence(
  edge: ReactiveEdge | null,
): void {
  while (edge !== null) {
    const nextIn = edge.nextIn;
    const { from, prevOut, nextOut } = edge;

    if (prevOut !== null) prevOut.nextOut = nextOut;
    else from.firstOut = nextOut;

    if (nextOut !== null) nextOut.prevOut = prevOut;
    else from.lastOut = prevOut;

    edge.prevOut = null;
    edge.nextOut = null;
    edge.prevIn = null;
    edge.nextIn = null;

    edge = nextIn;
  }
}

/**
 * Full incoming-edge sweep used by disposal paths.
 * Cold-path traversal that tears down every source connection.
 */
export function unlinkAllSources(node: ReactiveNode): void {
  const edge = node.firstIn;

  node.firstIn = null;
  node.lastIn = null;
  node.tailIn = null;

  unlinkDetachedIncomingEdgeSequence(edge);
}

/**
 * Full outgoing-edge sweep used by producer disposal paths.
 * Cold-path traversal that tears down every subscriber connection.
 */
export function unlinkAllSubscribers(node: ReactiveNode): void {
  let edge = node.firstOut;

  node.firstOut = null;
  node.lastOut = null;

  while (edge !== null) {
    const nextOut = edge.nextOut;
    const { to, prevIn, nextIn } = edge;

    if (to.tailIn === edge) {
      to.tailIn = prevIn;
    }

    if (prevIn !== null) prevIn.nextIn = nextIn;
    else to.firstIn = nextIn;

    if (nextIn !== null) nextIn.prevIn = prevIn;
    else to.lastIn = prevIn;

    edge.prevOut = null;
    edge.nextOut = null;
    edge.prevIn = null;
    edge.nextIn = null;

    edge = nextOut;
  }
}
