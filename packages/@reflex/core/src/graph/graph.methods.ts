import { GraphEdge, GraphNode } from "./graph.node";

/**
 *
 *  linkSourceToObserverUnsafe
 *
 *
 * Creates a new directed edge:  source → observer
 *
 * OPTIMIZATION: Fast duplicate detection via lastOut + nextOut check (O(1))
 * Similar to Vue 3.5's Link approach with depsTail optimization.
 *
 * This function mutates *two* intrusive doubly-linked adjacency lists:
 *
 *   OUT list of source:
 *       source.firstOut → ... → source.lastOut → (new edge)
 *
 *   IN list of observer:
 *       observer.firstIn → ... → observer.lastIn → (new edge)
 *
 * Invariants after insertion:
 * - source.lastOut === newly created edge (or existing if duplicate)
 * - observer.lastIn === newly created edge (or existing if duplicate)
 * - counts (outCount, inCount) are incremented only for new edges
 *
 * Safety:
 * - Fast duplicate check via lastOut (covers 90%+ of real-world cases)
 * - No full list scan unless necessary
 * - Caller is responsible for logical correctness
 *
 * Complexity: O(1) for duplicate detection hot path, O(1) for insertion
 */

export const linkSourceToObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): GraphEdge => {
  const lastOut = source.lastOut;

  if (lastOut !== null && lastOut.to === observer) {
    return lastOut;
  }

  ++observer.inCount;
  ++source.outCount;

  const lastIn = observer.lastIn;

  const edge: GraphEdge = new GraphEdge(
    source,
    observer,
    lastOut,
    null,
    lastIn,
    null,
  );
  
  observer.lastIn = source.lastOut = edge;

  if (lastOut !== null) {
    lastOut.nextOut = edge;
  } else {
    source.firstOut = edge;
  }

  if (lastIn !== null) {
    lastIn.nextIn = edge;
  } else {
    observer.firstIn = edge;
  }

  return edge;
};
/**
 *
 *  unlinkEdgeUnsafe
 *
 *
 * Removes a single directed edge from *both*
 * intrusive adjacency lists:
 *
 *   OUT list of edge.from
 *   IN  list of edge.to
 *
 * OPTIMIZATION: This is already O(1) - accepts edge directly like Vue's unlink(link).
 * The key is that callers should store edge references to avoid search.
 *
 * Invariants after unlink:
 * - All list pointers remain consistent.
 * - Counts of both nodes are decremented.
 * - Edge's own pointers are nulled for safety / GC friendliness.
 *
 * Safety:
 * - Caller guarantees that 'edge' is present in both lists.
 *
 * Complexity: O(1)
 */
export const unlinkEdgeUnsafe = (edge: GraphEdge): void => {
  const from = edge.from;
  const to = edge.to;

  if (edge.prevOut) {
    edge.prevOut.nextOut = edge.nextOut;
  } else {
    from.firstOut = edge.nextOut; // Was head
  }
  if (edge.nextOut) {
    edge.nextOut.prevOut = edge.prevOut;
  } else {
    from.lastOut = edge.prevOut; // Was tail
  }

  // Unlink from in-list
  if (edge.prevIn) {
    edge.prevIn.nextIn = edge.nextIn;
  } else {
    to.firstIn = edge.nextIn; // Was head
  }
  if (edge.nextIn) {
    edge.nextIn.prevIn = edge.prevIn;
  } else {
    to.lastIn = edge.prevIn; // Was tail
  }

  --to.inCount;
  --from.outCount;

  edge.prevOut = edge.nextOut = edge.prevIn = edge.nextIn = null;
};

/**
 *
 *  unlinkSourceFromObserverUnsafe
 *
 *
 * Removes the *first* occurrence of an edge `source → observer`.
 * If no such edge exists, this is a no-op.
 *
 * OPTIMIZATION: Check lastOut first before full scan (O(1) fast path).
 * This matches the optimization in linkSourceToObserverUnsafe.
 *
 * NOTE: For best performance, callers should use unlinkEdgeUnsafe directly
 * when they have the edge reference (like Vue does with Link).
 *
 * Complexity: O(1) best case (lastOut match), O(k) worst case where k = out-degree
 *
 * Safety:
 * - UNSAFE: no validation, no consistency checks.
 */
