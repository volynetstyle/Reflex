import { GraphEdge, GraphNode } from "../core";
import { linkSourceToObserverUnsafe } from "../link/linkSourceToObserverUnsafe";
import { unlinkSourceFromObserverUnsafe } from "../unlink/unlinkSourceFromObserverUnsafe";

/**
 * Performs atomic rebinding: oldSource → observer becomes newSource → observer
 *
 * OPTIMIZATION: Both operations use lastOut fast path.
 */
export const replaceSourceUnsafe = (
  oldSource: GraphNode,
  newSource: GraphNode,
  observer: GraphNode,
): void => {
  unlinkSourceFromObserverUnsafe(oldSource, observer);
  linkSourceToObserverUnsafe(newSource, observer, GraphEdge);
};
