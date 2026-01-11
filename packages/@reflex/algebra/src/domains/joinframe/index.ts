// Export everything from the existing joinFrame module
export type { JoinFnTuple, JoinNode, Join2, Join3, JoinFrame } from "../join/joinFrame"
export { createJoin } from "../join/joinFrame"

// Export invariant and algebra documentation
export {
  J1_ARITY_STABILITY,
  J2_PROGRESS_MONOTONICITY,
  J3_IDEMPOTENT_STEP,
  J4_MONOMORPHIC_HOT_PATH,
  J5_ZERO_ALLOCATION,
  J6_RUNTIME_ARITY,
} from "./invariants"

export {
  A1_COMMUTATIVITY,
  A2_ASSOCIATIVITY,
  A3_IDEMPOTENCE,
  CONSEQUENCE_NO_SCHEDULER_NEEDED,
} from "./algebra"
