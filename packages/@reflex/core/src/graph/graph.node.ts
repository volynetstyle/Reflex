import { INITIAL_CAUSATION } from "../storage/config/causal.phase";
import { CausalCoords } from "../storage/config/CausalCoords";
import { CLEAN } from "./graph.constants";

type NodeIndex = number;

const NON_EXIST: NodeIndex = -1;

/**
 *  GraphEdge
 *
 * Intrusive bi-directional edge connecting two GraphNodes:
 *
 *      from  --->  to
 *
 * The edge participates in two separate intrusive doubly-linked lists:
 *
 *  1) OUT adjacency of `from`:
 *        from.firstOut → ... → edge → ... → from.lastOut
 *
 *  2) IN adjacency of `to`:
 *        to.firstIn → ... → edge → ... → to.lastIn
 *
 * These lists are stored *inside* GraphNode, not in GraphService or graph
 * containers. This keeps mutation O(1), minimizes allocations, and provides
 * tight control required by the runtime.
 *
 * Each edge tracks four pointers:
 *   prevOut, nextOut — outgoing adjacency chain
 *   prevIn,  nextIn  — incoming adjacency chain
 *
 * No extra metadata is stored: no weights, timestamps, or flags. The edge is
 * as small and cheap as possible.
 */
class GraphEdge {
  /** Source node of the edge */
  from: GraphNode;
  /** Target node of the edge */
  to: GraphNode;
  /** Previous edge in the outgoing list of `from` */
  prevOut: GraphEdge | null = null;
  /** Next edge in the outgoing list of `from` */
  nextOut: GraphEdge | null = null;
  /** Previous edge in the incoming list of `to` */
  prevIn: GraphEdge | null = null;
  /** Next edge in the incoming list of `to` */
  nextIn: GraphEdge | null = null;

  constructor(from: GraphNode, to: GraphNode) {
    this.from = from;
    this.to = to;
  }
}

/**
 *  GraphNode
 *
 * A node in the reactive dependency graph.
 * This is a fully *intrusive* node: it stores all adjacency lists internally.
 *
 * STRUCTURE:
 * ----------------------------------------------------------------------------
 *  Outgoing edges (dependencies *from* this node):
 *      firstOut → ... → lastOut
 *
 *  Incoming edges (dependencies *to* this node):
 *      firstIn → ... → lastIn
 *
 *  These two lists are independent and form a bipartite representation of
 *  directional connections: out-edges represent observers, in-edges represent
 *  sources.
 *
 * INVARIANTS:
 * ----------------------------------------------------------------------------
 * - If firstOut === null, then lastOut === null and outCount = 0.
 * - If firstIn  === null, then lastIn  === null and inCount  = 0.
 * - Counts must always reflect the actual length of adjacency lists.
 * - Edges must always form valid doubly-linked chains.
 *
 * FLAGS:
 * ----------------------------------------------------------------------------
 * Node-level state flags are stored in `flags` using a BitMask.
 * Typical use-cases:
 *   - CLEAN / DIRTY reactivity state
 *   - scheduler marks
 *   - GC / disposal hints
 *
 * The graph itself does not interpret these flags — external systems do.
 *
 * PERFORMANCE NOTES:
 * ----------------------------------------------------------------------------
 * - GraphNode is shape-stable: all fields are allocated and initialized
 *   in the constructor to ensure V8 IC predictability.
 * - All adjacency updates are O(1).
 * - No arrays or extra memory structures are allocated during edge edits.
 */
class GraphNode {
  /** Index in the causal layout (t/v/g/s table), or NON_EXIST */
  readonly id: NodeIndex = NON_EXIST;
  /** First outgoing dependency (this → observer) */
  firstOut: GraphEdge | null = null;
  /** Last outgoing dependency (this → observer) */
  lastOut: GraphEdge | null = null;
  /** First incoming dependency (source → this) */
  firstIn: GraphEdge | null = null;
  /** Last incoming dependency (source → this) */
  lastIn: GraphEdge | null = null;
  /** Number of outgoing edges */
  outCount: number = 0;
  /** Number of incoming edges */
  inCount: number = 0;
  /**
   * Bit-mask for node-level flags.
   * Initial state: CLEAN (defined in graph.constants).
   */
  flags: number = CLEAN;

  point: CausalCoords = {
    t: INITIAL_CAUSATION,
    v: INITIAL_CAUSATION,
    g: INITIAL_CAUSATION,
    s: INITIAL_CAUSATION,
  };

  constructor(id: NodeIndex) {
    this.id = id;
  }
}

export { GraphNode, GraphEdge };
export type { NodeIndex, GraphNode as IGraphNode };
