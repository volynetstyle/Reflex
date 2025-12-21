import { CausalCoords } from "../storage/config/CausalCoords";

type NodeIndex = number;

/**
 * @class GraphEdge
 * @description
 * An intrusive, bi-directional edge establishing a stable connection between two GraphNodes.
 *
 * DESIGN PRINCIPLES:
 * 1. Double Adjacency: Participates simultaneously in two doubly-linked lists:
 * - OUT-list (source node's dependencies)
 * - IN-list (target node's observers)
 * 2. Constant Time Complexity: All mutations (link/unlink) are O(1) and pointer-based.
 * 3. Minimal Overhead: Contains zero metadata by default, serving as a pure structural link.
 *
 * ------------------------------------------------------------------------------------
 * @section FUTURE-PROOFING & COMPILATION PROPOSAL
 * ------------------------------------------------------------------------------------
 * The current JS implementation defines the interface for an optimized Data-Oriented
 * memory layout to be implemented via Rust/Wasm:
 *
 * 1. PHYSICAL ABSTRACTION: In high-performance mode, this class transforms into a
 * Flyweight wrapper over a SharedArrayBuffer.
 * 2. POINTER COMPRESSION: 64-bit object references are targeted for replacement by
 * 32-bit (u32) offsets within a global Edge Pool, maximizing cache density.
 * 3. CACHE LOCALITY: Edge allocation is designed for contiguous memory placement,
 * drastically reducing L1/L2 cache misses during graph traversal.
 * 4. BINARY COMPATIBILITY: Layout is guaranteed to be #[repr(C)] compatible for
 * zero-copy interop with native system-level processing.
 */
class GraphEdge {
  // Group related fields for better cache locality
  from: GraphNode;
  to: GraphNode;

  // OUT-list pointers (source perspective)
  prevOut: GraphEdge | null;
  nextOut: GraphEdge | null;

  // IN-list pointers (target perspective)
  prevIn: GraphEdge | null;
  nextIn: GraphEdge | null;

  constructor(
    from: GraphNode,
    to: GraphNode,
    prevOut: GraphEdge | null = null,
    nextOut: GraphEdge | null = null,
    prevIn: GraphEdge | null = null,
    nextIn: GraphEdge | null = null,
  ) {
    // Initialize ALL fields in constructor for hidden class stability
    this.from = from;
    this.to = to;
    this.prevOut = prevOut;
    this.nextOut = nextOut;
    this.prevIn = prevIn;
    this.nextIn = nextIn;
  }
}

/**
 * @class GraphNode
 * @description
 * A fundamental unit of the topological graph. Fully intrusive architecture
 * that encapsulates its own adjacency metadata.
 *
 * STRUCTURE:
 * - IN-BOUND:  `firstIn`  → ... → `lastIn`  (Incoming dependencies)
 * - OUT-BOUND: `firstOut` → ... → `lastOut` (Outgoing observers)
 *
 * INVARIANTS:
 * - Symmetry: If `firstOut` is null, `lastOut` must be null, and `outCount` must be 0.
 * - Integrity: Every edge in the lists must form a valid doubly-linked chain.
 *
 * ------------------------------------------------------------------------------------
 * @section IDENTITY-STABLE ACCESSORS (ISA) & DATA-ORIENTED DESIGN
 * ------------------------------------------------------------------------------------
 * This structure serves as a stable contract for a high-performance memory backend:
 *
 * 1. STABLE IDENTITY: The `id` (NodeIndex) acts as a permanent handle. Physical
 * memory relocation (e.g., compaction) does not invalidate the identity.
 * 2. FIELD SPLITTING (SoA): Adjacency pointers (firstIn/firstOut) are designed to be
 * split into separate Int32Arrays to optimize CPU prefetching during sorting.
 * 3. CAUSAL COORDINATION: The `point` object (CausalCoords) is targeted for
 * flattening into Float32Array SIMD-lanes for vectorized geometric scheduling.
 * 4. ZERO-GC PRESSURE: By transitioning to typed arrays, the graph eliminates
 * object tracking overhead, effectively bypassing JavaScript Garbage Collection.
 */
class GraphNode {
  // Primitives first (better packing)
  readonly id: NodeIndex;
  inCount: number;
  outCount: number;

  // Object references grouped
  firstIn: GraphEdge | null;
  lastIn: GraphEdge | null;
  firstOut: GraphEdge | null;
  lastOut: GraphEdge | null;

  // Stable object shape (initialized inline)
  point: CausalCoords;

  constructor(id: NodeIndex) {
    this.id = id;
    this.inCount = 0;
    this.outCount = 0;
    this.firstIn = null;
    this.lastIn = null;
    this.firstOut = null;
    this.lastOut = null;
    // Initialize with literal for shape stability
    this.point = { t: 0, v: 0, g: 0, s: 0 };
  }
}

export { GraphNode, GraphEdge };
export type { NodeIndex, GraphNode as IGraphNode };
