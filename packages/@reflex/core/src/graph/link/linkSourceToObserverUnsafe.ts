import { GraphNode, GraphEdge } from "../core";
import { isLastOutEdgeTo } from "../query/isLastOutEdgeTo";

/**
 * Creates a new directed edge: source → observer
 *
 * OPTIMIZATION: Fast duplicate detection via lastOut + nextOut check (O(1))
 */
export const linkSourceToObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): GraphEdge => {
  // Fast-path: duplicate
  if (isLastOutEdgeTo(source, observer)) {
    return source.lastOut!;
  }

  ++observer.inCount;
  ++source.outCount;

  const lastOut = source.lastOut;
  const lastIn = observer.lastIn;

  const edge = new GraphEdge(source, observer, lastOut, null, lastIn, null);

  // ---- OUT chain ----
  if (lastOut !== null) {
    lastOut.nextOut = edge;
  } else {
    source.firstOut = edge;
  }
  source.lastOut = edge;

  // ---- IN chain ----
  if (lastIn !== null) {
    lastIn.nextIn = edge;
  } else {
    observer.firstIn = edge;
  }
  observer.lastIn = edge;

  return edge;
};
