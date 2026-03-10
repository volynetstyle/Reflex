export type Byte32Int = number;

export const enum ReactiveNodeKind {
  Producer = 1 << 0,
  Consumer = 1 << 1,
  Recycler = 1 << 2,
  Root = 1 << 3,
  Resource = 1 << 4,
  Firewall = 1 << 5,
  Envelope = 1 << 6,
}

/**
 * Clean -> Dirty,
 * Dirty -> Computing,
 * Computing -> Clean.
 *
 * Valid      — значение консистентно
 * Invalid    — возможно устарело
 * Obsolete   — точно устарело
 * Visited    — используется в pull traversal
 * Queued     — в scheduler
 * Failed     — ошибка вычисления
 */
export const enum ReactiveNodeState {
  Valid = 0,
  Invalid = 1 << 0, // dependency changed
  Obsolete = 1 << 1, // definitely stale
  Visited = 1 << 2,
  Queued = 1 << 3,
  OnStack = 1 << 4,
}

/** Node needs recomputation (either possibly or definitely stale) */
export const INVALID = ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete;
/** Clear both staleness bits */
export const CLEAR_INVALID = ~INVALID;
/** Clear visited bit after pull traversal */
export const CLEAR_VISITED = ~ReactiveNodeState.Visited;
