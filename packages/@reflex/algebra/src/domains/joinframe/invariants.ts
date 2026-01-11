/**
 * JoinFrame Invariants (J1-J6)
 *
 * This module formalizes the invariants that a JoinFrame must satisfy.
 * These are type-level descriptions of the properties; runtime checks
 * are in testkit/assert/joinframeInvariant.ts.
 */

/**
 * J1: Arity Stability
 *
 * The `arity` field is immutable for the lifetime of the JoinFrame.
 * Rationale: Enables V8 constant folding and eliminates boundary checks.
 *
 * Type-level witness:
 */
export const J1_ARITY_STABILITY = {
  description: "arity is readonly and immutable",
} as const

/**
 * J2: Progress Monotonicity
 *
 * The `arrived` field is derived from rank(value) and is in [0, arity].
 * Progress strictly increases (or stays the same) via lattice operations.
 *
 * Invariant: 0 ≤ arrived ≤ arity
 * Law: if arrived₁ = arrived₂, then rank(value₁) = rank(value₂)
 *
 * Type-level witness:
 */
export const J2_PROGRESS_MONOTONICITY = {
  description: "arrived ∈ [0, arity] and only increases",
} as const

/**
 * J3: Idempotent Step Semantics
 *
 * The `step(input)` method may be called arbitrarily.
 * Logical progress is determined by lattice growth (via join).
 * Duplicate events don't regress state (assuming A3: idempotence of join).
 *
 * Law: step(x); step(x) === step(x)
 *      (Calling step twice with same input equals calling once)
 *
 * Type-level witness:
 */
export const J3_IDEMPOTENT_STEP = {
  description: "calling step(x) twice equals calling it once",
} as const

/**
 * J4: Monomorphic Hot Path
 *
 * The `step` method is monomorphic (same input type throughout the lifetime).
 * No polymorphic dispatch, no hidden classes, no inline cache misses.
 *
 * Rationale: Enables V8 inline caching and JIT compilation.
 *
 * Type-level witness (via TypeScript generics):
 * JoinFrame<R> has step(input: R) where R is fixed.
 */
export const J4_MONOMORPHIC_HOT_PATH = {
  description: "step() never changes input type (monomorphic)",
} as const

/**
 * J5: Zero Post-Construction Allocation
 *
 * All memory is allocated at JoinFrame creation.
 * The hot path (step) does not allocate new objects.
 *
 * Rationale: Predictable GC behavior; no GC pauses during step.
 *
 * Note: Hard to verify at runtime. Relies on code review and profiling.
 */
export const J5_ZERO_ALLOCATION = {
  description: "step() allocates zero new objects (GC-free hot path)",
} as const

/**
 * J6: Runtime Arity
 *
 * Arity is stored as runtime data (not as type-level Arity extends number).
 * This allows dynamic join patterns with unknown arity at compile time.
 *
 * Invariant: typeof arity === "number" && arity >= 0
 *
 * Type-level witness:
 * arity: number (not arity: Arity extends number)
 */
export const J6_RUNTIME_ARITY = {
  description: "arity is a runtime number, not a type-level constant",
} as const
