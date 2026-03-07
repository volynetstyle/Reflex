import type { GraphNode, GraphEdge } from "../core";
import { isLastOutEdgeTo } from "../query/isLastOutEdgeTo";

type EdgeClass = typeof GraphEdge;

/**
 * Creates a new directed edge: source → observer
 */
export const linkSourceToObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
  EdgeConstructor: EdgeClass,
): GraphEdge => {
  // Invariant: at most one edge from source to observer
  if (isLastOutEdgeTo(source, observer)) {
    return source.lastOut!;
  }

  ++observer.inCount;
  ++source.outCount;

  const lastOut = source.lastOut;
  const lastIn = observer.lastIn;

  const edge = new EdgeConstructor(
    source,
    observer,
    lastOut,
    null,
    lastIn,
    null,
  );

  if (lastOut !== null) lastOut.nextOut = edge;
  else source.firstOut = edge;
  source.lastOut = edge;

  if (lastIn !== null) lastIn.nextIn = edge;
  else observer.firstIn = edge;
  observer.lastIn = edge;

  return edge;
};
