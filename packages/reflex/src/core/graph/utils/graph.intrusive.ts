/**
 * @file intrusive-helpers.ts
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
 *  * Invariants preserved:
 *  - Bi-directional symmetry (Source ⇄ Observer)
 *  - Single-slot rule
 *  - List consistency
 */

import { IReactiveNode } from "../graph.node";

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
 */
export function linkSourceToObserverUnsafe(
  source: IReactiveNode,
  observer: IReactiveNode,
): void {
  // DEV ONLY //
  // if (source._nextSource !== null || source._prevSource !== null) {
  //   throw new Error("source is already in a sources list");
  // }

  // if (observer._nextObserver !== null || observer._prevObserver !== null) {
  //   throw new Error("observer is already in an observers list");
  // }

  const lastSource = observer._lastSource;

  if (lastSource === null) {
    observer._firstSource = source;
    source._prevSource = null;
  } else {
    lastSource._nextSource = source;
    source._prevSource = lastSource;
  }

  observer._lastSource = source;
  source._nextSource = null;
  ++observer._sourceCount;

  const lastObserver = source._lastObserver;

  if (lastObserver === null) {
    source._firstObserver = observer;
    observer._prevObserver = null;
  } else {
    lastObserver._nextObserver = observer;
    observer._prevObserver = lastObserver;
  }

  source._lastObserver = observer;
  observer._nextObserver = null;
  ++source._observerCount;
}

/**
 * unlinkSourceFromObserverUnsafe: Remove a source from an observer's sources list.
 *
 * This modifies TWO intrusive lists simultaneously:
 *  1. Removes source from observer's sources chain
 *  2. Removes observer from source's observers chain
 *
 * Prerequisites (not checked):
 *  - source and observer are linked (caller must ensure)
 *  - source._prevSource/nextSource are valid or null
 *  - observer._prevObserver/nextObserver are valid or null
 */
export function unlinkSourceFromObserverUnsafe(
  source: IReactiveNode,
  observer: IReactiveNode,
): void {
  // DEV ONLY //
  // if (
  //   (source._prevSource && source._prevSource._nextSource !== source) ||
  //   (source._nextSource && source._nextSource._prevSource !== source)
  // ) {
  //   throw new Error("Source pointers corrupted");
  // }

  const prevSource = source._prevSource;
  const nextSource = source._nextSource;

  if (prevSource !== null) {
    prevSource._nextSource = nextSource;
  } else {
    observer._firstSource = nextSource;
  }

  if (nextSource !== null) {
    nextSource._prevSource = prevSource;
  } else {
    observer._lastSource = prevSource;
  }

  source._prevSource = null;
  source._nextSource = null;
  --observer._sourceCount;

  const prevObserver = observer._prevObserver;
  const nextObserver = observer._nextObserver;

  if (prevObserver !== null) {
    prevObserver._nextObserver = nextObserver;
  } else {
    source._firstObserver = nextObserver;
  }

  if (nextObserver !== null) {
    nextObserver._prevObserver = prevObserver;
  } else {
    source._lastObserver = prevObserver;
  }

  observer._prevObserver = null;
  observer._nextObserver = null;
  --source._observerCount;
}

/**
 * unlinkAllObserversUnsafe: Remove all observers from a source node.
 *
 * Iterates linearly through the observers list, unlinking each observer.
 * This is cache-friendly: linear traversal instead of random pointer chasing.
 *
 * Useful for cleanup or when a source node is being disposed.
 */
export function unlinkAllObserversUnsafe(source: IReactiveNode): void {
  let observer = source._firstObserver;

  while (observer !== null) {
    const nextObserver = observer._nextObserver;
    unlinkSourceFromObserverUnsafe(source, observer);
    observer = nextObserver;
  }
}

/**
 * unlinkAllSourcesUnsafe: Remove all sources from an observer node.
 *
 * Iterates linearly through the sources list, unlinking each source.
 * Cache-friendly alternative to random unlinks.
 */
export function unlinkAllSourcesUnsafe(observer: IReactiveNode): void {
  let source = observer._firstSource;

  while (source !== null) {
    const nextSource = source._nextSource;
    unlinkSourceFromObserverUnsafe(source, observer);
    source = nextSource;
  }
}
