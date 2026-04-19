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

  node.firstIn = null;
  node.lastIn = null;
  node.lastOutTail = null;

  while (edge) {
    const next = edge.nextIn;
    detachOutgoingEdge(edge.from, edge);
    clearReactiveEdgeLinks(edge);
    edge = next;
  }
}

/**
 * Full outgoing-edge sweep used by producer disposal paths.
 * Cold-path traversal that tears down every subscriber connection.
 */
export function unlinkAllSubscribers(node: ReactiveNode): void {
  let edge = node.firstOut;

  node.firstOut = null;
  node.lastOut = null;

  while (edge) {
    const next = edge.nextOut;

    if (edge.to.lastOutTail === edge) edge.to.lastOutTail = edge.prevIn;
    detachIncomingEdge(edge.to, edge);
    clearReactiveEdgeLinks(edge);
    edge = next;
  }
}
