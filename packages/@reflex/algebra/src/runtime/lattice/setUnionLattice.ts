import type { BoundedLattice } from "../../core/lattice"

/**
 * latticeSetUnion
 *
 * Bounded lattice on Set<T> using union and intersection.
 * - bottom: empty Set
 * - top: would require universal set (impractical; omitted)
 * - join: set union
 * - meet: set intersection
 *
 * Note: This returns a BoundedLattice with bottom but not top.
 * In practice, `top` is undefined; don't use it.
 */
export function latticeSetUnion<T>(): BoundedLattice<Set<T>> {
  return {
    join: (a, b) => {
      const result = new Set(a)
      b.forEach((x) => result.add(x))
      return result
    },
    meet: (a, b) => {
      const result = new Set<T>()
      a.forEach((x) => {
        if (b.has(x)) result.add(x)
      })
      return result
    },
    bottom: new Set(),
    top: new Set(), // Placeholder; should not be used
  }
}

/**
 * latticeSetIntersection
 *
 * Bounded lattice on Set<T> using intersection and union.
 * Dual of latticeSetUnion.
 */
export function latticeSetIntersection<T>(): BoundedLattice<Set<T>> {
  return {
    join: (a, b) => {
      const result = new Set<T>()
      a.forEach((x) => {
        if (b.has(x)) result.add(x)
      })
      return result
    },
    meet: (a, b) => {
      const result = new Set(a)
      b.forEach((x) => result.add(x))
      return result
    },
    bottom: new Set(), // Placeholder
    top: new Set(),    // Placeholder
  }
}
