export type Ordering = -1 | 0 | 1;

export interface Preorder<T> {
  leq: (a: T, b: T) => boolean; // a ≤ b
}

/** Partial order = preorder + antisymmetry. */
export interface Poset<T> extends Preorder<T> {}

/** Total order supplies compare. */
export interface TotalOrder<T> {
  compare: (a: T, b: T) => Ordering;
}

/** Derived helpers (type-only safe; runtime functions optional). */
export type Ord<T> = TotalOrder<T>;