export const unlinkSourceFromObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): void => {
  // Fast path: check tail first (most recent)
  const lastOut = source.lastOut;
  if (lastOut !== null && lastOut.to === observer) {
    unlinkEdgeUnsafe(lastOut);
    return;
  }

  // Slow path: scan list
  let edge = source.firstOut;
  while (edge !== null) {
    if (edge.to === observer) {
      unlinkEdgeUnsafe(edge);
      return;
    }
    edge = edge.nextOut;
  }
};

/**
 *
 *  linkSourceToObserversBatchUnsafe
 *
 *
 * Bulk version of adding multiple edges:
 *    source → observer[i]
 *
 * Returns an array of created edges.
 *
 * OPTIMIZATION: Pre-allocates array with exact size for V8 shape stability.
 * Each link still benefits from O(1) duplicate detection.
 *
 * Complexity: O(n), where n = observers.length
 * Allocates exactly one array and up to N edges (fewer if duplicates exist).
 */
export const linkSourceToObserversBatchUnsafe = (
  source: GraphNode,
  observers: readonly GraphNode[],
): GraphEdge[] => {
  const n = observers.length;

  // Fast path: empty array
  if (n === 0) return [];

  // Fast path: single observer
  if (n === 1) {
    return [linkSourceToObserverUnsafe(source, observers[0]!)];
  }

  // Pre-allocate exact size for PACKED_ELEMENTS
  const edges = new Array<GraphEdge>(n);

  // Sequential access (hardware prefetcher optimization)
  for (let i = 0; i < n; i++) {
    edges[i] = linkSourceToObserverUnsafe(source, observers[i]!);
  }

  return edges;
};

/**
 *
 *  unlinkAllObserversUnsafe
 *
 *
 * Removes *all* outgoing edges from the given node:
 *     node → observer*
 *
 * This is the simple single-pass version. Mutations happen during traversal.
 *
 * OPTIMIZATION: Reads nextOut before unlinking to avoid stale pointer.
 * No additional allocations.
 *
 * Complexity: O(k), where k = out-degree.
 */
export const unlinkAllObserversUnsafe = (source: GraphNode): void => {
  let edge = source.firstOut;

  // Simple forward iteration
  while (edge !== null) {
    const next = edge.nextOut;
    unlinkEdgeUnsafe(edge);
    edge = next;
  }
};

/**
 *
 *  unlinkAllSourcesUnsafe
 *
 *
 * Removes *all* incoming edges to the given node:
 *     source* → node
 *
 * OPTIMIZATION: Same as unlinkAllObserversUnsafe - single pass, no allocations.
 *
 * Complexity: O(k), where k = in-degree.
 */
export const unlinkAllSourcesUnsafe = (observer: GraphNode): void => {
  let edge = observer.firstIn;

  while (edge !== null) {
    const next = edge.nextIn;
    unlinkEdgeUnsafe(edge);
    edge = next;
  }
};

/**
 *
 *  unlinkAllObserversChunkedUnsafe
 *
 *
 * Two-pass version of unlinking:
 *   (1) Snapshot edges into an array
 *   (2) Unlink them in reverse order
 *
 * OPTIMIZATION: Fast path for count <= 1 (no allocation needed).
 * Pre-allocates exact array size for count > 1.
 *
 * This avoids traversal inconsistencies when unlinking during iteration.
 * Recommended when removing many edges at once or when order matters.
 *
 * Complexity: O(k) time, O(k) space where k = out-degree
 */
