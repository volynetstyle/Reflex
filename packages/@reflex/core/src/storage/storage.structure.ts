import { U64InterleavedArray, Uint64Storage } from "./storage.contract";

const TWO_32 = 4294967296; // 2^32
const BIGINT_32 = 32n;
const BIGINT_U32_MASK = 0xffffffffn;
const BIGINT_MASK_64 = (1n << 64n) - 1n;
const TWO_NEG_32 = 2.3283064365386963e-10;

/**
 * A high-performance storage structure for 64-bit unsigned integers,
 * implemented on top of `Uint32Array` using interleaved pairs `[hi, lo]`.
 *
 * This avoids the overhead of JavaScript `BigInt`, while retaining
 * full 64-bit semantics via two 32-bit lanes:
 *
 *   hi = upper 32 bits
 *   lo = lower 32 bits
 *
 * Memory layout:
 *
 * index:  0     1     2     3     4     5     6     7 ...
 *         └hi₀┘ └lo₀┘ └hi₁┘ └lo₁┘ └hi₂┘ └lo₂┘ └hi₃┘ └lo₃┘ ...
 *
 * For an array of states S in Uint32Array:
 * each node i ∈ ℕ is represented by a pair of 32-bit words:
 *
 *  NodeState₆₄(i) = (hiᵢ, loᵢ)
 *      where:
 *  hiᵢ = S[2·i]
 *  loᵢ = S[2·i + 1]
 *
 *  that thereby, array S can be transformed to sequence of:
 *      S = [hi₀, lo₀, hi₁, lo₁, hi₂, lo₂, …]
 *  and each node occupies two adjacent indices.
 *
 * Features:
 *  - O(1) creation and write operations
 *  - cache-friendly interleaving pattern (proven fastest in V8)
 *  - no allocations during write/read
 *  - optional BigInt and Number conversions when needed
 *  - batch creation and fast bulk copying
 *  - linear memory buffer compatible with WASM and native bit ops
 *
 * This class is ideal for high-frequency low-level systems:
 * reactive runtimes, schedulers, probabilistic structures,
 * simulation engines, or causal-consistency models.
 */
export class Uint64Array implements Uint64Storage {
  private _state: U64InterleavedArray;
  private _size: number;
  private _capacity: number;

  /**
   * Creates a new Uint64 storage with the given initial capacity.
   *
   * @param capacity Number of 64-bit elements to allocate upfront.
   *                 Real allocated memory = `capacity * 2 * 4 bytes`.
   */
  constructor(capacity = 2048) {
    const cap = capacity >>> 0;

    this._state = new Uint32Array(cap << 1) as U64InterleavedArray;
    this._size = 0;
    this._capacity = cap;
  }

  toUint32Array(): U64InterleavedArray {
    return this._state;
  }

  /**
   * Allocates a new 64-bit slot and returns its ID.
   * The slot is zero-initialized (TypedArrays are zero-filled).
   */
  create(): number {
    const id = this._size;
    if (id >= this._capacity) this._grow();
    this._size = id + 1;
    return id;
  }

  /**
   * Allocates multiple IDs at once.
   *
   * @param count Number of elements to create.
   * @returns ID of the first newly allocated element.
   */
  createBatch(count: number): number {
    const n = count >>> 0;
    const startId = this._size;
    const endId = startId + n;

    if (endId > this._capacity) {
      // while зберігаємо на випадок дуже великих batch-ів,
      // але в більшості випадків це одна ітерація.
      while (endId > this._capacity) this._grow();
    }

    this._size = endId;
    return startId;
  }

  /**
   * Ensures capacity is at least `requiredCapacity` elements.
   * Useful to avoid multiple grow() calls in hot paths.
   */
  reserve(requiredCapacity: number): void {
    const needed = requiredCapacity >>> 0;
    if (needed <= this._capacity) return;

    while (this._capacity < needed) this._grow();
  }

  /** Upper 32 bits for element `id`. */
  rawHi(id: number): number {
    const base = id + id;
    return this._state[base]!;
  }

  /** Lower 32 bits for element `id`. */
  rawLo(id: number): number {
    const base = id + id + 1;
    return this._state[base]!;
  }

  setHi(id: number, hi: number): void {
    const base = id + id;
    this._state[base] = hi >>> 0;
  }

  setLo(id: number, lo: number): void {
    const base = id + id + 1;
    this._state[base] = lo >>> 0;
  }

  /**
   * Low-level write using precomputed base index (2 * id).
   * Intended for hot loops that already know the base.
   */
  writeRaw(baseIndex: number, hi: number, lo: number): void {
    const s = this._state;
    s[baseIndex] = hi >>> 0;
    s[baseIndex + 1] = lo >>> 0;
  }

