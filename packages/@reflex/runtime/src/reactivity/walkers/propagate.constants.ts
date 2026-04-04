import { ReactiveNodeState } from "../shape";

/**
 * NON_IMMEDIATE flag: somwhere in the middle subscribers are promoted Invalid.
 *
 * This bit tell them "deps `maybe` changed, verify them and then `maybe` recompute"
 * 
 * See? Two-maybe rule.
 */
export const NON_IMMEDIATE = ReactiveNodeState.Invalid;

/**
 * IMMEDIATE flag: direct subscribers are promoted from Invalid → Changed.
 *
 * This bit tell them "definitely changed, don't verify, recompute"
 */
export const IMMEDIATE = ReactiveNodeState.Changed;

export const CAN_ESCAPE_INVALIDATION =
  ReactiveNodeState.Invalid |
  ReactiveNodeState.Changed |
  ReactiveNodeState.Disposed |
  ReactiveNodeState.Visited |
  ReactiveNodeState.Tracking;
