import type { Law, LawSet } from "./laws"
import type { Lattice, JoinSemilattice, MeetSemilattice } from "../lattice"

/**
 * latticeLaws
 *
 * Standard lattice algebraic laws.
 * For a given Lattice<T>, verify:
 * - Join commutativity: join(a, b) = join(b, a)
 * - Join associativity: join(join(a, b), c) = join(a, join(b, c))
 * - Meet commutativity: meet(a, b) = meet(b, a)
 * - Meet associativity: meet(meet(a, b), c) = meet(a, meet(b, c))
 * - Absorption: join(a, meet(a, b)) = a, meet(a, join(a, b)) = a
 * - Idempotence: join(a, a) = a, meet(a, a) = a
 *
 * @param lattice Lattice<T> instance
 * @param eq Equality test (a, b) => boolean
 * @param gen Generator for random T values
 */
export function latticeLaws<T>(
  lattice: Lattice<T>,
  eq: (a: T, b: T) => boolean,
  gen: () => T,
): LawSet {
  return [
    {
      name: "Join commutativity: join(a, b) = join(b, a)",
      check: () => {
        const a = gen()
        const b = gen()
        return eq(
          lattice.join(a, b),
          lattice.join(b, a),
        )
      },
    },
    {
      name: "Join associativity: join(join(a, b), c) = join(a, join(b, c))",
      check: () => {
        const a = gen()
        const b = gen()
        const c = gen()
        return eq(
          lattice.join(lattice.join(a, b), c),
          lattice.join(a, lattice.join(b, c)),
        )
      },
    },
    {
      name: "Meet commutativity: meet(a, b) = meet(b, a)",
      check: () => {
        const a = gen()
        const b = gen()
        return eq(
          lattice.meet(a, b),
          lattice.meet(b, a),
        )
      },
    },
    {
      name: "Meet associativity: meet(meet(a, b), c) = meet(a, meet(b, c))",
      check: () => {
        const a = gen()
        const b = gen()
        const c = gen()
        return eq(
          lattice.meet(lattice.meet(a, b), c),
          lattice.meet(a, lattice.meet(b, c)),
        )
      },
    },
    {
      name: "Absorption (join): join(a, meet(a, b)) = a",
      check: () => {
        const a = gen()
        const b = gen()
        return eq(
          lattice.join(a, lattice.meet(a, b)),
          a,
        )
      },
    },
    {
      name: "Absorption (meet): meet(a, join(a, b)) = a",
      check: () => {
        const a = gen()
        const b = gen()
        return eq(
          lattice.meet(a, lattice.join(a, b)),
          a,
        )
      },
    },
    {
      name: "Idempotence (join): join(a, a) = a",
      check: () => {
        const a = gen()
        return eq(
          lattice.join(a, a),
          a,
        )
      },
    },
    {
      name: "Idempotence (meet): meet(a, a) = a",
      check: () => {
        const a = gen()
        return eq(
          lattice.meet(a, a),
          a,
        )
      },
    },
  ]
}

/**
 * joinSemilatticeLaws
 *
 * Laws for JoinSemilattice<T> only (commutativity, associativity, idempotence).
 */
export function joinSemilatticeLaws<T>(
  semi: JoinSemilattice<T>,
  eq: (a: T, b: T) => boolean,
  gen: () => T,
): LawSet {
  return [
    {
      name: "Join commutativity",
      check: () => {
        const a = gen()
        const b = gen()
        return eq(semi.join(a, b), semi.join(b, a))
      },
    },
    {
      name: "Join associativity",
      check: () => {
        const a = gen()
        const b = gen()
        const c = gen()
        return eq(
          semi.join(semi.join(a, b), c),
          semi.join(a, semi.join(b, c)),
        )
      },
    },
    {
      name: "Join idempotence",
      check: () => {
        const a = gen()
        return eq(semi.join(a, a), a)
      },
    },
  ]
}

/**
 * meetSemilatticeLaws
 *
 * Laws for MeetSemilattice<T> only.
 */
export function meetSemilatticeLaws<T>(
  semi: MeetSemilattice<T>,
  eq: (a: T, b: T) => boolean,
  gen: () => T,
): LawSet {
  return [
    {
      name: "Meet commutativity",
      check: () => {
        const a = gen()
        const b = gen()
        return eq(semi.meet(a, b), semi.meet(b, a))
      },
    },
    {
      name: "Meet associativity",
      check: () => {
        const a = gen()
        const b = gen()
        const c = gen()
        return eq(
          semi.meet(semi.meet(a, b), c),
          semi.meet(a, semi.meet(b, c)),
        )
      },
    },
    {
      name: "Meet idempotence",
      check: () => {
        const a = gen()
        return eq(semi.meet(a, a), a)
      },
    },
  ]
}
