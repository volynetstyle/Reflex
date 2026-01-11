/** Evidence that two values of T are equivalent (a ~ b). */
export interface Eq<T> {
  equals: (a: T, b: T) => boolean;
}

/**
 * A "Setoid" is a set equipped with an equivalence relation.
 * In TS terms: Eq<T> + laws in tests.
 */
export type Setoid<T> = Eq<T>;

export type EqOf<A> = A extends Eq<infer T> ? T : never;

export const eq = {
  /** Structural / referential equality (JS `Object.is`) */
  strict<T>(): Eq<T> {
    return { equals: Object.is };
  },
} as const;
