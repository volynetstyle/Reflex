import type { ReactiveEdge } from "../ReactiveEdge";
import { clearReactiveEdgeLinks } from "../ReactiveEdge";
import type ReactiveNode from "../ReactiveNode";
import { detachIncomingEdge, detachOutgoingEdge } from "./edgeList";

export function unlinkDetachedIncomingEdgeSequence(
  edge: ReactiveEdge | null,
): void {
  while (edge) {
    const next = edge.nextIn;
    detachOutgoingEdge(edge.from, edge);
    clearReactiveEdgeLinks(edge);
    edge = next;
  }
}

/**
 * Full incoming-edge sweep used by disposal paths.
 * Cold-path traversal that tears down every source connection.
 */
export function unlinkAllSources(node: ReactiveNode): void {
  let edge = node.firstIn;

  if (edge === null) {
    node.lastIn = null;
    node.lastInTail = null;
    return;
  }

  node.firstIn = null;
  node.lastIn = null;
  node.lastInTail = null;

  do {
    const next: ReactiveEdge | null = edge.nextIn;
    const from = edge.from;

    detachOutgoingEdge(from, edge);
    clearReactiveEdgeLinks(edge);

    edge = next;
  } while (edge !== null);
}

/**
 * Full outgoing-edge sweep used by producer disposal paths.
 * Cold-path traversal that tears down every subscriber connection.
 */
export function unlinkAllSubscribers(node: ReactiveNode): void {
  let edge = node.firstOut;

  if (edge === null) {
    node.lastOut = null;
    return;
  }

  node.firstOut = null;
  node.lastOut = null;

  do {
    const next: ReactiveEdge | null = edge.nextOut;
    const to = edge.to;

    if (to.lastInTail === edge) {
      to.lastInTail = edge.prevIn;
    }

    detachIncomingEdge(to, edge);
    clearReactiveEdgeLinks(edge);

    edge = next;
  } while (edge !== null);
}
