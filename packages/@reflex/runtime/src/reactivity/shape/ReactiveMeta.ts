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
 *Invalid (1<<0) — джерело повідомило про зміну через push, але власне значення ще не перевірялось
 *Obsolete (1<<1) — pull-перевірка підтвердила: max(src.version) > maxSrcVer, recompute обов'язковий
 *Ordered (1<<2) — вузол стоїть у topo list і його order label актуальний після останнього repair
 *Invalid | Obsolete = 0b011 — обидва встановлені після forceful invalidation (напр. динамічний connect)
 */
export const enum ReactiveNodeState {
  Invalid = 1 << 0, // dependency changed
  Obsolete = 1 << 1, // definitely stale
  Ordered = 1 << 2,
}

export const INITIAL = ReactiveNodeState.Invalid | ~ReactiveNodeState.Ordered;
/** Node needs recomputation (either possibly or definitely stale) */
export const INVALID = ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete;
/** Clear both staleness bits */
export const CLEAR_INVALID = ~INVALID;
