import type { JoinSemilattice, MeetSemilattice } from "./semilattice"

/**
 * Lattice<T>
 *
 * A complete lattice combining join and meet operations.
 * Satisfies absorption laws:
 * - join(a, meet(a, b)) = a
 * - meet(a, join(a, b)) = a
 */
export interface Lattice<T> extends JoinSemilattice<T>, MeetSemilattice<T> {}

/**
 * BoundedLattice<T>
 *
 * A lattice with explicit bottom and top elements.
 * - bottom: universal lower bound (identity for join)
 * - top: universal upper bound (identity for meet)
 */
export interface BoundedLattice<T> extends Lattice<T> {
  readonly bottom: T
  readonly top: T
}

/**
 * CompleteLattice<T>
 *
 * A lattice where every subset has a join and meet (future).
 * Note: In TS, we model this as a function type, not structural.
 */
export interface CompleteLattice<T> extends BoundedLattice<T> {
  joinAll: (values: readonly T[]) => T
  meetAll: (values: readonly T[]) => T
}
