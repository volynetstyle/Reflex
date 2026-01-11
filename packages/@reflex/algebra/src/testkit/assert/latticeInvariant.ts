import type { Lattice } from "../../core/lattice"

/**
 * LatticeInvariantOptions
 *
 * Options for lattice invariant checking.
 */
export interface LatticeInvariantOptions {
  testAbsorption?: boolean
  testIdempotence?: boolean
  testCommutativity?: boolean
}

/**
 * assertLatticeInvariant
 *
 * Verify that a Lattice<T> satisfies key invariants.
 * Throws if any invariant fails.
 *
 * @param lattice Lattice<T> instance
 * @param eq Equality function
 * @param samples Sample values to test
 * @param options Which invariants to check
 */
export function assertLatticeInvariant<T>(
  lattice: Lattice<T>,
  eq: (a: T, b: T) => boolean,
  samples: readonly T[],
  options: LatticeInvariantOptions = {},
): void {
  const {
    testAbsorption = true,
    testIdempotence = true,
    testCommutativity = true,
  } = options

  for (const a of samples) {
    for (const b of samples) {
      // Absorption
      if (testAbsorption) {
        const joinAbsorb = lattice.join(a, lattice.meet(a, b))
        if (!eq(joinAbsorb, a)) {
          throw new Error(
            `Absorption (join) failed: join(a, meet(a, b)) !== a`,
          )
        }

        const meetAbsorb = lattice.meet(a, lattice.join(a, b))
        if (!eq(meetAbsorb, a)) {
          throw new Error(
            `Absorption (meet) failed: meet(a, join(a, b)) !== a`,
          )
        }
      }

      // Idempotence
      if (testIdempotence) {
        const joinIdem = lattice.join(a, a)
        if (!eq(joinIdem, a)) {
          throw new Error(`Idempotence (join) failed: join(a, a) !== a`)
        }

        const meetIdem = lattice.meet(a, a)
        if (!eq(meetIdem, a)) {
          throw new Error(`Idempotence (meet) failed: meet(a, a) !== a`)
        }
      }

      // Commutativity
      if (testCommutativity) {
        const joinComm = eq(
          lattice.join(a, b),
          lattice.join(b, a),
        )
        if (!joinComm) {
          throw new Error(
            `Commutativity (join) failed: join(a, b) !== join(b, a)`,
          )
        }

        const meetComm = eq(
          lattice.meet(a, b),
          lattice.meet(b, a),
        )
        if (!meetComm) {
          throw new Error(
            `Commutativity (meet) failed: meet(a, b) !== meet(b, a)`,
          )
        }
      }
    }
  }
}
