import type { Coords } from "../../domains/coords/coords"
import type { Poset } from "../../core/sets/order"
import type { Lattice } from "../../core/lattice"

/**
 * coordsDominate
 *
 * Poset order on Coords: a ≤ b iff a.t ≤ b.t AND a.v ≤ b.v AND a.p ≤ b.p AND a.s ≤ b.s
 * This implements the dominance order for causality.
 */
export function coordsDominate(a: Coords, b: Coords): boolean {
  return a.t <= b.t && a.v <= b.v && a.p <= b.p && a.s <= b.s
}

/**
 * coordsEqual
 *
 * Structural equality for Coords.
 */
export function coordsEqual(a: Coords, b: Coords): boolean {
  return a.t === b.t && a.v === b.v && a.p === b.p && a.s === b.s
}

/**
 * coordsJoin
 *
 * Lattice join: componentwise maximum.
 * Represents the "least upper bound" in causality order.
 */
export function coordsJoin(a: Coords, b: Coords): Coords {
  return {
    t: Math.max(a.t, b.t),
    v: Math.max(a.v, b.v),
    p: Math.max(a.p, b.p),
    s: Math.max(a.s, b.s),
  }
}

/**
 * coordsMeet
 *
 * Lattice meet: componentwise minimum.
 * Represents the "greatest lower bound" in causality order.
 */
export function coordsMeet(a: Coords, b: Coords): Coords {
  return {
    t: Math.min(a.t, b.t),
    v: Math.min(a.v, b.v),
    p: Math.min(a.p, b.p),
    s: Math.min(a.s, b.s),
  }
}

/**
 * coordsPoset
 *
 * Poset<Coords> instance (dominance order).
 */
export const coordsPoset: Poset<Coords> = {
  leq: coordsDominate,
}

/**
 * coordsLattice
 *
 * Lattice<Coords> instance (full lattice with join and meet).
 */
export const coordsLattice: Lattice<Coords> = {
  join: coordsJoin,
  meet: coordsMeet,
}
