// Set theory (Eq, Order)
export type { Eq, Setoid } from "./sets/eq"
export type { Preorder, Poset, TotalOrder, Ord, Ordering } from "./sets/order"

// Lattice theory
export type {
  JoinSemilattice,
  MeetSemilattice,
  Lattice,
  BoundedLattice,
  CompleteLattice,
} from "./lattice"

// Laws
export type { Law, LawSet } from "./laws/laws"
export {
  latticeLaws,
  joinSemilatticeLaws,
  meetSemilatticeLaws,
} from "./laws/lattice.laws"
export { joinframeAlgebraLaws, joinframeInvariantLaws } from "./laws/joinframe.laws"
