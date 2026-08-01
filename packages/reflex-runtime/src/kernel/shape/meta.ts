/**
 * Bit flags describing the lifecycle, role and execution state of a reactive node.
 *
 * The flags are divided into independent groups:
 *
 *  - Role         : Producer / Consumer / Watcher
 *  - Dirty state  : Clean | Unknown | Changed
 *  - Execution    : Visited, Computing, Scheduled, ...
 *
 * Dirty-state semantics:
 *
 *  Clean
 *      The node is known to be up-to-date.
 *
 *  Unknown
 *      An upstream dependency may have changed.
 *      The node must verify whether recomputation is actually required
 *      (typically through `shouldRecompute()`).
 *
 *  Changed
 *      An upstream change has already been confirmed.
 *      The node should recompute immediately without further verification.
 *
 * Information ordering:
 *
 *      Clean < Unknown < Changed
 *
 * where `Unknown` represents uncertainty and `Changed` represents confirmed
 * knowledge about an upstream change.
 *
 * Notes:
 *
 *  - `Unknown` and `Changed` are mutually exclusive dirty states.
 *  - Producers commit immediately on write and normally do not participate
 *    in pull-walk verification.
 *  - `Visited`, `Computing` and similar flags are transient execution markers
 *    used only while propagating or evaluating the graph.
 */

/** Upstream may have changed; verify before recomputing. */
export const Unknown = 1 << 0;
/** Upstream change is confirmed; recompute immediately. */
export const Changed = 1 << 1;
/** Node has already been visited during the current traversal. */
export const Visited = 1 << 2;
/** Node is currently being evaluated. */
export const Computing = 1 << 3;
/** Node performs side effects and has no output value. */
export const Watcher = 1 << 4;
/** Watcher has been enqueued for execution. */
export const Scheduled = 1 << 5;
// ...
/**
 * Only available in the development environment (DEV),
 * Source node whose value is committed externally.
 * */
export const Producer = __DEV__ ? 1 << 29 : 0;

/**
 * Only available in the development environment (DEV),
 * as it is not required in the production environment
 * prod) under heavy use (hot path).
 */
export const Consumer = __DEV__ ? 1 << 29 : 0;

export type ReactiveNodeState = number;

/** All dirty bits. In supported runtime flows this is either `Unknown` or `Changed`. */
export const DIRTY_STATE = Unknown | Changed;
/** Clean producer. Normal steady state for source nodes. */
export const PRODUCER_INITIAL_STATE = Producer;
/** Directly invalidated computed node: skip verification and recompute on read. */
export const CONSUMER_INITIAL_STATE = Changed | Consumer;
/** Computed node carrying either `Unknown` or `Changed`. */
export const WATCHER_INITIAL_STATE = Changed | Unknown | Watcher | Consumer;
