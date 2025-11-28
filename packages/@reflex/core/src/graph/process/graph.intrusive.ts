/**
 * @file graph.intrusive.ts
 *
 * Low-level helpers for intrusive doubly-linked list operations.
 * Works directly with GraphNode fields (_first*, _last*, _next*, _prev*).
 *
 * These functions are UNSAFE:
 *  - No validation of graph invariants
 *  - No cycle detection
 *  - No duplicate edge checks
 * Use them only in hot paths or wrap with higher-level API for safety checks.
 *
 * Invariants preserved:
 *  - Bi-directional symmetry (Source ⇄ Observer)
 *  - Single-slot rule
 *  - List consistency
 *  - Count accuracy (_sourceCount/_observerCount)
 *
 * Performance optimizations:
 *  - Inlined pointer arithmetic
 *  - Minimized null checks via early returns
 *  - Cache-friendly sequential traversal
 *  - Zero allocations (all operations mutate in-place)
 */

import { GraphNode } from "../graph.node";

/**
 * linkSourceToObserverUnsafe: Add a source node to an observer's sources list.
 *
 * This modifies TWO intrusive lists simultaneously:
 *  1. Adds source to observer._firstSource...lastSource chain
 *  2. Adds observer to source._firstObserver...lastObserver chain
 *
 * Operates directly on GraphNode pointers, no allocations.
 * O(1) amortized (always appends to tail).
 *
 * Prerequisites (not checked):
 *  - source and observer are distinct GraphNode instances
 *  - edge does not already exist (caller must ensure)
 *  - no cycles (caller must ensure DAG invariant)
 *  - source is not already in any sources list
 *  - observer is not already in any observers list
 *
 * Invariants maintained:
 *  - Doubly-linked list consistency (prev ⇄ next symmetry)
 *  - Boundary pointers (_first/_last) correctness
 *  - Count increments atomic with link operations
 */
export function linkSourceToObserverUnsafe(
  source: GraphNode,
  observer: GraphNode,
): void {
  const lastSource = observer._lastSource;

  // Setup source's backward link
  source._prevSource = lastSource;
  source._nextSource = null; // Always append to tail

  if (lastSource === null) {
    // Empty list: source becomes first AND last
    observer._firstSource = source;
  } else {
    // Non-empty: append after current last
    lastSource._nextSource = source;
  }

  // Update tail pointer and count
  observer._lastSource = source;
  ++observer._sourceCount;

  const lastObserver = source._lastObserver;

  // Setup observer's backward link
  observer._prevObserver = lastObserver;
  observer._nextObserver = null; // Always append to tail

  if (lastObserver === null) {
    // Empty list: observer becomes first AND last
    source._firstObserver = observer;
  } else {
    // Non-empty: append after current last
    lastObserver._nextObserver = observer;
  }

  // Update tail pointer and count
  source._lastObserver = observer;
  ++source._observerCount;
}

/**
 * unlinkSourceFromObserverUnsafe: Remove a source from an observer's sources list.
 *
 * This modifies TWO intrusive lists simultaneously:
 *  1. Removes source from observer's sources chain
 *  2. Removes observer from source's observers chain
 *
 * O(1) operation regardless of list size.
 *
 * Prerequisites (not checked):
 *  - source and observer are currently linked
 *  - source is in observer's sources list
 *  - observer is in source's observers list
 *  - pointer consistency already established
 *
 * Invariants maintained:
 *  - Doubly-linked list remains consistent after removal
 *  - Boundary pointers updated when removing first/last nodes
 *  - Removed nodes have null pointers (ready for re-linking)
 *  - Counts decremented atomically with unlink
 */
export function unlinkSourceFromObserverUnsafe(
  source: GraphNode,
  observer: GraphNode,
): void {
  const prevSource = source._prevSource;
  const nextSource = source._nextSource;

  // Update forward link (prev → next)
  if (prevSource !== null) {
    prevSource._nextSource = nextSource;
  } else {
    // source was first: update head pointer
    observer._firstSource = nextSource;
  }

  // Update backward link (next ← prev)
  if (nextSource !== null) {
    nextSource._prevSource = prevSource;
  } else {
    // source was last: update tail pointer
    observer._lastSource = prevSource;
  }

  // Clear source's links (ready for reuse/GC)
  source._prevSource = null;
  source._nextSource = null;
  --observer._sourceCount;

  const prevObserver = observer._prevObserver;
  const nextObserver = observer._nextObserver;

  // Update forward link (prev → next)
  if (prevObserver !== null) {
    prevObserver._nextObserver = nextObserver;
  } else {
    // observer was first: update head pointer
    source._firstObserver = nextObserver;
  }

  // Update backward link (next ← prev)
  if (nextObserver !== null) {
    nextObserver._prevObserver = prevObserver;
  } else {
    // observer was last: update tail pointer
    source._lastObserver = prevObserver;
  }

  // Clear observer's links (ready for reuse/GC)
  observer._prevObserver = null;
  observer._nextObserver = null;
  --source._observerCount;
}

