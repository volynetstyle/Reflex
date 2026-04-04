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
export enum ReactiveNodeState {
  /** Mutable source node. Holds committed payload directly and never recomputes. */
  Producer = 1 << 0,
  /** Pure computed node. Re-executes lazily when its dependencies become dirty. */
  Consumer = 1 << 1,
  /** Effect-like sink. Invalidations schedule or notify work rather than return data. */
  Watcher = 1 << 2,

  /** Maybe stale: value is not confirmed changed yet and must be verified on read. */
  Invalid = 1 << 3,
  /** Definitely stale: a direct upstream dependency already confirmed a change. */
  Changed = 1 << 4,
  /** Re-entrant marker used when a tracked dependency invalidates mid-computation. */
  Visited = 1 << 5,
  /** Terminal lifecycle state. Disposed nodes must no longer participate in the graph. */
  Disposed = 1 << 6,
  /** Node is currently executing its compute function. Used for cycle detection. */
  Computing = 1 << 7,
  /** Host-owned scheduler marker. The runtime core does not read or write this bit. */
  Scheduled = 1 << 8,
  /** Node is collecting dependencies during the current computation pass. */
  Tracking = 1 << 9,
}

/** Mask for the mutually-exclusive node kind bits. */
export const NODE_KIND_STATE =
  ReactiveNodeState.Producer |
  ReactiveNodeState.Consumer |
  ReactiveNodeState.Watcher;

// export const MAYBE_CHANGE_STATE = ReactiveNodeState.Invalid;
// export const CHANGED_STATE = ReactiveNodeState.Changed;

/** All dirty bits. In supported runtime flows this is either `Invalid` or `Changed`. */
export const DIRTY_STATE =
  ReactiveNodeState.Invalid | ReactiveNodeState.Changed;

/** Clean producer. Normal steady state for source nodes. */
export const PRODUCER_INITIAL_STATE = ReactiveNodeState.Producer;

/**
 * Legacy/testing helper for a producer carrying `Changed`.
 * Runtime write flow should normally commit producers immediately instead.
 */
export const PRODUCER_CHANGED =
  ReactiveNodeState.Producer | ReactiveNodeState.Changed;

/** Legacy/testing helper for any dirty producer state. */
export const PRODUCER_DIRTY = ReactiveNodeState.Producer | DIRTY_STATE;

/** Directly invalidated computed node: skip verification and recompute on read. */
export const CONSUMER_CHANGED =
  ReactiveNodeState.Changed | ReactiveNodeState.Consumer;

/** Computed node carrying either `Invalid` or `Changed`. */
export const CONSUMER_DIRTY = ReactiveNodeState.Consumer | DIRTY_STATE;

/** Directly invalidated watcher. */
export const WATCHER_CHANGED =
  ReactiveNodeState.Changed | ReactiveNodeState.Watcher;

/** Transient walker-only bits that should not survive a settled execution. */
export const WALKER_STATE =
  ReactiveNodeState.Visited | ReactiveNodeState.Tracking;

/** Clear the re-entrant marker after the walker no longer needs it. */
export function clearNodeVisited(node: ReactiveNode): void {
  node.state &= ~ReactiveNodeState.Visited;
}

/** Host scheduler helper for clearing its own queued marker. */
export function clearNodeScheduled(node: ReactiveNode): void {
  node.state &= ~ReactiveNodeState.Scheduled;
}

/** Enter dependency collection mode for the current compute pass. */
export function beginNodeTracking(node: ReactiveNode): void {
  node.state =
    (node.state & ~ReactiveNodeState.Visited) | ReactiveNodeState.Tracking;
}

/** Leave dependency collection mode after compute finishes. */
export function clearNodeTracking(node: ReactiveNode): void {
  node.state &= ~ReactiveNodeState.Tracking;
}

/** Mark a node as actively executing its compute function. */
export function markNodeComputing(node: ReactiveNode): void {
  node.state |= ReactiveNodeState.Computing;
}

/** Clear the active-computation marker. */
export function clearNodeComputing(node: ReactiveNode): void {
  node.state &= ~ReactiveNodeState.Computing;
}

/** Clear both `Invalid` and `Changed`, returning the node to a clean state. */
export function clearDirtyState(node: ReactiveNode): void {
  node.state &= ~DIRTY_STATE;
}

/** Runtime helper for the terminal lifecycle check. */
export function isDisposedNode(node: ReactiveNode): boolean {
  return (node.state & ReactiveNodeState.Disposed) !== 0;
}

/** Collapse a node to kind + disposed, dropping transient execution flags. */
export function markDisposedNode(node: ReactiveNode): void {
  node.state = (node.state & NODE_KIND_STATE) | ReactiveNodeState.Disposed;
}
