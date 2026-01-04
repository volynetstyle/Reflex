import type { GraphEdge } from "./graph.edge";
import type { CausalCoords } from "../../storage/config/CausalCoords";

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
  readonly id: number;

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
  readonly rootFrame: CausalCoords;
  /** Per-node mutable causal coordinates — initialized to zero */
  readonly frame: CausalCoords = { t: 0, v: 0, p: 0, s: 0 };

  /**
   * @param id         Unique node identifier
   * @param rootFrame  Optional shared root frame; defaults to internal sentinel if omitted
   */
  constructor(id: number, rootFrame = { t: 0, v: 0, p: 0, s: 0 }) {
    this.id = id;
    this.rootFrame = rootFrame;
  }
}

export { GraphNode };
