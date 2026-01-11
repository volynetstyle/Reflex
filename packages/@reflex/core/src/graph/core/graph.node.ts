import type { GraphEdge } from "./graph.edge";
import type { CausalCoords } from "../../storage/config/CausalCoords";

/**
 * GraphNode represents an **immutable causal event** in the runtime.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONTOLOGY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A GraphNode is NOT:
 *   - a piece of mutable state
 *   - a computed value
 *   - a signal
 *   - a callback
 *   - a scheduler task
 *
 * A GraphNode IS:
 *   - a first-class **event**
 *   - an immutable **fact that has occurred**
 *   - a node in a **causal directed acyclic graph (DAG)**
 *
 * Each GraphNode represents an immutable historical fact.
 *
 * Immutability is **semantic**, not physical:
 *   - the event it represents cannot be changed, revoked, or reordered
 *   - the in-memory object may be compacted, snapshotted, or garbage-collected
 *     once it is no longer needed for evaluation
 *
 * “GraphNode represents an immutable causal event.
 * Its immutability is semantic rather than physical: the represented fact is stable,
 * while its in-memory representation may be compacted or reclaimed without violating causality.”
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CAUSALITY MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Causality is represented explicitly via intrusive adjacency lists.
 *
 *   IN  edges  — causal predecessors (what caused this event)
 *   OUT edges  — causal successors   (events derived from this one)
 *
 * Formally:
 *   An edge A → B means: event A is a causal prerequisite of event B.
 *
 * The resulting structure is a causal partial order, not a total order.
 * No global clock or scheduler order is assumed or required.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIGNALS VS EVENTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GraphNode does NOT store values.
 * Values are produced by **signals**, which are pure functions evaluated
 * over the causal history (i.e. downward-closed subsets of this graph).
 *
 * In other words:
 *
 *   GraphNode  — represents "what happened"
 *   Signal     — represents "what is observed given what happened"
 *
 * This separation is strict and intentional.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CAUSAL COORDINATES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `rootFrame` and `frame` provide local causal coordinates used for:
 *   - versioning
 *   - snapshotting
 *   - pruning / compaction
 *   - fast dominance / reachability checks
 *
 * These coordinates DO NOT define causality.
 * Causality is defined exclusively by graph edges.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN GOALS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   - Explicit causality (no hidden scheduling)
 *   - Deterministic behavior under asynchrony
 *   - O(1) edge insertion/removal via intrusive adjacency
 *   - Minimal per-node memory overhead
 *   - Stable object shape for V8 hidden-class optimization
 *   - Cache-friendly layout, compatible with future SoA transformations
 *
 * This type is the semantic foundation of the runtime.
 * All higher-level abstractions (signals, joins, effects) are defined on top of it.
 */
class GraphNode {
  /** Permanent identifier — stable even if the node is moved in memory */
  readonly id: number;

  /** Number of incoming causal edges (causes of this event) */
  inCount = 0;
  /** Number of outgoing causal edges (events derived from this one) */
  outCount = 0;

  /** Head of incoming causal edge list */
  firstIn: GraphEdge | null = null;
  /** Tail of incoming causal edge list */
  lastIn: GraphEdge | null = null;

  /** Head of outgoing causal edge list */
  firstOut: GraphEdge | null = null;
  /** Tail of outgoing causal edge list */
  lastOut: GraphEdge | null = null;

  /** Shared root causal frame (never mutated) */
  readonly rootFrame: CausalCoords;

  /** Local mutable causal coordinates (do NOT encode causality itself) */
  readonly frame: CausalCoords = { t: 0, v: 0, p: 0, s: 0 };

  constructor(id: number, rootFrame = { t: 0, v: 0, p: 0, s: 0 }) {
    this.id = id;
    this.rootFrame = rootFrame;
  }
}

export { GraphNode };
