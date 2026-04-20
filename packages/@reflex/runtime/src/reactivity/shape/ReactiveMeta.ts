import type ReactiveNode from "./ReactiveNode";

/**
 * Bit flags describing the current role and lifecycle state of a reactive node.
 *
 * Layout:
 * - exactly one kind bit should normally be present: Producer / Consumer / Watcher
 * - dirty bits are mutually exclusive in supported flows: Invalid or Changed
 * - walker bits (`Visited`, `Tracking`) are transient and only meaningful during
 *   propagation / pull-walk execution
 *
 * High-level semantics:
 * - `Changed` means "upstream change is already confirmed, recompute directly"
 * - `Invalid` means "upstream may have changed, verify through shouldRecompute()"
 * - producers commit on write and should not normally participate in pull-walk
 */
const PRODUCER = 1 << 0;
const CONSUMER = 1 << 1;
const WATCHER = 1 << 2;
const INVALID = 1 << 3;
const CHANGED = 1 << 4;
const REENTRANT = 1 << 5;
const DISPOSED = 1 << 6;
const COMPUTING = 1 << 7;
const SCHEDULED = 1 << 8;
const TRACKING = 1 << 9;

export const ReactiveNodeState = {
  /** Mutable source node. Holds committed payload directly and never recomputes. */
  Producer: PRODUCER,
  /** Pure computed node. Re-executes lazily when its dependencies become dirty. */
  Consumer: CONSUMER,
  /** Effect-like sink. Invalidations schedule or notify work rather than return data. */
  Watcher: WATCHER,

  /** Maybe stale: value is not confirmed changed yet and must be verified on read. */
  Invalid: INVALID,
  /** Definitely stale: a direct upstream dependency already confirmed a change. */
  Changed: CHANGED,
  /** Re-entrant marker used when a tracked dependency invalidates mid-computation. */
  Reentrant: REENTRANT,
  /** Terminal lifecycle state. Disposed nodes must no longer participate in the graph. */
  Disposed: DISPOSED,
  /** Node is currently executing its compute function. Used for cycle detection. */
  Computing: COMPUTING,
  /** Watcher has already been scheduled/notified for the current invalidation wave. */
  Scheduled: SCHEDULED,
  /** Node is collecting dependencies during the current computation pass. */
  Tracking: TRACKING,
} as const;

export type ReactiveNodeState =
  (typeof ReactiveNodeState)[keyof typeof ReactiveNodeState];

/** Mask for the mutually-exclusive node kind bits. */
export const NODE_KIND_STATE = PRODUCER | CONSUMER | WATCHER;

// export const MAYBE_CHANGE_STATE = ReactiveNodeState.Invalid;
// export const CHANGED_STATE = ReactiveNodeState.Changed;

/** All dirty bits. In supported runtime flows this is either `Invalid` or `Changed`. */
export const DIRTY_STATE = INVALID | CHANGED;

/** Clean producer. Normal steady state for source nodes. */
export const PRODUCER_INITIAL_STATE = PRODUCER;

/**
 * Legacy/testing helper for a producer carrying `Changed`.
 * Runtime write flow should normally commit producers immediately instead.
 */
export const PRODUCER_CHANGED =
  PRODUCER | CHANGED;

/** Legacy/testing helper for any dirty producer state. */
export const PRODUCER_DIRTY = PRODUCER | DIRTY_STATE;

/** Directly invalidated computed node: skip verification and recompute on read. */
export const CONSUMER_CHANGED =
  CHANGED | CONSUMER;

/** Computed node carrying either `Invalid` or `Changed`. */
export const CONSUMER_DIRTY = CONSUMER | DIRTY_STATE;

/** Directly invalidated watcher. */
export const WATCHER_CHANGED = CHANGED | WATCHER;

/** Transient walker-only bits that should not survive a settled execution. */
export const WALKER_STATE = REENTRANT | TRACKING;

/** Clear the re-entrant marker after the walker no longer needs it. */
export function clearNodeVisited(node: ReactiveNode): void {
  node.state &= ~REENTRANT;
}

/** Enter dependency collection mode for the current compute pass. */
export function beginNodeTracking(node: ReactiveNode): void {
  node.state = (node.state & ~REENTRANT) | TRACKING;
}

/** Leave dependency collection mode after compute finishes. */
export function clearNodeTracking(node: ReactiveNode): void {
  node.state &= ~TRACKING;
}

/** Mark a node as actively executing its compute function. */
export function markNodeComputing(node: ReactiveNode): void {
  node.state |= COMPUTING;
}

/** Clear the active-computation marker. */
export function clearNodeComputing(node: ReactiveNode): void {
  node.state &= ~COMPUTING;
}

/** Clear both `Invalid` and `Changed`, returning the node to a clean state. */
export function clearDirtyState(node: ReactiveNode): void {
  node.state &= ~DIRTY_STATE;
}

/** Runtime helper for the terminal lifecycle check. */
export function isDisposedNode(node: ReactiveNode): boolean {
  return (node.state & DISPOSED) !== 0;
}

/** Collapse a node to kind + disposed, dropping transient execution flags. */
export function markDisposedNode(node: ReactiveNode): void {
  node.state = (node.state & NODE_KIND_STATE) | DISPOSED;
}