  /**
   * Writes a 64-bit value using two 32-bit lanes.
   */
  write(id: number, hi: number, lo: number): void {
    const b = id + id; // faster than id << 1 on V8 in tight loops
    const s = this._state;
    s[b] = hi >>> 0;
    s[b + 1] = lo >>> 0;
  }

  /**
   * Reads the 64-bit value as a BigInt.
   * Slow path – використовується рідко.
   */
  readBigInt(id: number): bigint {
    const base = id + id;
    const state = this._state;
    // Uint32Array already yields unsigned ints, нет смысла в >>> 0
    return (BigInt(state[base]!) << BIGINT_32) | BigInt(state[base + 1]!);
  }

  /**
   * Writes a 64-bit BigInt value into the storage.
   * Slow path – зручно для інтеграцій, не для гарячих циклів.
   */
  writeBigInt(id: number, value: bigint): void {
    // Нормалізуємо до 64-бітного unsigned діапазону.
    const masked = value & BIGINT_MASK_64;

    const lo = Number(masked & BIGINT_U32_MASK);
    const hi = Number((masked >> BIGINT_32) & BIGINT_U32_MASK);

    const b = id + id;
    const state = this._state;
    state[b] = hi >>> 0;
    state[b + 1] = lo >>> 0;
  }

  /**
   * Reads the value as a JavaScript Number (<= 2^53-1).
   */
  readNumber(id: number): number {
    const b = id + id;
    const state = this._state;

    const hi = state[b]!;
    const lo = state[b + 1]!;

    return hi * TWO_32 + lo;
  }

  /**
   * Writes a Number (accurate up to 2^53).
   * High-performance when exact 64-bit precision is not required.
   */
  writeNumber(id: number, value: number): void {
    let v = +value;
    const b = id + id;
    const state = this._state;

    if (v <= 0) {
      state[b] = 0;
      state[b + 1] = 0;
      return;
    }

    if (v > Number.MAX_SAFE_INTEGER) {
      v = Number.MAX_SAFE_INTEGER;
    }

    const lo = v >>> 0;
    const hi = Math.floor(v * TWO_NEG_32);

    state[b] = hi;
    state[b + 1] = lo;
  }

  /**
   * Fast bulk copy from another Uint64Array.
   */
  copyFrom(
    source: Uint64Storage,
    sourceStart = 0,
    destStart = 0,
    count?: number,
  ): void {
    const srcSize = source.size;
    const start = sourceStart >>> 0;
    const dst = destStart >>> 0;

    const actual = (count === undefined ? srcSize - start : count) >>> 0;
    const endDest = dst + actual;

    if (endDest > this._capacity) {
      while (endDest > this._capacity) this._grow();
    }

    const len = actual << 1;
    const sb = start << 1;
    const db = dst << 1;

    const srcBuf = source.toUint32Array();
    this._state.set(srcBuf.subarray(sb, sb + len), db);

    if (endDest > this._size) this._size = endDest;
  }

  /**
   * Fills a range of elements with the given `[hi, lo]` pair.
   * Optimized to work on the underlying Uint32Array indices directly.
   */
  fill(hi: number, lo: number, start = 0, end = this._size): void {
    const h = hi >>> 0;
    const l = lo >>> 0;

    const s = this._state;
    let i = (start >>> 0) << 1;
    const end2 = (end >>> 0) << 1;

    for (; i < end2; i += 2) {
      s[i] = h;
      s[i + 1] = l;
    }
  }

  /**
   * Resets the logical size to zero.
   * Underlying memory is preserved.
   */
  clear(): void {
    this._size = 0;
  }

  /**
   * Returns direct access to the underlying Uint32Array buffer.
   */
  getBuffer(): U64InterleavedArray {
    return this._state;
  }

  /**
   * Returns a Uint32Array view on a range of `[hi, lo]` pairs.
   * No memory is copied.
   */
  subarray(start: number, end = this._size): Uint32Array {
    const s = start >>> 0;
    const e = end >>> 0;
    return this._state.subarray(s << 1, e << 1);
  }

  /**
   * Doubles the allocated capacity (like a vector).
   */
  private _grow(): void {
    const prevCap = this._capacity;
    const nextCap = prevCap ? prevCap << 1 : 16;

    const next = new Uint32Array(nextCap << 1) as U64InterleavedArray;
    next.set(this._state);

    this._capacity = nextCap;
    this._state = next;
  }

  /** Number of allocated elements. */
  get size(): number {
    return this._size;
  }

  /** Current capacity (in elements). */
  get capacity(): number {
    return this._capacity;
  }

  /** Memory usage in bytes. */
  get memoryUsage(): number {
    return this._state.byteLength;
  }
}
