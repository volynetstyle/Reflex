import { NodeIndex, GraphNode, GraphEdge } from "./graph.node";
import {
  unlinkAllObserversBulkUnsafeForDisposal,
  unlinkAllSourcesChunkedUnsafe,
  linkSourceToObserverUnsafe,
  unlinkSourceFromObserverUnsafe,
  hasObserverUnsafe,
  hasSourceUnsafe,
  replaceSourceUnsafe,
} from "./graph.methods";

/**
 *  IGraph
 * =
 *
 * Low-level contract for managing the *structural* topology of the reactive DAG.
 *
 * This interface owns exactly one responsibility:
 *     — define, mutate, and traverse dependency edges between GraphNodes.
 *
 * IMPORTANT:
 * - No scheduler logic is allowed here.
 * - No phase/state logic (t/v/g/s) is allowed here.
 * - No memory or lifecycle logic (except edge unlinking).
 * - No business semantics, no reactivity semantics.
 *
 * IGraph is strictly a thin abstraction over intrusive adjacency lists in
 * GraphNode and GraphEdge. Implementations must remain allocation-free and
 * branch-minimal wherever possible.
 */
export interface IGraph {
  /**
   * Creates a new GraphNode bound to an already allocated NodeIndex
   * in the causal layout.
   *
   * The returned node owns its own adjacency lists but contains no edges yet.
   */
  createNode(layoutIndex: NodeIndex): GraphNode;

  /**
   * Completely detaches the node from the graph:
   * - removes all outgoing edges (node → observers)
   * - removes all incoming edges (sources → node)
   *
   * After this call, the node becomes structurally isolated but remains
   * a valid object. Memory reclamation or layout index recycling is *not*
   * handled here — this is the responsibility of Runtime/Layout/Ownership.
   */
  removeNode(node: GraphNode): void;

  /**
   * Creates a directed edge source → observer.
   * Implementations must not perform cycle detection or safety checks.
   * This operation must be O(1) and allocation-free except for the edge itself.
   */
  addObserver(source: GraphNode, observer: GraphNode): void;

  /**
   * Removes a directed edge source → observer, if it exists.
   * If the edge does not exist, the call must be a no-op.
   * Must be O(1) on average due to intrusive structure.
   */
  removeObserver(source: GraphNode, observer: GraphNode): void;

  /**
   * Iterates all observers of the given node:
   *     source → (observer1, observer2, ...)
   *
   * Must not allocate or materialize arrays. Must traverse the intrusive list.
   */
  forEachObserver(node: GraphNode, fn: (observer: GraphNode) => void): void;

  /**
   * Iterates all sources of the given node:
   *     (source1, source2, ...) → observer
   *
   * Must not allocate or materialize arrays. Must traverse the intrusive list.
   */
  forEachSource(node: GraphNode, fn: (source: GraphNode) => void): void;

  /**
   * Returns true if `observer` appears in the outgoing adjacency list of `source`.
   * Runtime complexity: O(k), where k = out-degree of source.
   */
  hasObserver(source: GraphNode, observer: GraphNode): boolean;

  /**
   * Returns true if `source` appears in the incoming adjacency list of `observer`.
   * Runtime complexity: O(k), where k = in-degree of observer.
   */
  hasSource(source: GraphNode, observer: GraphNode): boolean;

  /**
   * Atomically replaces a dependency edge:
   *     oldSource → observer   (removed)
   *     newSource → observer   (added)
   *
   * This is heavily used by reactive tracking and effect re-binding.
   */
  replaceSource(
    oldSource: GraphNode,
    newSource: GraphNode,
    observer: GraphNode,
  ): void;
}

/**
 *  GraphService (Optimized)
 * =
 *
 * Zero-overhead implementation of IGraph on top of intrusive adjacency lists.
 *
 * DESIGN GOALS:
 * - no internal state: the graph lives entirely inside GraphNode/GraphEdge
 * - minimal branching: all hot paths must remain predictable for V8
 * - no defensive checks: the caller is responsible for correctness
 * - O(1) edge insertion/removal (amortized)
 * - allocation-free traversal
 *
 * This service is intentionally low-level: it models *pure topology*.
 * Higher-level semantics (reactivity, scheduling, cleanup, batching)
 * belong to other runtime subsystems.
 */
export class GraphService implements IGraph {
  /**
   * Creates a new intrusive graph node bound to a specific layout index.
   *
   * The node starts with:
   * - empty incoming adjacency list
   * - empty outgoing adjacency list
   * - zero-degree in both directions
   *
   * No edges are implicitly created.
   */
  createNode = (layoutIndex: NodeIndex): GraphNode =>
    new GraphNode(layoutIndex);

  /**
   * Destroys all structural connectivity of the given node:
   *
   *   (1) Removes all edges node → observers  (outgoing)
   *   (2) Removes all edges sources → node   (incoming)
   *
   * After removal, the GraphNode becomes an isolated island.
   * Memory or layout cleanup must be handled elsewhere.
   */
  removeNode = (node: GraphNode): void => (
    unlinkAllObserversBulkUnsafeForDisposal(node),
    unlinkAllSourcesChunkedUnsafe(node)
  );

  /**
   * Creates a directed edge source → observer.
   * Implementations must not check for duplicates or cycles.
   */
  addObserver = (source: GraphNode, observer: GraphNode): GraphEdge =>
    linkSourceToObserverUnsafe(source, observer);

  /**
   * Removes the directed edge source → observer, if it exists.
   * Otherwise a no-op.
   */
  removeObserver = (source: GraphNode, observer: GraphNode): void =>
    unlinkSourceFromObserverUnsafe(source, observer);

  /**
   * Enumerates all observers of the given node.
   * This uses the intrusive linked list stored in GraphNode.
   * Complexity: O(k), where k = out-degree.
   * No allocations.
   */
  forEachObserver = (
    node: GraphNode,
    fn: (observer: GraphNode) => void,
  ): void => {
    for (let e = node.firstOut; e !== null; e = e.nextOut) fn(e.to);
  };

  /**
   * Enumerates all sources of the given node.
   * This uses the intrusive linked list stored in GraphNode.
   * Complexity: O(k), where k = in-degree.
   * No allocations.
   */
  forEachSource = (node: GraphNode, fn: (source: GraphNode) => void): void => {
    for (let e = node.firstIn; e !== null; e = e.nextIn) fn(e.from);
  };

  /**
   * Returns true iff observer is present in the outgoing adjacency list
   * of the source node.
   */
  hasObserver = (source: GraphNode, observer: GraphNode) =>
    hasObserverUnsafe(source, observer);

  /**
   * Returns true iff source is present in the incoming adjacency list
   * of the observer node.
   */
  hasSource = (source: GraphNode, observer: GraphNode): boolean =>
    hasSourceUnsafe(source, observer);

  /**
   * Re-binds the observer to a new source node.
   *
   * Useful for effect re-tracking in reactive runtimes:
   *
   *     oldSource → observer  (removed)
   *     newSource → observer  (added)
   *
   * Must remain O(1) amortized.
   */
  replaceSource = (
    oldSource: GraphNode,
    newSource: GraphNode,
    observer: GraphNode,
  ): void => replaceSourceUnsafe(oldSource, newSource, observer);
}
