import { ReactiveNodeState } from "../shape";

/**
 * NON_IMMEDIATE flag: somwhere in the middle subscribers are promoted Invalid.
 *
 * This tells them "maybe changed, verify dependencies and then recompute"
 */
export const NON_IMMEDIATE = ReactiveNodeState.Invalid;

/**
 * IMMEDIATE flag: direct subscribers are promoted from Invalid → Changed.
 *
 * This tells them "definitely changed, don't verify, recompute"
 */
export const IMMEDIATE = ReactiveNodeState.Changed;

export const CAN_ESCAPE_INVALIDATION =
  ReactiveNodeState.Invalid |
  ReactiveNodeState.Changed |
  ReactiveNodeState.Disposed |
  ReactiveNodeState.Visited |
  ReactiveNodeState.Tracking;
