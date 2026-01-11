/**
 * JoinFrame — Zero-Allocation Join Coordination Primitive
 * ========================================================
 *
 * NOTE:
 * The lattice defines value aggregation semantics only.
 * JoinFrame itself is an operational coordination mechanism
 * and is NOT part of the causal graph.
 *
 * ONTOLOGICAL NOTE:
 * JoinFrame does not represent an event.
 * It coordinates events and, upon completion, may trigger
 * the creation of a derived GraphNode elsewhere.
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
 * Creates a zero-allocation join frame with join-semilattice semantics.
 *
 * @param arity  - Number of required arrivals to complete (J1: immutable).
 * @param bottom - Identity element ⊥ (neutral for join):  join(⊥, x) = x.
 * @param join   - Join operator ⊔ used to aggregate arrivals.
 *                 Algebraic requirements (A1..A3):
 *                 A1: Associativity:  (a ⊔ b) ⊔ c = a ⊔ (b ⊔ c)
 *                 A2: Commutativity:  a ⊔ b = b ⊔ a
 *                 A3: Idempotence (recommended): a ⊔ a = a
 *                 Note: A3 is optional, but without it duplicates may inflate progress (see rank).
 * @param rank   - Progress measure r: V -> [0..arity] (J2).
 *                 Must be monotone w.r.t. join:
 *                 r(a ⊔ b) >= max(r(a), r(b)).
 *                 Completion condition: r(value) >= arity.
 *
 * @returns Stateful join automaton (J5: steady-state has no further allocations).
 *
 * PERFORMANCE / IMPLEMENTATION NOTES:
 * - Closure-based storage keeps object shape stable (hidden class stability).
 * - Hoists `value` and `arrived` into closure for fast access.
 * - Avoids `this` and prototype lookups in hot path.
 * - V8 can inline `step()` if callsite stays monomorphic.
 *
 * CONCEPTUAL MODEL:
 * This is a join-semilattice aggregator:
 *   - ⊥ is the initial state (bottom / identity)
 *   - ⊔ merges partial information in an order-independent way
 *   - rank provides an application-specific completion metric
 *     (not necessarily a simple counter).
 *
 * COMMON LATTICE / SEMILATTICE INSTANCES SUITABLE FOR JoinFrame:
 *
 * | Structure                 | bottom (⊥)              | join (⊔)                         | rank example                     | Typical reactive use-cases                       | Idempotent |
 * |--------------------------|-------------------------|----------------------------------|----------------------------------|--------------------------------------------------|-----------|
 * | Max (latest-wins by max) | -Infinity / 0           | Math.max                         | v => v                           | “max-progress wins”, monotone checkpoints        | yes       |
 * | Set union                | empty Set               | (A,B) => A ∪ B                   | s => s.size                      | Unique IDs/tags collection                       | yes       |
 * | Vector-clock merge       | [0..0]                  | component-wise max               | vc => sum(vc) (or other)         | Causal merge / concurrency detection             | yes       |
 * | G-Counter                | [0..0]                  | component-wise max               | gc => sum(gc)                    | CRDT distributed counters (monotone increments)  | yes       |
 * | Sum accumulator          | 0                       | (a,b) => a + b                   | x => x / threshold (or clamp)    | Metrics batching, weighted aggregation           | no*       |
 * | Tuple append / concat    | []                      | (a,b) => a.concat(b)             | xs => xs.length                  | Ordered event log / delivery sequence            | no        |
 * | Last value (overwrite)   | undefined               | (_, b) => b                      | _ => 0 or 1                      | “last message wins” latch / simple replace       | yes       |
 *
 * * Sum is not idempotent; to recover idempotence sources must provide deltas,
 *   or attach deduplication keys, or aggregate via a set/map then sum.
 */
export const createJoin = <R>(
  arity: number,
  bottom: R,
  join: (a: R, b: R) => R,
  rank: (v: R) => number,
): JoinFrame<R> => {
  const _arity = arity;
  let value = bottom,
    arrived = 0,
    done = false;
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
    step: (x: R): void => {
      value = _join(value, x); // Lattice join (A1, A2 guarantee order-independence)
      arrived = _rank(value); // Update progress (J2: monotonic via lattice)
      done = arrived >= arity; // Check completion
    },
  } satisfies JoinFrame<R>;
};
