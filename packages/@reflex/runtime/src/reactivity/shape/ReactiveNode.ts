import { INVALID_RANK, type GraphNode, type OwnershipNode } from "@reflex/core";
import { Reactivable } from "./Reactivable";
import { ReactiveEdge } from "./ReactiveEdge";
import { Byte32Int, INITIAL } from "./ReactiveMeta";
import { Int64 } from "./methods/integer";

type ComputeFn<T> = ((previous?: T) => T) | (() => T) | null;

/**
 * ReactiveNode
 *
 * Core runtime entity representing a vertex in the reactive graph.
 *
 * Mathematical model:
 *   A node is a stateful element participating in a directed dependency graph.
 *   It may represent:
 *     - a source (signal)
 *     - a derived computation
 *     - an effect
 *
 * Structural invariants:
 *
 *   1. Versioning
 *      - `v` is a cyclic logical clock (Z₂³², half-range ordered).
 *      - `v` mutates only through controlled payload updates.
 *
 *   2. Temporal markers
 *      - `t`, `p`, `s` are cyclic timestamps used by the scheduler.
 *      - All time-like fields live in the same cyclic space.
 *
 *   3. Graph connectivity
 *      - Outgoing edges are stored as a doubly-linked list:
 *          firstOut → ... → lastOut
 *      - Incoming edges mirror the same structure.
 *      - outCount / inCount reflect actual list size.
 *
 *   4. Payload consistency
 *      - `payload` must be initialized before first read.
 *      - If payload changes, version must strictly increment.
 *
 *   5. Compute contract
 *      - `compute !== null` ⇒ derived node
 *      - `compute === null` ⇒ source node
 *
 *   6. Lifecycle ownership
 *      - `lifecycle` binds node to ownership tree.
 *      - Destruction and disposal are governed externally.
 *
 * Performance design:
 *
 *   - Layout intentionally flat to preserve V8 hidden class stability.
 *   - Numeric fields grouped to improve spatial locality.
 *   - No dynamic property creation after construction.
 *   - Pointer fields grouped to reduce shape transitions.
 *
 * Memory model:
 *
 *   Node structure is hot-path optimized.
 *   All frequently accessed scheduling fields are primitive numbers.
 *
 *   No getters/setters are used to avoid deoptimization.
 */
class ReactiveNode<T = any> implements Reactivable, GraphNode {
  v: number = 0;
  /**
   * Runtime identifier or scheduler slot.
   * By default need to check but not exactly goes to borders and stops early
   */
  runtime: Byte32Int = INITIAL;

  /**
   * Bitmask metadata.
   * Immutable after construction.
   */
  readonly meta: Byte32Int;

  /**
   * Outgoing dependency edges.
   */
  firstOut: ReactiveEdge | null = null;
  lastOut: ReactiveEdge | null = null;
  outCount = 0;

  /**
   * Means topological rank and -1 is out of topology order.
   */
  rank: Int64 = INVALID_RANK;
  nextPeer: ReactiveNode | null = null;
  prevPeer: ReactiveNode | null = null;

  /**
   * Incoming dependency edges.
   */
  firstIn: ReactiveEdge | null = null;
  lastIn: ReactiveEdge | null = null;
  inCount = 0;

  /**
   * Current node value.
   * Must be assigned before first read.
   */
  payload: T;

  /**
   * Compute function for derived nodes.
   * Undefined for signal/source nodes.
   */
  compute: ComputeFn<T>;

  /**
   * Ownership tree reference.
   * Used for lifecycle management.
   */
  lifecycle: OwnershipNode | null;

  constructor(
    meta: number,
    payload: T,
    compute: ComputeFn<T> = null,
    lifecycle: OwnershipNode | null = null,
  ) {
    this.meta = meta | 0;
    this.payload = payload;
    this.compute = compute;
    this.lifecycle = lifecycle;
  }
}

export type { Reactivable, ReactiveNode };
export default ReactiveNode;
