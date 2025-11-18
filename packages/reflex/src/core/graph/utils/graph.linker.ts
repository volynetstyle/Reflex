/**
 * @file graph_linker.ts
 *
 * High-level graph linking API.
 *
 * Provides two tiers:
 *  1. Unsafe operations (linkSourceToObserverUnsafe, etc.)
 *     - O(1), no validation, for hot paths
 *  2. Safe operations (linkEdgeSafe, etc.)
 *     - With invariant checks (DAG, duplicates, etc.)
 *     - For external API and debug mode
 *
 * Current focus: unsafe operations (for benchmarking).
 * Safe checks can be layered on top or via WeakMap-based dev hooks.
 */
import { IReactiveNode } from "../graph.types.js";
import {
  linkSourceToObserverUnsafe,
  unlinkSourceFromObserverUnsafe,
} from "./intrusive-helpers.js";

/**
 * linkEdge: Safe linking of source and observer.
 *
 * Currently delegates to unsafe operation.
 * Future: Add DAG/cycle checks, duplicate detection here.
 *
 * Returns: void (operation always succeeds if graph invariants hold).
 */
export function linkEdge(
  observer: IReactiveNode,
  source: IReactiveNode
): void {
  linkSourceToObserverUnsafe(source, observer);
}

/**
 * unlinkEdge: Safe unlinking of source and observer.
 *
 * Requires both nodes to be provided (observer and source).
 * Precondition: they must be currently linked.
 */
export function unlinkEdge(
  observer: IReactiveNode,
  source: IReactiveNode
): void {
  unlinkSourceFromObserverUnsafe(source, observer);
}

// Export unsafe operations for benchmarking and internal use
export { linkSourceToObserverUnsafe, unlinkSourceFromObserverUnsafe };
export { unlinkAllObserversUnsafe, unlinkAllSourcesUnsafe } from "./intrusive-helpers.js";

