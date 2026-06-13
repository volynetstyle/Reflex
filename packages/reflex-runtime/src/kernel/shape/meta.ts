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
// ...
export const Producer = 1 << 28;
/**
 * Only available in the development environment (DEV),
 * as it is not required in the production environment
 * prod) under heavy use (hot path).
 */
export const Consumer = __DEV__ ? 1 << 29 : 0;

export type ReactiveNodeState = number;

/** All dirty bits. In supported runtime flows this is either `Invalid` or `Changed`. */
export const DIRTY_STATE = Invalid | Changed;
/** Clean producer. Normal steady state for source nodes. */
export const PRODUCER_INITIAL_STATE = Producer;
/** Directly invalidated computed node: skip verification and recompute on read. */
export const CONSUMER_INITIAL_STATE = Changed | Consumer;
/** Computed node carrying either `Invalid` or `Changed`. */
export const WATCHER_INITIAL_STATE = Changed | Invalid | Consumer;
