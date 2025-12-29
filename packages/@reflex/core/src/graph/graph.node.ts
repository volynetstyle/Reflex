import { CausalCoords } from "../storage/config/CausalCoords";

type NodeIndex = number;

/**
 * Sentinel object used as a temporary default during node construction.
 * Avoids allocating a new CausalRoot for every node when a custom one isn't provided.
 */
const TMP_SENTINEL = new (class CausalRoot implements CausalCoords {
  t = 0;
  v = 0;
  p = 0;
  s = 0;
})();

const ROOT_SHAPE: CausalCoords = { t: 0, v: 0, p: 0, s: 0 };

/**
 * GraphEdge represents a directed, intrusive, bi-directional connection between two GraphNodes.
 *
 * It participates in two separate doubly-linked lists:
 *   - OUT-list: chained from the source node's outgoing edges (dependencies → observers)
 *   - IN-list:  chained from the observer node's incoming edges (dependents → source)
 *
 * All mutations (link/unlink) are O(1) and require no additional metadata.
 *
 * Memory layout is carefully grouped for cache locality:
 *   - Node references first (from/to)
 *   - Then OUT pointers (prevOut/nextOut)
 *   - Then IN pointers (prevIn/nextIn)
 */
class GraphEdge {
  /** Source node (the node that has this edge in its OUT-list) */
  from: GraphNode;
  /** Observer node (the node that has this edge in its IN-list) */
  to: GraphNode;

  /** Previous edge in the source's OUT-list (or null if this is the first) */
  prevOut: GraphEdge | null = null;
  /** Next edge in the source's OUT-list (or null if this is the last) */
  nextOut: GraphEdge | null = null;

  /** Previous edge in the observer's IN-list (or null if this is the first) */
  prevIn: GraphEdge | null = null;
  /** Next edge in the observer's IN-list (or null if this is the last) */
  nextIn: GraphEdge | null = null;

  /**
   * Creates a new edge and inserts it at the end of both lists.
   * This constructor is intentionally low-level and mirrors the manual linking
   * performed in functions like `linkSourceToObserverUnsafe`.
   *
   * @param from     Source node
   * @param to       Observer node
   * @param prevOut  Previous OUT edge (typically source.lastOut before insertion)
   * @param nextOut  Next OUT edge (always null for tail insertion)
   * @param prevIn   Previous IN edge (typically observer.lastIn before insertion)
   * @param nextIn   Next IN edge (always null for tail insertion)
   */
  constructor(
    from: GraphNode,
    to: GraphNode,
    prevOut: GraphEdge | null = null,
    nextOut: GraphEdge | null = null,
    prevIn: GraphEdge | null = null,
    nextIn: GraphEdge | null = null,
  ) {
    this.from = from;
    this.to = to;
    this.prevOut = prevOut;
    this.nextOut = nextOut;
    this.prevIn = prevIn;
    this.nextIn = nextIn;
  }
}

/**
 * GraphNode is the core unit of a topological dependency graph using fully intrusive adjacency.
 *
 * Each node maintains:
 *   - Incoming edges (IN-list): nodes that depend on this one
 *   - Outgoing edges (OUT-list): nodes that this one observes/depend on
 *
 * All adjacency pointers are stored directly in GraphEdge instances — the node only holds
 * pointers to the first and last edge in each direction, plus counts for fast size checks.
 *
 * Design goals:
 *   - O(1) edge insertion/removal
 *   - Minimal per-node memory overhead
 *   - Cache-friendly layout for future SoA (Structure of Arrays) transformations
 *   - Stable object shape for V8 hidden class optimization (all fields initialized via class fields)
 */
class GraphNode {
  /** Permanent identifier — stable even if the node is moved in memory (e.g., during compaction) */
  readonly id: NodeIndex;

  /** Number of incoming edges (nodes depending on this one) */
  inCount = 0;
  /** Number of outgoing edges (nodes this one observes) */
  outCount = 0;

  /** First incoming edge (head of IN-list); null if no incoming edges */
  firstIn: GraphEdge | null = null;
  /** Last incoming edge (tail of IN-list); null if no incoming edges */
  lastIn: GraphEdge | null = null;

  /** First outgoing edge (head of OUT-list); null if no outgoing edges */
  firstOut: GraphEdge | null = null;
  /** Last outgoing edge (tail of OUT-list); null if no outgoing edges */
  lastOut: GraphEdge | null = null;

  /** Root causal coordinates — shared or sentinel; never modified after construction */
  readonly rootFrame: typeof TMP_SENTINEL;
  /** Per-node mutable causal coordinates — initialized to zero */
  readonly frame: CausalCoords = { t: 0, v: 0, p: 0, s: 0 };

  /**
   * @param id         Unique node identifier
   * @param rootFrame  Optional shared root frame; defaults to internal sentinel if omitted
   */
  constructor(id: NodeIndex, rootFrame = TMP_SENTINEL) {
    this.id = id;
    this.rootFrame = rootFrame;
  }
}

export { GraphNode, GraphEdge };
export type { NodeIndex, GraphNode as IGraphNode };
