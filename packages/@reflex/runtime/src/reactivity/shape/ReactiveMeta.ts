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
export const Invalid = 1 << 0; // 1
export const Changed = 1 << 1; // 2
export const Reentrant = 1 << 2; // 4
export const Tracking = 1 << 3; // 8
export const Disposed = 1 << 4; // 16

export const Watcher = 1 << 5; // 32
export const Scheduled = 1 << 6; // 64
// possible can be added next some flags

export const Producer = __DEV__ ? 1 << 28 : 0;
export const Consumer = __DEV__ ? 1 << 29 : 0;
export const Computing = 1 << 30;

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
export const WALKER_STATE = Reentrant | Tracking;

/** Clear the re-entrant marker after the walker no longer needs it. */
export function clearNodeVisited(node: ReactiveNode): void {
  node.state &= ~Reentrant;
}

/** Enter dependency collection mode for the current compute pass. */
export function beginNodeTracking(node: ReactiveNode): void {
  node.state = (node.state & ~Reentrant) | Tracking;
}

/** Leave dependency collection mode after compute finishes. */
export function clearNodeTracking(node: ReactiveNode): void {
  node.state &= ~Tracking;
}

/** Mark a node as actively executing its compute function. */
export function markNodeComputing(node: ReactiveNode): void {
  node.state = (node.state & ~Reentrant) | Tracking | Computing;
}

/** Clear the active-computation marker. */
export function clearNodeComputing(node: ReactiveNode): void {
  node.state &= ~(Computing | Tracking);
}

/** Clear both `Invalid` and `Changed`, returning the node to a clean state. */
export function clearDirtyState(node: ReactiveNode): void {
  node.state &= ~DIRTY_STATE;
}

/** Runtime helper for the terminal lifecycle check. */
export function isDisposedNode(node: ReactiveNode): boolean {
  return (node.state & Disposed) !== 0;
}

/** Collapse a node to kind + disposed, dropping transient execution flags. */
export function markDisposedNode(node: ReactiveNode): void {
  node.state = (node.state & NODE_KIND_STATE) | Disposed;
}
