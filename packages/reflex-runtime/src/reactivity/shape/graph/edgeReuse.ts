import type { ReactiveEdge } from "../ReactiveEdge";
import type ReactiveNode from "../ReactiveNode";
import { attachIncomingEdgeAfter, detachIncomingEdge } from "./edgeList";
import { linkEdge } from "./edgeLink";

/**
 * Reuse an existing `from -> to` edge from the remaining incoming suffix when
 * possible, otherwise create a new edge after `prev`.
 */
export function reuseIncomingEdgeFromSuffixOrCreate(
  from: ReactiveNode,
  to: ReactiveNode,
  prev: ReactiveEdge | null,
  nextExpected: ReactiveEdge | null,
  version = 0,
): ReactiveEdge {
  for (
    let edge = nextExpected ?? to.firstIn;
    edge !== null;
    edge = edge.nextIn
  ) {
    if (edge.from !== from) continue;

    if (edge.prevIn !== prev) {
      detachIncomingEdge(to, edge);
      attachIncomingEdgeAfter(to, edge, prev);
    }

    edge.version = version;
    return edge;
  }

  return linkEdge(from, to, prev, version);
}