export const unlinkAllObserversChunkedUnsafe = (source: GraphNode): void => {
  const count = source.outCount;

  // Fast path: empty (most common after cleanup)
  if (count === 0) return;

  // Fast path: single edge (no allocation needed)
  if (count === 1) {
    unlinkEdgeUnsafe(source.firstOut!);
    return;
  }

  // Snapshot edges into pre-sized array
  const edges = new Array<GraphEdge>(count);
  let idx = 0;
  let edge = source.firstOut;

  while (edge !== null) {
    edges[idx++] = edge;
    edge = edge.nextOut;
  }

  // Reverse iteration (better for stack-like cleanup)
  // V8 optimizes countdown loops better
  for (let i = count - 1; i >= 0; i--) {
    unlinkEdgeUnsafe(edges[i]!);
  }
};

/**
 *
 *  unlinkAllSourcesChunkedUnsafe
 *
 *
 * Chunked reverse-unlinking for incoming edges.
 * Same rationale and optimizations as unlinkAllObserversChunkedUnsafe.
 *
 * Complexity: O(k) time, O(k) space where k = in-degree
 */
export const unlinkAllSourcesChunkedUnsafe = (observer: GraphNode): void => {
  const count = observer.inCount;

  if (count === 0) return;

  if (count === 1) {
    unlinkEdgeUnsafe(observer.firstIn!);
    return;
  }

  const edges = new Array<GraphEdge>(count);
  let idx = 0;
  let edge = observer.firstIn;

  while (edge !== null) {
    edges[idx++] = edge;
    edge = edge.nextIn;
  }

  for (let i = count - 1; i >= 0; i--) {
    unlinkEdgeUnsafe(edges[i]!);
  }
};

/**
 * hasSourceUnsafe - V8 OPTIMIZED
 *
 * OPTIMIZATIONS:
 * 1. Fast path check (lastOut)
 * 2. Early return for hit (reduces branch mispredicts)
 * 3. Monomorphic loop pattern
 */
export const hasSourceUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): boolean => {
  const lastOut = source.lastOut;
  if (lastOut !== null && lastOut.to === observer) {
    return true;
  }

  let edge = source.firstOut;
  while (edge !== null) {
    if (edge.to === observer) return true;
    edge = edge.nextOut;
  }

  return false;
};

/**
 *
 *  unlinkAllObserversBulkUnsafeForDisposal
 *
 *
 * Alias for the chunked unlink strategy.
 * Intended for "node disposal" operations where maximal unlink throughput
 * is required and edge order does not matter.
 *
 * Uses chunked approach for stability during bulk mutations.
 */
export const unlinkAllObserversBulkUnsafeForDisposal = (
  source: GraphNode,
): void => {
  unlinkAllObserversChunkedUnsafe(source);
};

/**
 *
 *  hasObserverUnsafe
 *
 *
 * Returns true if an edge exists:
 *     source → observer
 *
 * But traversing the IN-list of the observer.
 *
 * OPTIMIZATION: Check lastIn first before full scan (O(1) fast path).
 *
 * Complexity: O(1) best case, O(k) worst case where k = in-degree
 */
export const hasObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): boolean => {
  const lastIn = observer.lastIn;
  if (lastIn !== null && lastIn.from === source) {
    return true;
  }

  let edge = observer.firstIn;
  while (edge !== null) {
    if (edge.from === source) return true;
    edge = edge.nextIn;
  }

  return false;
};

/**
 *
 *  replaceSourceUnsafe
 *
 *
 * Performs an atomic rebinding of a dependency:
 *
 *     oldSource → observer   (removed)
 *     newSource → observer   (added)
 *
 * Used during reactive effect re-tracking.
 *
 * OPTIMIZATION: Both unlink and link use lastOut fast path.
 * If oldSource's edge to observer is at lastOut, unlink is O(1).
 * Link to newSource is O(1) if no duplicate exists.
 *
 * Complexity: O(1) best case, O(k) worst case due to potential scan
 */
export const replaceSourceUnsafe = (
  oldSource: GraphNode,
  newSource: GraphNode,
  observer: GraphNode,
): void => {
  unlinkSourceFromObserverUnsafe(oldSource, observer);
  linkSourceToObserverUnsafe(newSource, observer);
};
