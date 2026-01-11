/**
 * JoinFrame Algebraic Requirements (A1-A3)
 *
 * This module formalizes the algebraic laws that the join function
 * must satisfy for use in a JoinFrame.
 *
 * The join operation is the core operation that aggregates values.
 * It MUST be commutative, associative, and idempotent.
 */

/**
 * A1: Commutativity
 *
 * The order of join operations does not matter.
 *
 * Law: join(join(bottom, a), b) === join(join(bottom, b), a)
 *
 * Semantics: Events may be delivered in any order; the final state is the same.
 *
 * Example (max lattice):
 * join(join(0, 5), 3) = max(max(0, 5), 3) = max(5, 3) = 5
 * join(join(0, 3), 5) = max(max(0, 3), 5) = max(3, 5) = 5
 * Both equal 5 ✓
 */
export const A1_COMMUTATIVITY = {
  name: "A1: Commutativity",
  description: "join(join(r, a), b) === join(join(r, b), a)",
  example: {
    operation: "max",
    bottom: 0,
    a: 5,
    b: 3,
    result: 5,
    orderA_then_B: "max(max(0, 5), 3) = 5",
    orderB_then_A: "max(max(0, 3), 5) = 5",
  },
} as const

/**
 * A2: Associativity
 *
 * The grouping of join operations does not matter.
 *
 * Law: join(join(r, a), b) === join(r, join(a, b))
 *
 * Semantics: Partial results can be combined in any grouping.
 *
 * Example (max lattice):
 * join(join(0, 5), 3) = max(max(0, 5), 3) = max(5, 3) = 5
 * join(0, join(5, 3)) = max(0, max(5, 3)) = max(0, 5) = 5
 * Both equal 5 ✓
 */
export const A2_ASSOCIATIVITY = {
  name: "A2: Associativity",
  description: "join(join(r, a), b) === join(r, join(a, b))",
  example: {
    operation: "max",
    bottom: 0,
    a: 5,
    b: 3,
    result: 5,
    left_assoc: "max(max(0, 5), 3) = 5",
    right_assoc: "max(0, max(5, 3)) = 5",
  },
} as const

/**
 * A3: Idempotence
 *
 * Receiving the same value twice does not change the result.
 *
 * Law: join(join(r, a), a) === join(r, a)
 *
 * Semantics: Duplicate events are harmless.
 * This is crucial for fault tolerance: retries or message duplication don't corrupt state.
 *
 * Example (max lattice):
 * join(join(0, 5), 5) = max(max(0, 5), 5) = max(5, 5) = 5
 * join(0, 5) = max(0, 5) = 5
 * Both equal 5 ✓
 *
 * Counter-example (non-idempotent: addition):
 * join(join(0, 5), 5) = (0 + 5) + 5 = 10
 * join(0, 5) = 0 + 5 = 5
 * Not equal! ✗ (Addition is associative & commutative but NOT idempotent)
 */
export const A3_IDEMPOTENCE = {
  name: "A3: Idempotence",
  description: "join(join(r, a), a) === join(r, a)",
  example: {
    operation: "max",
    bottom: 0,
    value: 5,
    result: 5,
    duplicate: "max(max(0, 5), 5) = 5",
    single: "max(0, 5) = 5",
  },
  counter_example: {
    operation: "addition (not idempotent)",
    bottom: 0,
    value: 5,
    duplicate: "(0 + 5) + 5 = 10",
    single: "0 + 5 = 5",
    note: "Addition is commutative & associative, but NOT idempotent",
  },
} as const

/**
 * Consequence of A1-A3
 *
 * **No scheduler required.**
 * Any delivery order is semantically correct.
 * Events can be delivered:
 * - Out of order ✓ (commutativity)
 * - In groups or singly ✓ (associativity)
 * - Multiple times ✓ (idempotence)
 *
 * The JoinFrame automaton will reach the same final state regardless.
 */
export const CONSEQUENCE_NO_SCHEDULER_NEEDED = {
  title: "No scheduler required",
  description:
    "Any delivery order, grouping, and duplication yields the same final state",
} as const
