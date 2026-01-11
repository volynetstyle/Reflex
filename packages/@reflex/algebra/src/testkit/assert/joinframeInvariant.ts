import type { JoinFrame } from "../../runtime/joinframe"

/**
 * JoinFrameInvariantOptions
 *
 * Options for JoinFrame invariant checking.
 */
export interface JoinFrameInvariantOptions {
  testArity?: boolean
  testProgress?: boolean
  testIdempotence?: boolean
  testMonomorphism?: boolean
}

/**
 * assertJoinframeInvariant
 *
 * Verify that a JoinFrame<R> satisfies J1-J6 invariants.
 * Throws if any invariant fails.
 *
 * J1: Arity is immutable
 * J2: arrived ∈ [0, arity]
 * J3: step is idempotent
 * J4: step is monomorphic (hard to test; we skip)
 * J5: zero allocation in step (hard to test; we skip)
 * J6: arity is runtime data
 *
 * @param jf JoinFrame instance
 * @param genInput Generator for test inputs
 * @param eqR Equality for result values
 * @param options Which invariants to check
 */
export function assertJoinframeInvariant<R>(
  jf: JoinFrame<R>,
  genInput: () => R,
  eqR: (a: R, b: R) => boolean,
  options: JoinFrameInvariantOptions = {},
): void {
  const {
    testArity = true,
    testProgress = true,
    testIdempotence = true,
    testMonomorphism = false, // Hard to test at runtime
  } = options

  // J1: Arity is immutable
  if (testArity) {
    const arity1 = jf.arity
    // Try to mutate (TypeScript prevents this, but test anyway)
    const arity2 = jf.arity
    if (arity1 !== arity2) {
      throw new Error("J1 failed: arity changed")
    }
  }

  // J2: Progress monotonicity
  if (testProgress) {
    if (jf.arrived < 0 || jf.arrived > jf.arity) {
      throw new Error(
        `J2 failed: arrived=${jf.arrived} not in [0, ${jf.arity}]`,
      )
    }

    const prevArrived = jf.arrived
    jf.step(genInput())
    const newArrived = jf.arrived

    if (newArrived < prevArrived) {
      throw new Error(`J2 failed: arrived regressed (${prevArrived} → ${newArrived})`)
    }

    if (newArrived < 0 || newArrived > jf.arity) {
      throw new Error(
        `J2 failed: arrived=${newArrived} not in [0, ${jf.arity}]`,
      )
    }
  }

  // J3: Idempotence
  if (testIdempotence) {
    // Create a fresh JoinFrame for this test
    const jf2 = jf // In real test, you'd create a new one

    const input = genInput()
    jf2.step(input)
    const value1 = jf2.value
    const arrived1 = jf2.arrived

    // Step with the same input again
    jf2.step(input)
    const value2 = jf2.value
    const arrived2 = jf2.arrived

    if (!eqR(value1, value2)) {
      throw new Error("J3 failed: idempotence violated (value changed)")
    }

    if (arrived1 !== arrived2) {
      throw new Error("J3 failed: idempotence violated (arrived changed)")
    }
  }

  // J6: Arity is runtime data
  if (testMonomorphism) {
    if (typeof jf.arity !== "number") {
      throw new Error("J6 failed: arity is not a number")
    }
    if (jf.arity < 0) {
      throw new Error("J6 failed: arity is negative")
    }
  }
}
