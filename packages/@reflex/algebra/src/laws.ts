/**
 * @reflex/algebra/laws
 *
 * Law definitions and checkers for testing.
 *
 * Usage:
 * ```typescript
 * import { checkLaws, latticeLaws } from "algebra/laws"
 * import { latticeMaxNumber } from "algebra"
 *
 * const lat = latticeMaxNumber()
 * const laws = latticeLaws(lat, Object.is, () => Math.random() * 100)
 * checkLaws(laws, 100)
 * ```
 */

export type { Law, LawSet } from "./core/laws/laws"

// Law definitions
export {
  latticeLaws,
  joinSemilatticeLaws,
  meetSemilatticeLaws,
} from "./core/laws/lattice.laws"
export { joinframeAlgebraLaws, joinframeInvariantLaws } from "./core/laws/joinframe.laws"

// Existing law definitions (in testkit + typelevel, consolidated in Phase 2)
// These will be moved to core/laws/ and re-exported here
// For now, import from their original locations if needed:
// import { eqLaws } from "@reflex/algebra/testkit"
// import { preorderLaws, posetLaws } from "@reflex/algebra/testkit"

// Law checkers
export { checkLaws, checkLawsFC } from "./testkit/laws"
