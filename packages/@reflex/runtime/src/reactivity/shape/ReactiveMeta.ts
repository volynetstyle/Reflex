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
  Valid   = 0,
  Queued  = 1 << 0,
  Failed  = 1 << 1,
  // Invalid/Obsolete/Visited убраны — выводятся из версий
}

export const FLAG_QUEUED  = ReactiveNodeState.Queued;
export const FLAG_FAILED  = ReactiveNodeState.Failed;
export const CLEAR_FLAGS  = ~(FLAG_QUEUED | FLAG_FAILED);