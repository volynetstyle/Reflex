/**
 * @file ReactiveNode.ts
 *
 * Runtime definitions for the Reflex reactive graph.
 *
 * A ReactiveNode represents a vertex in a directed acyclic graph (DAG).
 * Each vertex has:
 *  - upstream sources   (edges that this node depends on)
 *  - downstream observers (edges that depend on this node)
 *  - execution function (observer) for recomputation
 *  - cached value (valueRaw)
 *  - fast runtime state (flags, counters, async epoch)
 *
 * The vertex identity is stable. Runtime state mutates in-place.
 * Logical versions are tracked via Uint32Array counters, not by cloning nodes.
 *
 * This provides:
 *  - deterministic incremental updates
 *  - O(1) graph mutations (intrusive lists)
 *  - zero allocations on dependency tracking
 *  - engine-friendly memory layout
 */
import { BitMask } from "../object/utils/bitwise.js";

/*
 * Node Categories
 * ReactiveNodeKind marks the semantic role of a vertex.
 * This does NOT affect graph topology, only execution semantics.
 *  */
type ReactiveNodeKind =
  | "source" // Stores a raw value; no internal computation
  | "computation" // Computes derived values from upstream sources
  | "effect"; // Executes side effects; valueRaw is unused

/*
 * Observer function executed by computation/effect nodes.
 * Must never mutate graph topology during its execution.
 * (scheduler enforces this invariant)
 *  */
interface IObserverFn {
  (): void;
}

/*
 * SourceLink: intrusive list element representing
 * "node depends on source".
 *
 * Stored in node._sources (observer → its upstream).
 *
 * Invariant:
 *  - A node can depend on multiple sources.
 *  - Each dependency is represented by a separate link object.
 *  */
interface ISourceLink {
  _prev: ISourceLink | null;
  _next: ISourceLink | null;
  _pair: IObserverLink;

  /** The upstream source node for this dependency edge. */
  source: IReactiveNode;
}

/*
 * ObserverLink: intrusive list element representing
 * "source notifies observer".
 *
 * Stored in node._observers (source → its downstream).
 *
 * Invariant:
 *  - A source may have many observers.
 *  - Each observer relationship uses its own link object.
 * */
interface IObserverLink {
  _prev: IObserverLink | null;
  _next: IObserverLink | null;
  _pair: ISourceLink;

  /** The downstream observer that depends on this source. */
  observer: IReactiveNode;
}

/**
 * IReactiveNode: primary vertex structure for the reactive graph.
 *
 * MUTABLE FIELDS:
 *   _valueRaw   - cached value for signals and computations
 *   _sources    - intrusive linked list of upstream edges
 *   _observers  - intrusive linked list of downstream edges
 *   _observer   - execution callback (computation/effect)
 *   _counters   - [epoch, version, uversion]
 *   _async      - [generation, token]
 *   _flags      - dirty/clean/scheduled etc.
 *   _kind       - semantic classification (source/computation/effect)
 *
 * Topological invariants:
 *   1. Node participates in two lists: upstream and downstream.
 *   2. Each edge is represented by a link object; nodes store list heads.
 *   3. Add/remove edge must be O(1).
 *   4. Never mutate upstream and downstream lists within same execution frame.
 *   5. No cycles (DAG).
 *   6. Node identity = pointer identity.
 *   7. After unlink: link._prev/_next reset to null.
 *   8. List heads are null OR a valid link, but NOT undefined.
 *   9. Graph is not mutated while an observer callback is running.
 */
interface IReactiveNode {
  /** Cached runtime value (raw JS value). */
  _valueRaw: unknown;
  /** Head of intrusive linked list of upstream dependencies. */
  _sources: ISourceLink | null;
  /** Head of intrusive linked list of downstream observers. */
  _observers: IObserverLink | null;
  /** Execution callback for computations/effects. Null for pure sources. */
  _observer: IObserverFn | null;
  /** Runtime version counters: [epoch, version, uversion]. */
  _counters: Uint32Array;
  /** Async tracking: [generation, token]. */
  _async: Uint32Array;
  /** Combined bitmask: dirty/scheduled/running/kind bits. */
  _flags: BitMask;
  /** Semantic role of this node. */
  _kind: ReactiveNodeKind;
}

/*
 * ReactiveValue<T>
 *
 * Public-facing handle for user-level signals.
 * It wraps an underlying IReactiveNode.
 *
 * Callable form:
 *    value()                    → get current value
 *    value(newValue)            → set
 *    value(prev => next)        → functional update
 *
 * No additional state is stored here. Everything lives in _node.
 *  */

interface IReactiveValue<T = unknown> {
  (): T;
  (next: T | ((prev: T) => T)): void;

  /** Reference to the backing graph node. */
  readonly _node: IReactiveNode;
}

export type {
  IObserverFn,
  IReactiveNode,
  IReactiveValue,
  ISourceLink,
  IObserverLink,
  ReactiveNodeKind,
};
