/**
 * Reactive node state is composed from independent flag groups:
 *
 *  - Evidence   : Unknown | Changed
 *  - Execution  : Visited | Computing
 *  - Scheduling : Scheduled
 *  - Role       : Producer | Consumer | Watcher
 *
 * Evidence forms a two-bit Boolean lattice:
 *                  (Both)
 *             Unknown | Changed
 *              /            \
 *           Unknown       Changed
 *              \            /
 *                   None
 *
 * `Unknown` and `Changed` are independent facts:
 *
 *  Unknown
 *      At least one committed dependency still requires validation.
 *
 *  Changed
 *      At least one dependency has already proven that execution/recomputation
 *      is required once validation succeeds.
 *
 * Evidence accumulated during propagation is monotonic:
 *
 *      merge(a, b) = a | b
 *
 * and therefore commutative, associative and idempotent.
 *
 * Validation may later discharge `Unknown`; this is a separate operation from
 * propagation-time evidence accumulation.
 *
 * Propagation-time evidence is monotonic:
 *
 * nextEvidence = currentEvidence | incomingEvidence
 *
 * It must never discard an already-known evidence bit.
 *
 * Resolution of evidence belongs to validation/evaluation stages,
 * not to propagation merge.
 */

/**
 * Bottom of semilattice.
 */
export const None = 0b00;
/**
 * Validation is required before execution/recomputation may proceed.
 */
export const Unknown = 1 << 0; // 1
/**
 * Execution/recomputation is definitely required.
 * No further validation is needed to establish that fact.
 */
export const Changed = 1 << 1; // 2
/**
 * Top of semilattice.
 */
export const Both = Unknown | Changed; // =3

// end of paragraph
/** Node has already been visited during the current traversal. */
export const Visited = 1 << 2; // 4
/** Node is currently being evaluated. */
export const Computing = 1 << 3; // 8
/** Node performs side effects and has no output value. */
export const Watcher = 1 << 4; // 16
/** Watcher has been enqueued for execution. */
export const Scheduled = 1 << 5; // 32

// ...
// free powers include 29 and 30 in prod [6, 31*]
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
export const Consumer = __DEV__ ? 1 << 30 : 0;

export type ReactiveNodeState = number;

/** Clean producer. Normal steady state for source nodes. */
export const PRODUCER_INITIAL_STATE = Producer;
/** Directly invalidated computed node: skip verification and recompute on read. */
export const CONSUMER_INITIAL_STATE = Changed | Consumer;
/** Computed node carrying either `Unknown` or `Changed`. */
export const WATCHER_INITIAL_STATE = Changed | Unknown | Watcher | Consumer;
