/**
 * @reflex/algebra/types
 *
 * Type-only entry point. Safe for `import type` statements.
 * Zero runtime cost; guarantees no circular dependencies or module side-effects.
 *
 * Usage:
 * ```typescript
 * import type { Lattice, Coords, JoinFrame } from "algebra/types"
 * ```
 */

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

// Domain: Coordinates
export type { Coords } from "./domains/coords/coords"

// Domain: JoinFrame
export type { JoinFnTuple, JoinNode, Join2, Join3, JoinFrame } from "./domains/join/joinFrame"
