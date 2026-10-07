export declare const storeBoundary: unique symbol;
export type StoreBoundary<T> = T & { readonly [storeBoundary]: T };

/** Marks one compiled store value as a replaceable leaf. */
export function leaf<T>(value: T): StoreBoundary<T> {
  return value as StoreBoundary<T>;
}
