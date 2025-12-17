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
export interface CausalCoords<T = number, V = number, P = number, S = number> {
  /** t — causal epoch (0..2^T_BITS-1) */
  t: T;
  /** v — value version (0..2^V_BITS-1) */
  v: V;
  /** p — async generation / layer (0..2^G_BITS-1) */
  p: P;
  /** s — structural / topology (0..2^S_BITS-1) */
  s: S;
}

/** Full 4D space T⁴ = (t,v,p,s) */
export type T4<T = number, V = number, P = number, S = number> = CausalCoords<
  T,
  V,
  P,
  S
>;

/** 3D projection without structural component: T³ = (t,v,p) */
export type T3<T = number, V = number, P = number> = Pick<
  CausalCoords<T, V, P, never>,
  "t" | "v" | "p"
>;

/** 2D projection: no async, static graph: T² = (t,v) */
export type T2<T = number, V = number> = Pick<
  CausalCoords<T, V, never, never>,
  "t" | "v"
>;

/** Pure value layer: T¹ = (v) */
export type T1<V = number> = Pick<CausalCoords<never, V, never, never>, "v">;

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
export function addWrap<A extends number>(
  x: A,
  delta: number = 1,
  mask: number = WRAP_END,
): A {
  return ((x + delta) & mask) as A;
}

/** Default 32-bit wrap mask */
export const WRAP_END = 0xffff_ffff >>> 0;
