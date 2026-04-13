import { ReactiveNodeState } from "../shape";

/**
 * Promotion mode for transitive subscribers: mark them as Invalid.
 *
 * This tells them "maybe changed, verify dependencies and then recompute".
 */
export const PROMOTE_INVALID = ReactiveNodeState.Invalid;

/**
 * Promotion mode for direct subscribers: mark them as Changed.
 *
 * This tells them "definitely changed, don't verify, recompute".
 */
export const PROMOTE_CHANGED = ReactiveNodeState.Changed;

export const ALREADY_DIRTY_MASK =
  ReactiveNodeState.Invalid |
  ReactiveNodeState.Changed;

export const TERMINAL_MASK = ReactiveNodeState.Disposed;
export const TRANSITIONAL_MASK = ReactiveNodeState.Tracking;
export const TRAVERSAL_GUARD_MASK = ReactiveNodeState.Visited;

// Only states that truly require slow-path invalidation handling.
// Visited is intentionally excluded.
export const SLOW_INVALIDATION_MASK =
  ALREADY_DIRTY_MASK |
  TERMINAL_MASK |
  TRANSITIONAL_MASK;

export const VISITED_MASK = TRAVERSAL_GUARD_MASK;
export const WATCHER_MASK = ReactiveNodeState.Watcher;
export const TRACKING_MASK = TRANSITIONAL_MASK;
export const DISPOSED_MASK = TERMINAL_MASK;

// Backward-compatible aliases for existing imports and tests.
export const NON_IMMEDIATE = PROMOTE_INVALID;
export const IMMEDIATE = PROMOTE_CHANGED;
export const CAN_ESCAPE_INVALIDATION =
  ALREADY_DIRTY_MASK |
  TERMINAL_MASK |
  TRAVERSAL_GUARD_MASK |
  TRANSITIONAL_MASK;
