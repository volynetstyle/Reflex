import type { BoundedLattice } from "../../core/lattice"

/**
 * latticeTupleAppend
 *
 * Bounded lattice on tuple/array using append (prepend) and intersection.
 * Useful for accumulating ordered sequences.
 * - bottom: empty array
 * - top: would require all possible values (impractical)
 * - join: append elements (right-biased union)
 * - meet: intersection of elements
 *
 * Note: This is a simplified implementation.
 * In a real scenario, you'd define semantics more carefully.
 */
export function latticeTupleAppend<T>(): BoundedLattice<readonly T[]> {
  return {
    join: (a, b) => {
      // Union: take elements from both, avoiding duplicates
      const seen = new Set(a)
      const result = [...a]
      b.forEach((x) => {
        if (!seen.has(x)) {
          result.push(x)
          seen.add(x)
        }
      })
      return result
    },
    meet: (a, b) => {
      // Intersection: keep only elements in both
      const bSet = new Set(b)
      return a.filter((x) => bSet.has(x))
    },
    bottom: [],
    top: [], // Placeholder
  }
}

/**
 * latticeArrayConcat
 *
 * Simple concatenation lattice (non-idempotent, just for reference).
 * Warning: Violates idempotence. Use only if you know what you're doing.
 */
export function latticeArrayConcat<T>(): BoundedLattice<readonly T[]> {
  return {
    join: (a, b) => [...a, ...b],
    meet: (a, b) => {
      // Intersection preserving order
      const bSet = new Set(b)
      return a.filter((x) => bSet.has(x))
    },
    bottom: [],
    top: [],
  }
}