/**
 * unlinkAllObserversUnsafe: Remove all observers from a source node.
 *
 * Iterates linearly through the observers list, unlinking each observer.
 * O(n) where n = number of observers.
 *
 * Performance characteristics:
 *  - Cache-friendly: linear traversal (no random pointer chasing)
 *  - Minimizes register pressure: only 2 temps needed
 *  - Avoids recursion: purely iterative
 *
 * Invariants maintained:
 *  - All observers fully unlinked (bidirectional)
 *  - Source's observer list empty (_firstObserver = null)
 *  - Source's _observerCount = 0
 *  - Each observer's source list updated correctly
 *
 * Useful for:
 *  - Cleanup when source is disposed
 *  - Batch unsubscribe operations
 *  - Graph pruning
 */
export function unlinkAllObserversUnsafe(source: GraphNode): void {
  let observer = source._firstObserver;

  while (observer !== null) {
    // Cache next pointer BEFORE unlinking (unlink clears it)
    const nextObserver = observer._nextObserver;

    // Unlink will clear observer's pointers and decrement counts
    unlinkSourceFromObserverUnsafe(source, observer);

    // Move to next
    observer = nextObserver;
  }

  // Post-condition: source._observerCount should be 0
  // Post-condition: source._firstObserver should be null
  // Post-condition: source._lastObserver should be null
  // (All handled by unlinkSourceFromObserverUnsafe loop)
}

/**
 * unlinkAllSourcesUnsafe: Remove all sources from an observer node.
 *
 * Iterates linearly through the sources list, unlinking each source.
 * O(n) where n = number of sources.
 *
 * Performance characteristics:
 *  - Cache-friendly: sequential memory access pattern
 *  - Minimal branching: single loop with predictable branches
 *  - Zero allocations: all mutations in-place
 *
 * Invariants maintained:
 *  - All sources fully unlinked (bidirectional)
 *  - Observer's source list empty (_firstSource = null)
 *  - Observer's _sourceCount = 0
 *  - Each source's observer list updated correctly
 *
 * Useful for:
 *  - Cleanup when observer is disposed
 *  - Batch unsubscribe from all dependencies
 *  - Graph node isolation
 */
export function unlinkAllSourcesUnsafe(observer: GraphNode): void {
  let source = observer._firstSource;

  while (source !== null) {
    // Cache next pointer BEFORE unlinking (unlink clears it)
    const nextSource = source._nextSource;

    // Unlink will clear source's pointers and decrement counts
    unlinkSourceFromObserverUnsafe(source, observer);

    // Move to next
    source = nextSource;
  }

  // Post-condition: observer._sourceCount should be 0
  // Post-condition: observer._firstSource should be null
  // Post-condition: observer._lastSource should be null
  // (All handled by unlinkSourceFromObserverUnsafe loop)
}

/**
 * replaceSourceUnsafe: Atomically swap one source for another.
 *
 * Equivalent to:
 *   unlinkSourceFromObserverUnsafe(oldSource, observer)
 *   linkSourceToObserverUnsafe(newSource, observer)
 *
 * But potentially more efficient if position needs to be preserved.
 * Current implementation: simple sequence (position not preserved).
 *
 * Use when: observer needs to change dependency atomically.
 */
export function replaceSourceUnsafe(
  oldSource: GraphNode,
  newSource: GraphNode,
  observer: GraphNode,
): void {
  unlinkSourceFromObserverUnsafe(oldSource, observer);
  linkSourceToObserverUnsafe(newSource, observer);
}

/**
 * hasSourceUnsafe: Check if observer depends on source.
 *
 * Linear scan through observer's sources list.
 * O(n) where n = observer._sourceCount.
 *
 * Use sparingly in hot paths. Better to maintain separate tracking
 * if frequent lookups are needed (e.g., Map<GraphNode, boolean>).
 */
export function hasSourceUnsafe(
  source: GraphNode,
  observer: GraphNode,
): boolean {
  let current = observer._firstSource;

  while (current !== null) {
    if (current === source) return true;
    current = current._nextSource;
  }

  return false;
}

/**
 * hasObserverUnsafe: Check if source is observed by observer.
 *
 * Linear scan through source's observers list.
 * O(n) where n = source._observerCount.
 *
 * Same performance caveat as hasSourceUnsafe.
 */
export function hasObserverUnsafe(
  source: GraphNode,
  observer: GraphNode,
): boolean {
  let current = source._firstObserver;

  while (current !== null) {
    if (current === observer) return true;
    current = current._nextObserver;
  }

  return false;
}
