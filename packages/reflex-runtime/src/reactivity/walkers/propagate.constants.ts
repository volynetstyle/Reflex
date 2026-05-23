import { Changed, Disposed, Invalid, Reentrant, Tracking, Watcher } from "../shape";

/**
 * Promotion mode for transitive subscribers: mark them as Invalid.
 *
 * This tells them "maybe changed, verify dependencies and then recompute".
 */
export const PROMOTE_INVALID = Invalid;

/**
 * Promotion mode for direct subscribers: mark them as Changed.
 *
 * This tells them "definitely changed, don't verify, recompute".
 */
export const PROMOTE_CHANGED = Changed;

export const DIRTY_SUBSCRIBER_MASK =
  Invalid |
  Changed;

export const DISPOSED_STATE_MASK = Disposed;
export const TRACKING_STATE_MASK = Tracking;
export const REENTRANT_STATE_MASK = Reentrant;

// Only states that truly require slow-path invalidation handling.
// Visited is intentionally excluded.
export const SLOW_PATH_INVALIDATION_MASK =
  DIRTY_SUBSCRIBER_MASK |
  DISPOSED_STATE_MASK |
  TRACKING_STATE_MASK;

export const VISITED_MASK = REENTRANT_STATE_MASK;
export const WATCHER_MASK = Watcher;
export const TRACKING_MASK = TRACKING_STATE_MASK;
export const DISPOSED_MASK = DISPOSED_STATE_MASK;

// Backward-compatible aliases for existing imports and tests.
export const ALREADY_DIRTY_MASK = DIRTY_SUBSCRIBER_MASK;
export const TERMINAL_MASK = DISPOSED_STATE_MASK;
export const TRANSITIONAL_MASK = TRACKING_STATE_MASK;
export const TRAVERSAL_GUARD_MASK = REENTRANT_STATE_MASK;
export const SLOW_INVALIDATION_MASK = SLOW_PATH_INVALIDATION_MASK;

export const NON_IMMEDIATE = PROMOTE_INVALID;
export const IMMEDIATE = PROMOTE_CHANGED;
export const CAN_ESCAPE_INVALIDATION =
  DIRTY_SUBSCRIBER_MASK |
  DISPOSED_STATE_MASK |
  REENTRANT_STATE_MASK |
  TRACKING_STATE_MASK;
