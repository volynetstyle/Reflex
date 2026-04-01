import { DIRTY_STATE, ReactiveNodeState, WALKER_STATE } from "../shape";

export const NON_IMMEDIATE = 0;
export const IMMEDIATE = 1;

export const INVALIDATION_SLOW_PATH_MASK =
  DIRTY_STATE | ReactiveNodeState.Disposed | WALKER_STATE;
