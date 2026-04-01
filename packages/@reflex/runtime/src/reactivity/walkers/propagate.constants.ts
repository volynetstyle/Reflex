import { DIRTY_STATE, ReactiveNodeState, WALKER_STATE } from "../shape";

/**
 * NON_IMMEDIATE flag: somwhere in the middle subscribers are promoted Invalid.
 * 
 * This tells them "maybe changed, verify dependencies and then recompute"
 */
export const NON_IMMEDIATE = 0;

/**
 * IMMEDIATE flag: direct subscribers are promoted from Invalid → Changed.
 * 
 * This tells them "definitely changed, don't verify, recompute"
 */
export const IMMEDIATE = 1;

export const INVALIDATION_SLOW_PATH_MASK =
  DIRTY_STATE | ReactiveNodeState.Disposed | WALKER_STATE;
