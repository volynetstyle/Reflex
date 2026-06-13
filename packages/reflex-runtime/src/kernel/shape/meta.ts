import type ReactiveNode from "./node";

/**
 * Bit flags describing the current role and lifecycle state of a reactive node.
 *
 * Layout:
 * - exactly one kind bit should normally be present: Producer / Consumer / Watcher
 * - dirty bits are mutually exclusive in supported flows: Invalid or Changed
 * - walker bits (`Visited`, `Computing`) are transient and only meaningful during
 *   propagation / pull-walk execution
 *
 * High-level semantics:
 * - `Changed` means "upstream change is already confirmed, recompute directly"
 * - `Invalid` means "upstream may have changed, verify through shouldRecompute()"
 * - producers commit on write and should not normally participate in pull-walk
 */
export const Invalid = 1 << 0; // 1
export const Changed = 1 << 1; // 2
export const Visited = 1 << 2; // 4
export const Computing = 1 << 3; // 8

export const Watcher = 1 << 5; // 32
export const Scheduled = 1 << 6; // 64

export const Producer = 1 << 28;
/**
 * Only available in the development environment (DEV),
 * as it is not required in the production environment
 * prod) under heavy use (hot path).
 */
export const Consumer = __DEV__ ? 1 << 29 : 0;

export type ReactiveNodeState = number;

/** Mask for the mutually-exclusive node kind bits. */
export const NODE_KIND_STATE = Producer | Consumer | Watcher;

// export const MAYBE_CHANGE_STATE = ReactiveNodeState.Invalid;
// export const CHANGED_STATE = ReactiveNodeState.Changed;

/** All dirty bits. In supported runtime flows this is either `Invalid` or `Changed`. */
export const DIRTY_STATE = Invalid | Changed;

/** Clean producer. Normal steady state for source nodes. */
export const PRODUCER_INITIAL_STATE = Producer;

/**
 * Legacy/testing helper for a producer carrying `Changed`.
 * Runtime write flow should normally commit producers immediately instead.
 */
export const PRODUCER_CHANGED = Producer | Changed;

/** Legacy/testing helper for any dirty producer state. */
export const PRODUCER_DIRTY = Producer | DIRTY_STATE;

/** Directly invalidated computed node: skip verification and recompute on read. */
export const CONSUMER_CHANGED = Changed | Consumer;

/** Computed node carrying either `Invalid` or `Changed`. */
export const CONSUMER_DIRTY = Consumer | DIRTY_STATE;

/** Directly invalidated watcher. */
export const WATCHER_CHANGED = Changed | Watcher;

/** Transient walker-only bits that should not survive a settled execution. */
export const WALKER_STATE = Visited | Computing;

/** Clear the re-entrant marker after the walker no longer needs it. */
//
export function clearNodeVisited(node: ReactiveNode): void {
  node.state &= ~Visited;
}

/** Mark a node as actively executing its compute function. */
//
export function markNodeComputing(node: ReactiveNode): void {
  node.state = (node.state & ~Visited) | Computing | Computing;
}

/** Clear the active-computation marker. */
//
export function clearNodeComputing(node: ReactiveNode): void {
  node.state &= ~(Computing | Computing);
}

/** Clear both `Invalid` and `Changed`, returning the node to a clean state. */
//
export function clearDirtyState(node: ReactiveNode): void {
  node.state &= ~DIRTY_STATE;
}
