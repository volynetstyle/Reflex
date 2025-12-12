import { GraphEdge, GraphNode } from "./graph.node";

/**
 *
 *  linkSourceToObserverUnsafe
 *
 *
 * Creates a new directed edge:  source → observer
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
 * - source.lastOut === newly created edge
 * - observer.lastIn === newly created edge
 * - counts (outCount, inCount) are incremented
 *
 * Safety:
 * - No duplicate detection.
 * - No cycle detection.
 * - Caller is responsible for correctness.
 *
 * Complexity: O(1)
 */
export const linkSourceToObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): GraphEdge => {
  const e = new GraphEdge(source, observer);

  // ----- OUT adjacency (source → observer)
  const lastOut = source.lastOut;
  e.prevOut = lastOut;
  e.nextOut = null;

  if (lastOut === null) source.firstOut = e;
  else lastOut.nextOut = e;

  source.lastOut = e;
  source.outCount++;

  // ----- IN adjacency (source → observer)
  const lastIn = observer.lastIn;
  e.prevIn = lastIn;
  e.nextIn = null;

  if (lastIn === null) observer.firstIn = e;
  else lastIn.nextIn = e;

  observer.lastIn = e;
  observer.inCount++;

  return e;
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

  // ----- OUT adjacency unlink
  const prevOut = edge.prevOut;
  const nextOut = edge.nextOut;

  if (prevOut !== null) prevOut.nextOut = nextOut;
  else from.firstOut = nextOut;

  if (nextOut !== null) nextOut.prevOut = prevOut;
  else from.lastOut = prevOut;

  from.outCount--;

  // ----- IN adjacency unlink
  const prevIn = edge.prevIn;
  const nextIn = edge.nextIn;

  if (prevIn !== null) prevIn.nextIn = nextIn;
  else to.firstIn = nextIn;

  if (nextIn !== null) nextIn.prevIn = prevIn;
  else to.lastIn = prevIn;

  to.inCount--;

  // Cleanup (edge becomes detached and cannot be reused accidentally)
  edge.prevOut = edge.nextOut = null;
  edge.prevIn = edge.nextIn = null;
};

/**
 *
 *  unlinkSourceFromObserverUnsafe
 *
 *
 * Removes the *first* occurrence of an edge `source → observer`.
 * If no such edge exists, this is a no-op.
 *
 * Complexity: O(k), where k = out-degree of source.
 *
 * Safety:
 * - UNSAFE: no validation, no consistency checks.
 */
export const unlinkSourceFromObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): void => {
  let edge = source.firstOut;

  while (edge !== null) {
    if (edge.to === observer) {
      unlinkEdgeUnsafe(edge);
      return;
    }
    edge = edge.nextOut;
  }

  // No edge found — silently ignore.
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
 * Complexity: O(n), where n = observers.length
 * Allocates exactly one array and N edges.
 */
export const linkSourceToObserversBatchUnsafe = (
  source: GraphNode,
  observers: readonly GraphNode[],
): GraphEdge[] => {
  const n = observers.length;
  if (n === 0) return [];

  const edges = new Array<GraphEdge>(n);

  for (let i = 0; i < n; i++) {
    const observer = observers[i]!;
    edges[i] = linkSourceToObserverUnsafe(source, observer);
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
 * Complexity: O(k), where k = out-degree.
 */
export const unlinkAllObserversUnsafe = (source: GraphNode): void => {
  let edge = source.firstOut;

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
 * This avoids traversal inconsistencies when unlinking during iteration.
 * Recommended when removing many edges at once.
 */
export const unlinkAllObserversChunkedUnsafe = (source: GraphNode): void => {
  const count = source.outCount;
  if (count === 0) return;

  if (count === 1) {
    unlinkEdgeUnsafe(source.firstOut!);
    return;
  }

  const edges = new Array<GraphEdge>(count);

  let idx = 0;
  let edge = source.firstOut;

  while (edge !== null) {
    edges[idx++] = edge;
    edge = edge.nextOut;
  }

  for (let i = count - 1; i >= 0; i--) unlinkEdgeUnsafe(edges[i]!);
};

/**
 *
 *  unlinkAllSourcesChunkedUnsafe
 *
 *
 * Chunked reverse-unlinking for incoming edges.
 * Same rationale as unlinkAllObserversChunkedUnsafe.
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

  for (let i = count - 1; i >= 0; i--) unlinkEdgeUnsafe(edges[i]!);
};

/**
 *
 *  unlinkAllObserversBulkUnsafeForDisposal
 *
 *
 * Alias for the chunked unlink strategy.
 * Intended for "node disposal" operations where maximal unlink throughput
 * is required and edge order does not matter.
 */
export const unlinkAllObserversBulkUnsafeForDisposal = (
  source: GraphNode,
): void => {
  unlinkAllObserversChunkedUnsafe(source);
};

/**
 *
 *  hasSourceUnsafe
 *
 *
 * Returns true if an edge exists:
 *     source → observer
 *
 * Complexity: O(k), where k = out-degree of source.
 */
export const hasSourceUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): boolean => {
  let edge = source.firstOut;
  while (edge !== null) {
    if (edge.to === observer) return true;
    edge = edge.nextOut;
  }
  return false;
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
 * Complexity: O(k), where k = in-degree of observer.
 */
export const hasObserverUnsafe = (
  source: GraphNode,
  observer: GraphNode,
): boolean => {
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
 * Complexity: O(k), due to scan of oldSource's out-list.
 */
export const replaceSourceUnsafe = (
  oldSource: GraphNode,
  newSource: GraphNode,
  observer: GraphNode,
): void => {
  unlinkSourceFromObserverUnsafe(oldSource, observer);
  linkSourceToObserverUnsafe(newSource, observer);
};
