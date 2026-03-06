/**
 * Cyclic 32-bit unsigned integer space (Z₂³²) with half-range ordering.
 *
 * Mathematical model:
 *   Values belong to Z / 2^32 Z.
 *   All arithmetic is performed modulo 2^32.
 *
 * Ordering model (half-range rule):
 *   a is considered "after" b iff:
 *
 *     0 < (a - b) mod 2^32 < 2^31
 *
 *   Implemented branchlessly via signed 32-bit subtraction.
 *
 * Safety invariant:
 *   For correctness of isAfter, the maximum distance between
 *   any two live values must satisfy:
 *
 *     |(a - b) mod 2^32| < 2^31
 *
 *     Δ = rT ≥ 2^(n−1)
 *   Violating this constraint makes ordering ambiguous.
 *
 * Performance characteristics:
 *   - Branchless comparison
 *   - Single add for increment
 *   - Single subtract for ordering/distance
 *   - No modulo operations
 *
 * Intended usage:
 *   - Logical clocks
 *   - Version counters
 *   - Causal ordering
 *   - Ring-based schedulers
 */
export type Cyclic32Int = number; // uint32

export interface Cyclic32Runtime {
  /**
   * Returns the next value in Z₂³².
   * Equivalent to (v + 1) mod 2^32.
   */
  next(v: Cyclic32Int): Cyclic32Int;

  /**
   * Returns true if `a` is strictly after `b`
   * under half-range cyclic ordering.
   *
   * Precondition:
   *   The system must guarantee that the distance between
   *   live values never exceeds 2^31.
   */
  isAfter(a: Cyclic32Int, b: Cyclic32Int): boolean;

  /**
   * Signed distance from `a` to `b`
   * interpreted in int32 space.
   *
   * Positive  → b is after a
   * Negative  → b is before a
   * Zero      → equal
   *
   * Note:
   *   The magnitude must not exceed 2^31 for
   *   ordering guarantees to hold.
   */
  distance(a: Cyclic32Int, b: Cyclic32Int): number;
}

export const CyclicOrder32Int = {
  // @__INLINE__
  next(v) {
    return ((v + 1) | 0) & 0xffffffff;
  },

  // @__INLINE__
  isAfter(a, b) {
    return ((a - b) | 0) > 0;
  },

  // @__INLINE__
  distance(a, b) {
    return (b - a) | 0;
  },
} satisfies Cyclic32Runtime;
