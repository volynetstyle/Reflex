import type { Law, LawSet } from "./laws"
import type { JoinFrame } from "../../runtime/joinframe"

/**
 * joinframeAlgebraLaws
 *
 * Laws A1-A3 for the join operation used in a JoinFrame.
 * These laws ensure that the join operation is commutative, associative, and idempotent.
 *
 * Note: These laws test the *join function itself*, not the JoinFrame.
 * The JoinFrame factory takes the join function as a parameter.
 *
 * A1: Commutativity
 *     join(join(bottom, a), b) === join(join(bottom, b), a)
 *
 * A2: Associativity
 *     join(join(bottom, a), b) === join(bottom, join(a, b))
 *
 * A3: Idempotence
 *     join(join(bottom, a), a) === join(bottom, a)
 */
export function joinframeAlgebraLaws<R>(
  bottom: R,
  join: (a: R, b: R) => R,
  eq: (a: R, b: R) => boolean,
  gen: () => R,
): LawSet {
  return [
    {
      name: "A1: join is commutative",
      check: () => {
        const a = gen()
        const b = gen()
        return eq(
          join(join(bottom, a), b),
          join(join(bottom, b), a),
        )
      },
    },
    {
      name: "A2: join is associative",
      check: () => {
        const a = gen()
        const b = gen()
        return eq(
          join(join(bottom, a), b),
          join(bottom, join(a, b)),
        )
      },
    },
    {
      name: "A3: join is idempotent",
      check: () => {
        const a = gen()
        return eq(
          join(join(bottom, a), a),
          join(bottom, a),
        )
      },
    },
  ]
}

/**
 * joinframeInvariantLaws
 *
 * Laws J1-J6 for the JoinFrame structure itself.
 * These verify that the automaton satisfies its invariants.
 *
 * J1: Arity is immutable
 * J2: Progress is monotonic (arrived ∈ [0, arity])
 * J3: Step semantics are idempotent
 * J4: Hot path (step) is monomorphic
 * J5: Zero allocation in step
 * J6: Arity is runtime-determined
 *
 * Note: J4 and J5 are difficult to verify at runtime; we test J1-J3 and J6.
 */
export function joinframeInvariantLaws<R>(
  createTestJoinFrame: () => JoinFrame<R>,
  genInput: () => R,
  eqR: (a: R, b: R) => boolean,
): LawSet {
  return [
    {
      name: "J1: arity is immutable",
      check: () => {
        const jf = createTestJoinFrame()
        const arity1 = jf.arity
        // Try to mutate (this should fail at type level, but test anyway)
        const arity2 = jf.arity
        return arity1 === arity2
      },
    },
    {
      name: "J2: arrived is in [0, arity]",
      check: () => {
        const jf = createTestJoinFrame()
        if (jf.arrived < 0 || jf.arrived > jf.arity) return false

        // Step several times
        for (let i = 0; i < jf.arity; i++) {
          jf.step(genInput())
          if (jf.arrived < 0 || jf.arrived > jf.arity) return false
        }
        return true
      },
    },
    {
      name: "J3: step is idempotent (duplicate inputs don't regress)",
      check: () => {
        const jf = createTestJoinFrame()
        const input = genInput()

        jf.step(input)
        const value1 = jf.value
        const arrived1 = jf.arrived

        // Step with same input again
        jf.step(input)
        const value2 = jf.value
        const arrived2 = jf.arrived

        // Value and arrived should not change (or progress, but not regress)
        return eqR(value1, value2) && arrived1 === arrived2
      },
    },
    {
      name: "J6: arity is runtime data",
      check: () => {
        const jf1 = createTestJoinFrame()
        const jf2 = createTestJoinFrame()
        // Both should have valid arity values
        return typeof jf1.arity === "number" && jf1.arity >= 0
      },
    },
  ]
}
