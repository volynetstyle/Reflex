import type { ReactiveEdge } from "../ReactiveEdge";
import { clearReactiveEdgeLinks, createReactiveEdge } from "../ReactiveEdge";
import type ReactiveNode from "../ReactiveNode";
import {
  attachIncomingEdgeAfter,
  detachIncomingEdge,
  detachOutgoingEdge,
} from "./edgeList";

export function linkEdge(
  from: ReactiveNode,
  to: ReactiveNode,
  after: ReactiveEdge | null = to.lastIn,
  version = 0,
): ReactiveEdge {
  const prevOut = from.lastOut;
  const edge = createReactiveEdge(version, from, to);

  edge.prevOut = prevOut;

  if (prevOut) prevOut.nextOut = edge;
  else from.firstOut = edge;
  from.lastOut = edge;

  attachIncomingEdgeAfter(to, edge, after);
  return edge;
}

export function unlinkEdge(edge: ReactiveEdge): void {
  const { from, to } = edge;

  if (to.lastInTail === edge) to.lastInTail = edge.prevIn;

  detachOutgoingEdge(from, edge);
  detachIncomingEdge(to, edge);
  clearReactiveEdgeLinks(edge);
}

/** Cold-path: links `parent -> child` only if not already connected. */
export function connect(
  parent: ReactiveNode,
  child: ReactiveNode,
): ReactiveEdge {
  const lastIncoming = child.lastIn;

  if (lastIncoming !== null && lastIncoming.from === parent) {
    return lastIncoming;
  }

  for (let edge = lastIncoming; edge; edge = edge.prevIn) {
    if (edge.from === parent) return edge;
  }

  return linkEdge(parent, child);
}

/** Cold-path: removes the first `parent -> child` edge if it exists. */
export function disconnect(parent: ReactiveNode, child: ReactiveNode): void {
  for (let edge = child.firstIn; edge; edge = edge.nextIn) {
    if (edge.from === parent) {
      unlinkEdge(edge);
      return;
    }
  }
}
