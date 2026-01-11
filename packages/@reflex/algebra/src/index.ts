/**
 * @reflex/algebra
 *
 * Main entry point. Re-exports core types and recommended runtime implementations.
 *
 * Usage:
 * ```typescript
 * // Type imports (zero runtime cost)
 * import type { Lattice, Poset, Coords } from "algebra"
 *
 * // Runtime imports (explicit opt-in)
 * import { latticeMaxNumber, createCoords, createJoin } from "algebra"
 * ```
 */

// ============================================================================
// CORE TYPES
// ============================================================================

// Set Theory
export type { Eq, Setoid } from "./core/sets/eq"
export type { Preorder, Poset, TotalOrder, Ord, Ordering } from "./core/sets/order"

// Lattice Theory
export type {
  JoinSemilattice,
  MeetSemilattice,
  Lattice,
  BoundedLattice,
  CompleteLattice,
} from "./core/lattice"

// ============================================================================
// DOMAIN TYPES
// ============================================================================

// Coordinates
export type { Coords } from "./domains/coords/coords"
export { CoordsFrame } from "./domains/coords/frame"

// JoinFrame
export type { JoinFnTuple, JoinNode, Join2, Join3, JoinFrame } from "./domains/join/joinFrame"

// ============================================================================
// RUNTIME IMPLEMENTATIONS (opt-in)
// ============================================================================

// Lattice instances
export { latticeMaxNumber, latticeMinNumber, latticeMaxBigInt } from "./runtime/lattice/maxLattice"
export { latticeSetUnion, latticeSetIntersection } from "./runtime/lattice/setUnionLattice"
export { latticeTupleAppend, latticeArrayConcat } from "./runtime/lattice/tupleAccumulator"

// Coordinate operations
export {
  createCoords,
  COORDS_ZERO,
  COORDS_INFINITY,
  coordsDominate,
  coordsEqual,
  coordsJoin,
  coordsMeet,
  coordsPoset,
  coordsLattice,
} from "./runtime/coords"

// JoinFrame factory
export { createJoin } from "./domains/join/joinFrame"
