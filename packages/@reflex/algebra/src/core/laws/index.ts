export type { Law, LawSet } from "./laws"

// Lattice laws
export { latticeLaws, joinSemilatticeLaws, meetSemilatticeLaws } from "./lattice.laws"

// JoinFrame laws
export { joinframeAlgebraLaws, joinframeInvariantLaws } from "./joinframe.laws"

// Note: Eq and Order laws are in testkit/laws/ and typelevel/laws/
// They will be consolidated in Phase 2
