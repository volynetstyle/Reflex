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

// Только то, что реально требует slow path.
// Visited специально НЕ включаем.
export const SLOW_INVALIDATION_MASK =
  ReactiveNodeState.Invalid |
  ReactiveNodeState.Changed |
  ReactiveNodeState.Disposed |
  ReactiveNodeState.Tracking;

export const VISITED_MASK = ReactiveNodeState.Visited;
export const WATCHER_MASK = ReactiveNodeState.Watcher;
export const TRACKING_MASK = ReactiveNodeState.Tracking;
export const DISPOSED_MASK = ReactiveNodeState.Disposed;
