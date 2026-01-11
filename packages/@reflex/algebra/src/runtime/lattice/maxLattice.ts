import type { BoundedLattice } from "../../core/lattice"

/**
 * latticeMaxNumber
 *
 * Bounded lattice on numbers using Math.max and Math.min.
 * - bottom: -Infinity
 * - top: Infinity
 * - join: Math.max
 * - meet: Math.min
 */
export function latticeMaxNumber(): BoundedLattice<number> {
  return {
    join: Math.max,
    meet: Math.min,
    bottom: -Infinity,
    top: Infinity,
  }
}

/**
 * latticeMinNumber
 *
 * Bounded lattice on numbers using Math.min and Math.max.
 * - bottom: Infinity
 * - top: -Infinity
 * - join: Math.min
 * - meet: Math.max
 */
export function latticeMinNumber(): BoundedLattice<number> {
  return {
    join: Math.min,
    meet: Math.max,
    bottom: Infinity,
    top: -Infinity,
  }
}

/**
 * latticeMaxBigInt
 *
 * Bounded lattice on BigInt using max/min.
 */
export function latticeMaxBigInt(): BoundedLattice<bigint> {
  return {
    join: (a, b) => (a > b ? a : b),
    meet: (a, b) => (a < b ? a : b),
    bottom: -9223372036854775868n, // min safe bigint approximation
    top: 9223372036854775807n,      // max safe bigint approximation
  }
}
