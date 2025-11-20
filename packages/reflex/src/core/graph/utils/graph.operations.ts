/**
 * @file graph.proto.ts
 *
 * Prototype methods for GraphNode (instance API).
 *
 * High-level interface for graph operations.
 * These wrap the low-level linker functions.
 *
 * Note: In the new architecture, GraphNode is a regular class,
 * so methods are defined directly, not via prototype.
 * This file is kept for compatibility and documentation.
 *
 * Actual methods are defined on GraphNode in graph.types.ts.
 * If needed, we can expose these as static helpers or extend the class.
 */

import { IReactiveNode } from "../graph.types";
import { linkEdge, unlinkEdge } from "./graph.linker";

/**
 * Convenience methods (static or instance) for graph operations.
 *
 * Usage:
 *   observer.addSource(source)     -> links source as observer's upstream
 *   observer.removeSource(source)  -> unlinks source
 */

/**
 * Static helper: link source and observer (observer depends on source).
 */
export function addSourceToObserver(
  observer: IReactiveNode,
  source: IReactiveNode
): void {
  linkEdge(observer, source);
}

/**
 * Static helper: unlink source and observer.
 */
export function removeSourceFromObserver(
  observer: IReactiveNode,
  source: IReactiveNode
): void {
  unlinkEdge(observer, source);
}

/**
 * Static helper: add observer to a source (observer depends on source).
 * Alias for addSourceToObserver for semantic clarity.
 */
export function addObserverToSource(
  observer: IReactiveNode,
  source: IReactiveNode
): void {
  linkEdge(observer, source);
}

/**
 * Static helper: remove observer from source.
 * Alias for removeSourceFromObserver for semantic clarity.
 */
export function removeObserverFromSource(
  observer: IReactiveNode,
  source: IReactiveNode
): void {
  unlinkEdge(observer, source);
}
