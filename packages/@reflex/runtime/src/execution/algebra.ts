import { ReactiveNode } from "../reactivity/shape";

/**
 * Cyclic arithmetic over the 32-bit unsigned integer ring Z₂³².
 *
 * Domain:
 *   All values belong to Z / 2^32 Z.
 *   Arithmetic is performed modulo 2^32.
 *
 * Ordering model (half-range rule):
 *
 *   a is considered "after" b iff:
 *
 *       0 < (a - b) mod 2^32 < 2^31
 *
 * Implementation:
 *   Achieved branchlessly by interpreting the subtraction
 *   result as a signed int32.
 *
 *       ((a - b) | 0) > 0
 *
 * Safety invariant:
 *   The maximum distance between any two live values must satisfy
 *
 *       |(a - b) mod 2^32| < 2^31
 *
 *   Otherwise ordering becomes ambiguous.
 *
 * Performance properties:
 *   - branchless comparisons
 *   - single add/sub instructions
 *   - no modulo operations
 *   - no allocations
 *
 * Typical use cases:
 *   - logical clocks
 *   - version counters
 *   - reactive graph timestamps
 *   - ring schedulers
 *   - lock-free sequence numbers
 */
export type Cyclic32Int = number; // treated as uint32

export const MASK32 = 0xffffffff | 0;
export const HALF = 0x80000000 | 0; // 2^31

/**
 * Ring arithmetic in Z₂³².
 *
 * All operations wrap automatically due to uint32 coercion.
 */
export const CyclicRing32 = {
  /** (a + b) mod 2^32 */
  add(a: Cyclic32Int, b: Cyclic32Int): Cyclic32Int {
    return (a + b) >>> 0;
  },

  /** (a - b) mod 2^32 */
  sub(a: Cyclic32Int, b: Cyclic32Int): Cyclic32Int {
    return (a - b) >>> 0;
  },

  /** successor in the cyclic space */
  inc(v: Cyclic32Int): Cyclic32Int {
    return (v + 1) >>> 0;
  },

  /** predecessor in the cyclic space */
  dec(v: Cyclic32Int): Cyclic32Int {
    return (v - 1) >>> 0;
  },

  /** additive inverse */
  neg(v: Cyclic32Int): Cyclic32Int {
    return -v >>> 0;
  },
};

/**
 * Half-range cyclic ordering.
 *
 * The ordering is only well-defined while
 *
 *     |(a - b) mod 2^32| < 2^31
 */
export const CyclicOrder32 = {
  /** a strictly happens after b */
  isAfter(a: Cyclic32Int, b: Cyclic32Int): boolean {
    return ((a - b) | 0) > 0;
  },

  /** a strictly happens before b */
  isBefore(a: Cyclic32Int, b: Cyclic32Int): boolean {
    return ((a - b) | 0) < 0;
  },

  /** equality check */
  equals(a: Cyclic32Int, b: Cyclic32Int): boolean {
    return a === b;
  },

  /**
   * Signed ordering distance.
   *
   * Positive → a after b
   * Negative → a before b
   */
  compare(a: Cyclic32Int, b: Cyclic32Int): number {
    return (a - b) | 0;
  },
};

/**
 * Distance operations in cyclic space.
 */
export const CyclicDistance32 = {
  /**
   * Forward distance from a → b.
   *
   * Range: [0, 2^32)
   */
  forward(a: Cyclic32Int, b: Cyclic32Int): number {
    return (b - a) >>> 0;
  },

  /**
   * Signed distance in int32 space.
   *
   * Range: (-2^31, 2^31)
   */
  signed(a: Cyclic32Int, b: Cyclic32Int): number {
    return (b - a) | 0;
  },

  /**
   * Absolute distance (branchless magnitude).
   */
  abs(a: Cyclic32Int, b: Cyclic32Int): number {
    const d = (b - a) | 0;
    return d < 0 ? -d : d;
  },
};

/**
 * Cyclic interval algebra.
 *
 * Intervals follow the half-range ordering rule.
 */
export const CyclicInterval32 = {
  /**
   * Checks whether x lies inside the interval [start, end].
   *
   * Works correctly even if the interval crosses the wrap boundary.
   */
  contains(x: Cyclic32Int, start: Cyclic32Int, end: Cyclic32Int): boolean {
    return ((x - start) | 0) >= 0 && ((end - x) | 0) >= 0;
  },

  /**
   * Tests whether two cyclic intervals overlap.
   */
  overlaps(
    aStart: Cyclic32Int,
    aEnd: Cyclic32Int,
    bStart: Cyclic32Int,
    bEnd: Cyclic32Int,
  ): boolean {
    return (
      ((bStart - aStart) | 0) <= ((aEnd - aStart) | 0) ||
      ((aStart - bStart) | 0) <= ((bEnd - bStart) | 0)
    );
  },
};

// @__INLINE__
const RANK_GAP = 32;

export function repairRank(parent: ReactiveNode, child: ReactiveNode) {
  const pr = parent.rank;
  const cr = child.rank;

  if (((pr - cr) | 0) >= 0) {
    child.rank = (pr + RANK_GAP) >>> 0;
  }
}

function execute(node: ReactiveNode) {
  let maxParentRank = 0;

  for (let e = node.firstIn; e; e = e.nextIn) {
    const pr = e.from.rank;
    if (((pr - maxParentRank) | 0) > 0) {
      maxParentRank = pr;
    }
  }

  if (((maxParentRank - node.rank) | 0) >= 0) {
    node.rank = (maxParentRank + RANK_GAP) >>> 0;
  }

  ///recompute(node);
}
