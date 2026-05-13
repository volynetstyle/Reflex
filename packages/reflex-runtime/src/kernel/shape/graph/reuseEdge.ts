import type { ReactiveEdge } from "../edge";
import type ReactiveNode from "../node";
import { moveIncomingEdgeAfterUnchecked } from "./edgeList";
import { linkEdge } from "./linkEdge";

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
  if (nextExpected?.from === from) {
    nextExpected.version = version;
    return nextExpected;
  }

  for (
    let edge = nextExpected?.nextIn ?? to.firstIn;
    edge;
    edge = edge.nextIn
  ) {
    if (edge.from !== from) continue;

    if (edge.prevIn !== prev) moveIncomingEdgeAfterUnchecked(to, edge, prev);
    edge.version = version;
    return edge;
  }

  return linkEdge(from, to, prev, version);
}
