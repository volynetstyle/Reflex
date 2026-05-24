import type { ReactiveEdge } from "../edge";
import { clearReactiveEdgeLinks } from "../edge";
import type ReactiveNode from "../node";
import { bumpNodes } from "../node";
import { detachIncomingEdge, detachOutgoingEdge } from "./edgeList";

export function unlinkDetachedIncomingEdgeSequence(
  edge: ReactiveEdge | null,
): void {
  const to = edge?.to ?? null;

  while (edge) {
    const next = edge.nextIn;
    detachOutgoingEdge(edge.from, edge);
    clearReactiveEdgeLinks(edge);
    edge = next;
  }

  if (to !== null) bumpNodes(to);
}

/**
 * Full incoming-edge sweep used by disposal paths.
 * Cold-path traversal that tears down every source connection.
 */
export function unlinkAllSources(node: ReactiveNode): void {
  let edge = node.firstIn;

  if (edge === null) {
    node.lastIn = null;
    node.tailIn = null;
    return;
  }

  bumpNodes(node);

  node.firstIn = null;
  node.lastIn = null;
  node.tailIn = null;

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

    if (to.tailIn === edge) {
      to.tailIn = edge.prevIn;
    }

    detachIncomingEdge(to, edge);
    clearReactiveEdgeLinks(edge);

    edge = next;
  } while (edge !== null);
}
