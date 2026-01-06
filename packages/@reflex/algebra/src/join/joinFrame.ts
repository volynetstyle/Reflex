/**
 * JoinFrame — Zero-Allocation Join Coordination Primitive
 * ========================================================
 *
 * A lattice-based synchronization automaton for order-independent data aggregation.
 * Designed for hot-path monomorphic execution with minimal allocations.
 *
 *
 * INVARIANTS (J1-J6)
 * ------------------
 *
 * J1: **Arity Stability**
 *     `arity` is immutable for the lifetime of the JoinFrame.
 *     Rationale: Enables V8 constant folding and eliminates boundary checks.
 *
 * J2: **Progress Monotonicity**
 *     `arrived = rank(value) ∈ [0, arity]`
 *     Progress strictly increases via lattice operations.
 *
 * J3: **Idempotent Step Semantics**
 *     `step(i)` may be called arbitrarily; logical progress determined by lattice growth.
 *     Duplicate events don't regress state (assuming A3).
 *
 * J4: **Monomorphic Hot Path**
 *     `step` is the only performance-critical method. Must stay monomorphic.
 *     No polymorphic dispatch, no hidden classes.
 *
 * J5: **Zero Post-Construction Allocation**
 *     All memory allocated at creation. No runtime allocations in `step`.
 *
 * J6: **Runtime Arity**
 *     Arity stored as data (not type-level) for dynamic join patterns.
 *
 *
 * ALGEBRAIC REQUIREMENTS
 * ----------------------
 *
 * The `join` operation MUST satisfy:
 *
 * A1: **Commutativity**
 *     join(join(r, a), b) === join(join(r, b), a)
 *     Order of events doesn't matter.
 *
 * A2: **Associativity**
 *     join(join(r, a), b) === join(r, join(a, b))
 *     Grouping of operations doesn't matter.
 *
 * A3: **Idempotence** (optional, but recommended)
 *     join(join(r, a), a) === join(r, a)
 *     Duplicate events are harmless.
 *
 * CONSEQUENCE: No scheduler required. Any delivery order is semantically correct.
 *
 *
 * EXAMPLE LATTICES
 * ----------------
 *
 * 1. **Max Lattice** (numeric)
 *    - bottom: -Infinity
 *    - join: Math.max
 *    - rank: identity
 *
 * 2. **Set Union** (unique values)
 *    - bottom: new Set()
 *    - join: (a, b) => new Set([...a, ...b])
 *    - rank: set => set.size
 *
 * 3. **Tuple Accumulator** (fixed arity)
 *    - bottom: []
 *    - join: (arr, x) => [...arr, x]
 *    - rank: arr => arr.length
 *
 *
 * PERFORMANCE CHARACTERISTICS
 * ---------------------------
 *
 * - Time: O(1) per step (assuming O(1) join and rank)
 * - Space: O(1) after construction
 * - IC: Monomorphic (V8 optimizes to raw memory access)
 * - GC: Zero pressure on hot path
 *
 *
 * USAGE PATTERN
 * -------------
 *
 * ```typescript
 * const join = createJoin(
 *   3,                           // wait for 3 events
 *   0,                           // identity element
 *   (a, b) => a + b,             // sum accumulator
 *   x => x >= 10 ? 3 : x / 3.33  // rank function (arbitrary progress metric)
 * );
 *
 * join.step(5);  // value: 5,  arrived: 1, done: false
 * join.step(3);  // value: 8,  arrived: 2, done: false
 * join.step(2);  // value: 10, arrived: 3, done: true
 * ```
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Compile-time join function signature (DSL only).
 * Not used at runtime — purely for static analysis.
 */
export type JoinFnTuple<Args extends readonly unknown[], R> = (
  ...args: Args
) => R;

/**
 * Base join node with stable identity.
 * Generic over arity for specialized implementations.
 */
export type JoinNode<Arity extends number, R> = {
  readonly arity: Arity;
  value: R;
};

/**
 * Binary join specialization (most common case).
 */
export type Join2<A, B, R> = JoinNode<2, R> & {
  readonly compute: (a: A, b: B) => R;
};

/**
 * Ternary join specialization.
 */
export type Join3<A, B, C, R> = JoinNode<3, R> & {
  readonly compute: (a: A, b: B, c: C) => R;
};

/**
 * Generic join frame automaton.
 *
 * State machine:
 * ```
 *   (value₀, arrived = 0₀, done = false)
 *          ↓ step(x₁)
 *   (value₁, arrived = r₁, done = false)
 *          ↓ step(x₂)
 *          ...
 *          ↓
 *   (valueₙ, arrived = n, done = true)
 * ```
 *
 * That`s it :3.
 */
export interface JoinFrame<R> {
  /** Number of events required to complete. Immutable (J1). */
  readonly arity: number;
  /** Current accumulated value. Monotonically increases via lattice. */
  value: R;
  /** Logical progress counter. Must satisfy J2: arrived ∈ [0, arity] (included). */
  arrived: number;
  /** Completion flag. Set when arrived >= arity. */
  done: boolean;
  /**
   * Core coordination primitive (J4: hot path).
   * Incorporates event into lattice, updates progress, checks completion.
   *
   * MUST be called with consistent types to maintain monomorphism.
   * MUST NOT allocate (J5).
   */
  step(x: R): void;
}

/**
 * Creates a zero-allocation join frame with lattice semantics.
 *
 * @param arity - Number of events required to complete (J1: immutable)
 * @param bottom - Identity element for the lattice (⊥)
 * @param join - Lattice join operation (must satisfy A1, A2, optionally A3)
 * @param rank - Progress function mapping values to [0, arity] (J2)
 *
 * @returns Stateful join automaton (J5: no further allocations)
 *
 * OPTIMIZATION NOTES:
 * - Uses closure for minimal object shape (hidden class stability)
 * - Hoists `value` and `arrived` to closure for faster access
 * - Avoids `this` lookup overhead in hot path
 * - V8 will inline `step` if monomorphic
 */
export function createJoin<R>(
  arity: number,
  bottom: R,
  join: (a: R, b: R) => R,
  rank: (v: R) => number,
): JoinFrame<R> {
  const _arity = arity;
  let value = bottom;
  let arrived = 0;
  let done = false;
  const _join = join;
  const _rank = rank;

  return {
    // this part is dev only, on real case we can use only property set like { arity }
    get arity() {
      return _arity;
    },
    set arity(_) {},
    // end dev only part
    
    get value() {
      return value;
    },
    set value(v) {
      value = v;
    },

    get arrived() {
      return arrived;
    },
    set arrived(a) {
      arrived = a;
    },

    get done() {
      return done;
    },
    set done(d) {
      done = d;
    },

    /**
     * HOT PATH: Monomorphic dispatch (J4).
     *
     * Optimization: Direct closure access avoids property lookup.
     * V8 optimization: Will be inlined if call site is monomorphic.
     */
    step(x: R): void {
      value = _join(value, x); // Lattice join (A1, A2 guarantee order-independence)
      arrived = _rank(value); // Update progress (J2: monotonic via lattice)
      done = arrived >= arity; // Check completion
    },
  } satisfies JoinFrame<R>;
}
