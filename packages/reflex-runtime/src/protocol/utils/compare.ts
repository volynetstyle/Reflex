export type ProducerComparator<T> = (a: T, b: T) => boolean;

/**
 * `Object.is` semantics (NaN equals NaN, +0 differs from -0) written as
 * strict comparisons. TurboFan specializes them from feedback; a call to
 * `Object.is` with operands of unknown type becomes the generic SameValue
 * builtin call on every write and recompute.
 */
export const compare = ((a: unknown, b: unknown): boolean =>
  a === b
    ? a !== 0 || 1 / (a as number) === 1 / (b as number)
    : a !== a && b !== b) satisfies ProducerComparator<unknown>;
