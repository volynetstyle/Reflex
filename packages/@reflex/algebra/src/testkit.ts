/**
 * @reflex/algebra/testkit
 *
 * Testing infrastructure: arbitraries, law checkers, and invariant assertions.
 *
 * Usage:
 * ```typescript
 * import { coordsArb, assertLatticeInvariant } from "algebra/testkit"
 * import { latticeMaxNumber } from "algebra"
 *
 * const arb = coordsArb()
 * const lat = latticeMaxNumber()
 *
 * assertLatticeInvariant(lat, Object.is, [arb(), arb(), arb()])
 * ```
 */

// Arbitraries (generators for property testing)
export { coordsArb, coordsArbSmall, coordsArbLarge } from "./testkit/arb"
export { latticeNumberArb, latticeSetArb, latticeArrayArb } from "./testkit/arb"

// Law checkers
export { checkLaws, checkLawsFC } from "./testkit/laws"

// Invariant assertions
export { assertLatticeInvariant, assertJoinframeInvariant } from "./testkit/assert"
export type { LatticeInvariantOptions, JoinFrameInvariantOptions } from "./testkit/assert"
