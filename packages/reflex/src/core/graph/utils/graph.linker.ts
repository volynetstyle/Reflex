/**
 * @file graph_linker.ts
 *
 * High-level graph linking API (optimized, no wrapper overhead).
 *
 * Directly exports unsafe operations for hot paths.
 * These are O(1) operations with no validation overhead.
 */
import {
  linkSourceToObserverUnsafe,
  unlinkSourceFromObserverUnsafe,
} from "./graph.intrusive.js";
import { GraphNode } from "../graph.types.js";

// linkEdge: (observer, source) -> linkSourceToObserverUnsafe(source, observer)
// Меняет порядок аргументов для удобства использования
export function linkEdge(
  observer: GraphNode | number,
  source: GraphNode | number
): void {
  linkSourceToObserverUnsafe(source, observer);
}

// unlinkEdge: (observer, source) -> unlinkSourceFromObserverUnsafe(source, observer)
export function unlinkEdge(
  observer: GraphNode | number,
  source: GraphNode | number
): void {
  unlinkSourceFromObserverUnsafe(source, observer);
}

// Экспортируем unsafe версии напрямую для внутреннего использования
export { linkSourceToObserverUnsafe, unlinkSourceFromObserverUnsafe };

