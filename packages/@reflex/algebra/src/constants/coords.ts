/**
 * ============================================================
 *  Causal Coordinates Space
 *
 *  X₄ = T⁴ = S¹_t × S¹_v × S¹_g × S¹_s
 *
 *  t — causal epoch (time),
 *  v — value version,
 *  p — async generation / layer,
 *  s — structural / topology (graph shape).
 *
 *  Discrete representation:
 *    (t, v, p, s) ∈ ℤ / 2^{T_BITS}ℤ × ℤ / 2^{V_BITS}ℤ × ℤ / 2^{G_BITS}ℤ × ℤ / 2^{S_BITS}ℤ
 *
 *  Each dimension is a cyclic group ℤ_{2^k} with operation:
 *    x ⊕ δ := (x + δ) mod 2^k
 *
 *  In code:
 *    (x + δ) & (2^k - 1)
 *  providing wrap-around in 32-bit integer arithmetic.
 *
 * ------------------------------------------------------------
 *  Geometry simplification levels:
 *
 *  Level 0: Full Reactive Geometry (async + dynamic graph)
 *    T⁴ = S¹_t × S¹_v × S¹_g × S¹_s
 *
 *  Level 1: No async (strictly synchronous)
 *    Constraint: execution order = causal order
 *    → p can be inferred from t
 *    T³ = S¹_t × S¹_v × S¹_s
 *
 *  Level 2: Static graph (no dynamic topology)
 *    Constraint: graph structure fixed
 *    → s is constant, removed from dynamic state
 *    T² = S¹_t × S¹_v
 *
 *  Level 3: Pure functional / timeless evaluation
 *    Constraint: only value versions matter
 *    → t has no effect on computation
 *    T¹ = S¹_v
 *
 *  Projection hierarchy (degrees of freedom):
 *    T⁴(t, v, p, s)
 *       └──[no async]────────▶ T³(t, v, s)
 *          └──[static graph]─▶ T²(t, v)
 *             └──[pure]──────▶ T¹(v)
 *
 *  Algebraically:
 *    T⁴ ≅ ℤ_{2^{T_BITS}} × ℤ_{2^{V_BITS}} × ℤ_{2^{G_BITS}} × ℤ_{2^{S_BITS}}
 *    Projections inherit component-wise addition modulo 2^k
 */

/** Discrete causal coordinates */
export interface CausalCoords {
  /** t — causal epoch (0..2^T_BITS-1) */
  t: number;
  /** v — value version (0..2^V_BITS-1) */
  v: number;
  /** p — async generation / layer (0..2^G_BITS-1) */
  p: number;
  /** s — structural / topology (0..2^S_BITS-1) */
  s: number;
}

/** Full space */
export type T4 = CausalCoords;

/** T³ = (t, v, p) */
export type T3 = Pick<T4, "t" | "v" | "p">;

/** T² = (t, v) */
export type T2 = Pick<T4, "t" | "v">;

/** T¹ = (v) */
export type T1 = Pick<T4, "v">;

export type Fibration<High extends object, Low extends keyof High> = Pick<
  High,
  Low
>;

/** Default 32-bit wrap mask */
export const MASK_32 = 0xffff_ffff >>> 0;

/**
 * Addition modulo 2^k
 *
 *   addWrap(x, delta, mask) = (x + delta) mod 2^k
 *
 * mask = 2^k - 1
 * x must already be normalized: 0 ≤ x ≤ mask
 * delta can be negative
 *
 * Implemented branch-free using 32-bit arithmetic:
 *   (x + delta) & mask
 *
 * Example:
 *   x = 0, delta = -1  ⇒  result = mask (wrap-around)
 */
export const inc32 = (x: number, delta = 1): number => (x + delta) | 0;

export const bumpCoords = (c: T4): T4 => ({
  t: inc32(c.t),
  v: inc32(c.v),
  p: inc32(c.p),
  s: inc32(c.s),
});
