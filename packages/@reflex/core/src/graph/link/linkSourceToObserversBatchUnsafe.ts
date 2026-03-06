import { GraphNode, GraphEdge } from "../core";
import { linkSourceToObserverUnsafe } from "./linkSourceToObserverUnsafe";

export const linkSourceToObserversBatchUnsafe = (
  source: GraphNode,
  observers: readonly GraphNode[],
  Constructor: typeof GraphEdge = GraphEdge,
): GraphEdge[] => {
  const n = observers.length;

  if (n === 0) return [];
  if (n === 1)
    return [linkSourceToObserverUnsafe(source, observers[0]!, Constructor)];

  const edges = new Array<GraphEdge>(n);

  for (let i = 0; i < n; i++) {
    edges[i] = linkSourceToObserverUnsafe(source, observers[i]!, Constructor);
  }

  return edges;
};
