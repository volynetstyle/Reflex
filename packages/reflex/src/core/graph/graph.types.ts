/**
 * @file ReactiveNode.ts
 *
 * Vertex = ReactiveNode.
 *
 * Represents a node in a directed acyclic graph (DAG)
 * Each vertex is an immutable computation unit:
 * it holds the result of a function depending on other vertices.
 *
 * Conceptually:
 *  - Inputs: upstream dependencies (edges in)
 *  - Outputs: downstream dependents (edges out)
 *  - Value: cached computation result
 *
 * Vertices are immutable; updates produce new versions,
 * allowing structural sharing and time-travel debugging.
 */

import { IDisposable } from "../object/object.dispose";
import { BitMask } from "../object/utils/bitwise";

/**
 * Base interface for all reactive graph nodes.
 * Each node tracks its internal state through bit flags and epoch.
 *
 *  - `_flags`: bitmask representing node state (dirty, disposed, scheduled, etc.)
 *  - `_epoch`: version counter used for dependency resolution or cache invalidation
 */
interface GraphNode {
  _flags: BitMask;
  _epoch: number;
  _value?: unknown;
}

export const enum NodeFlags {
  CLEAN = 0,
  DIRTY = 1 << 0,
  DISPOSED = 1 << 1,
  SCHEDULED = 1 << 2,
  RUNNING = 1 << 3,
}

type EdgeDirection = "up" | "down";

interface EdgeList<T, D extends EdgeDirection> extends Array<T> {
  readonly _traverse?: D;
}

/**
 * A reactive source node — an origin of data or signal.
 * It can notify multiple observers when its value changes.
 *
 *  - `_observers`: list of dependent observer nodes (subscribers)
 */
export interface Source extends GraphNode {
  /** Downstream connections — observers subscribed to this source. */
  _observers: EdgeList<Observer, "down"> | null;
}

/**
 * A reactive observer node — a computation depending on one or more sources.
 * Observers track their upstream dependencies and react to their updates.
 *
 *  - `_sources`: list of source nodes this observer depends on
 *    may queue or immediately propagate changes depending on runtime strategy
 */
export interface Observer extends GraphNode {
  /** Upstream connections — sources this observer depends on. */
  _sources: EdgeList<Source, "up"> | null;
}

/**
 * Core operations for managing vertices and edges
 * in a reactive dependency graph (DAG).
 *
 * These methods define the lifecycle of connections,
 * traversal, and invalidation logic for nodes.
 */
export interface GraphOperations<TVertex extends GraphNode> extends IDisposable {
  /**
   * Connects the given vertex as a dependency (edge in).
   * Returns true if the connection was new, false if already linked.
   */
  connect(target: TVertex): boolean;

  /**
   * Disconnects the given vertex (or all if undefined).
   * Used during disposal or dependency re-evaluation.
   */
  disconnect(target?: TVertex): void;

  /**
   * Marks this vertex and its dependents as dirty.
   * Used when source data changes and caches must be invalidated.
   */
  markDirty(mask?: BitMask): void;

  /**
   * Propagates state changes to all downstream observers.
   * Usually delegates to RuntimeContext.scheduleUpdate().
   */
  notifyObservers(mask?: BitMask): void;

  /**
   * Registers this vertex as an observer of another vertex (edge out).
   */
  addSource(source: TVertex): void;

  /**
   * Removes the given source vertex from dependency list (edge removal).
   */
  removeSource(source: TVertex): void;

  /**
   * Performs a depth-first traversal of dependents or dependencies.
   * Useful for diagnostics or incremental updates.
   */
  traverse(direction: EdgeDirection, visitor: (v: TVertex) => void): void;

  /**
   * Returns true if this vertex has no active dependencies or dependents.
   */
  isIsolated(): boolean;

  /**
   * Clears internal state and breaks all edges.
   * Called during disposal or garbage collection.
   */
  dispose(): void;

  /**
   * Optionally recomputes this vertex value if dirty.
   * May trigger cascading updates depending on RuntimeContext.
   */
  updateDirtyValues(): void;
}

/**
 * RuntimeContext manages scheduling and execution of graph updates.
 * It defines how updates are propagated and committed.
 *
 *  - `scheduleUpdate(node)`: enqueue node updates for later processing
 *  - `commitTransition?(node)`: optional hook for transactional or batched updates
 */
export interface RuntimeContext {
  scheduleUpdate(node: GraphNode): void;
  commitTransition?(node: GraphNode): void;
}
