import { GraphNode, GraphEdge } from "../graph.node";
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
  if (isLastOutEdgeTo(source, observer)) {
    return source.lastOut!;
  }

  ++observer.inCount;
  ++source.outCount;

  const lastOut = source.lastOut;
  const lastIn = observer.lastIn;

  const edge: GraphEdge = new GraphEdge(
    source,
    observer,
    lastOut,
    null,
    lastIn,
    null,
  );

  observer.lastIn = source.lastOut = edge;

  if (lastOut !== null) {
    lastOut.nextOut = edge;
  } else {
    source.firstOut = edge;
  }

  if (lastIn !== null) {
    lastIn.nextIn = edge;
  } else {
    observer.firstIn = edge;
  }

  return edge;
};
