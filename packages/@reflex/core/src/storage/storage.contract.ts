declare const U64_INTERLEAVED_BRAND: unique symbol;

/**
 * Interleaved backing store:
 *   [hi0, lo0, hi1, lo1, ..., hi(n-1), lo(n-1)]
 *
 * Runtime: 100% Uint32Array.
 * TypeScript: nominal subtype for safety.
 */
export type U64InterleavedArray = Uint32Array & {
  readonly [U64_INTERLEAVED_BRAND]: true;
};

declare const U64_INDEX_BRAND: unique symbol;

/**
 * Nominal index for 64-bit positions. Distinguishes
 * “index in 64-bit words” from “index in Uint32Array”.
 *
 * Runtime: plain number.
 */
export type U64Index = number & { readonly [U64_INDEX_BRAND]: true };

export interface Uint64Storage {
  /** Number of logically allocated 64-bit elements. */
  readonly size: number;

  /** Capacity measured in 64-bit elements (not Uint32 slots). */
  readonly capacity: number;

  /** Total memory usage in bytes. */
  readonly memoryUsage: number;

  /**
   * Allocates a single zero-initialized 64-bit slot.
   * Returns the ID of that slot.
   */
  create(): number;

  /**
   * Allocates `count` contiguous 64-bit slots.
   * Returns the ID of the first allocated element.
   */
  createBatch(count: number): number;

  /**
   * Clears logical size (O(1)), but preserves allocated memory.
   */
  clear(): void;

  /** Returns upper 32 bits of element at `id`. */
  rawHi(id: number): number;

  /** Returns lower 32 bits of element at `id`. */
  rawLo(id: number): number;

  /** Writes upper 32 bits. */
  setHi(id: number, hi: number): void;

  /** Writes lower 32 bits. */
  setLo(id: number, lo: number): void;

  /**
   * Writes `(hi, lo)` pair in one offset computation.
   */
  write(id: number, hi: number, lo: number): void;

  /**
   * Reads value as JS Number (precision ≤ 2^53−1).
   */
  readNumber(id: number): number;

  /**
   * Writes JS Number into 64-bit slot.
   * Negative coerces to 0, >2^53−1 saturates.
   */
  writeNumber(id: number, value: number): void;

  /**
   * Reads value as full-precision unsigned 64-bit BigInt.
   * (Slow path.)
   */
  readBigInt(id: number): bigint;

  /**
   * Writes full 64-bit BigInt.
   * Only lower 64 bits are stored.
   */
  writeBigInt(id: number, value: bigint): void;

  /**
   * Fills `[start, end)` with repeated `(hi, lo)` pair.
   */
  fill(hi: number, lo: number, start?: number, end?: number): void;

  /**
   * Copies `count` 64-bit elements from another storage.
   */
  copyFrom(
    source: Uint64Storage,
    sourceStart?: number,
    destStart?: number,
    count?: number,
  ): void;

  /**
   * Returns the underlying interleaved Uint32Array view.
   * Do not mutate `size` or `capacity` via this buffer.
   */
  toUint32Array(): Uint32Array;

  /**
   * Returns a no-copy Uint32Array view over a range of elements.
   */
  subarray(start: number, end?: number): Uint32Array;
}
