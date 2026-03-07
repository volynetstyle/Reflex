/**
 * Quaternary (4-ary) min-heap optimized for high-frequency scheduling workloads.
 *
 * This implementation is specifically tuned for reactive schedulers where
 * priorities tend to be monotonic (e.g. topological heights). In those cases
 * most operations degenerate to O(1) because:
 *
 *  • insert() usually avoids sift-up via the monotonic fast-path
 *  • popMin() often exits early because the heap property already holds
 *
 * Design goals:
 *  • minimize comparisons
 *  • minimize bounds checks
 *  • maximize cache locality
 *  • avoid object allocations
 *
 * Internal layout:
 *
 *  keys   → Float64Array storing priorities
 *  values → parallel array storing values
 *
 * Using a Structure-of-Arrays (SoA) layout avoids pointer chasing and improves
 * CPU cache behavior compared to storing `{key,value}` objects.
 *
 * Heap structure (4 children per node):
 *
 *  parent(i)   = (i - 1) >> 2
 *  child₀(i)   = 4*i + 1
 *  child₁(i)   = 4*i + 2
 *  child₂(i)   = 4*i + 3
 *  child₃(i)   = 4*i + 4
 *
 * Compared to a binary heap this reduces height:
 *
 *   height ≈ log₄(n) = log₂(n) / 2
 *
 * which significantly reduces the number of levels traversed during pop().
 *
 * NOTE:
 *
 * This heap is intentionally optimized for workloads where priorities are
 * *mostly monotonic*. In reactive schedulers where priorities represent
 * topological heights, most operations will avoid full heap restructuring.
 *
 * In such workloads the heap behaves closer to a validated queue than a
 * traditional priority queue.
 */
export class QuaternaryHeap<T> {
  /**
   * Priority keys (heap ordering).
   * Stored separately to improve memory locality.
   */
  private keys: Uint32Array;

  /**
   * Values associated with priorities.
   */
  private values: T[];

  /**
   * Current number of elements in the heap.
   */
  private _size: number = 0;

  /**
   * Allocated capacity of internal arrays.
   */
  private capacity: number;

  /**
   * Creates a new heap.
   *
   * @param initialCapacity Initial allocation size.
   *        The heap grows automatically when capacity is exceeded.
   */
  constructor(initialCapacity = 64) {
    this.capacity = initialCapacity;
    this.keys = new Uint32Array(initialCapacity);
    this.values = new Array(initialCapacity);
  }

  size(): number {
    return this._size;
  }

  isEmpty(): boolean {
    return this._size === 0;
  }

  peek(): T | undefined {
    return this._size > 0 ? this.values[0] : undefined;
  }

  /**
   * Inserts a value with the given priority.
   *
   * Optimizations:
   *
   * 1. Monotonic fast-path
   *
   *    Many schedulers insert elements whose priority is greater than or equal
   *    to their parent's priority (e.g. increasing topological heights).
   *
   *    In that case no sift-up is required and insertion becomes O(1).
   *
   * 2. Fallback sift-up
   *
   *    If the monotonic assumption does not hold, the element is bubbled up
   *    normally until the heap property is restored.
   *
   * Heap invariant:
   *
   *   parent.priority ≤ child.priority
   *
   * Time complexity:
   *
   *   typical case: O(1)
   *   worst case:   O(log₄ n)
   */
  insert(value: T, priority: number): void {
    if (this._size === this.capacity) this.grow();

    const keys = this.keys;
    const values = this.values;

    let i = this._size++;

    // Monotonic fast path
    if (i > 0) {
      let parent = (i - 1) >> 2;
      let pk = keys[parent]!;

      if (priority >= pk) {
        keys[i] = priority;
        values[i] = value;
        return;
      }

      // fallback: normal siftUp
      do {
        keys[i] = pk;
        values[i] = values[parent]!;
        i = parent;

        if (i === 0) break;

        const p = (i - 1) >> 2;
        const pkey = keys[p]!;
        if (priority >= pkey) break;

        parent = p;
        pk = pkey;
      } while (true);
    }

    keys[i] = priority;
    values[i] = value;
  }

  /**
   * Removes and returns the minimum element.
   *
   * Optimizations:
   *
   * 1. Early root validation
   *
   *    After moving the last element to the root we check whether the heap
   *    property already holds relative to the root's children.
   *
   *    If true, sift-down is skipped entirely.
   *
   * 2. Fast-path loop
   *
   *    While the current node is guaranteed to have four children we avoid
   *    bounds checks and perform a fixed comparison sequence.
   *
   * 3. Slow tail loop
   *
   *    Near the bottom of the heap where fewer than four children may exist,
   *    we switch to a guarded loop that performs bounds checks.
   *
   * The constant:
   *
   *   limit = (n - 5) >> 2
   *
   * represents the last node index whose children are guaranteed to exist:
   *
   *   4*i + 4 < n
   *
   * Time complexity:
   *
   *   typical case: O(1)
   *   worst case:   O(log₄ n)
   */
  popMin(): T | undefined {
    const size = this._size;
    if (size === 0) return undefined;

    const values = this.values;
    const keys = this.keys;

    const minValue = values[0];
    const last = --this._size;

    if (last > 0) {
      const key = keys[last]!;
      const value = values[last]!;

      keys[0] = key;
      values[0] = value;

      const n = this._size;

      // Extra fast-path Early-exit root validation
      if (n > 1) {
        const k1 = keys[1]!;

        if (key <= k1) {
          const k2 = 2 < n ? keys[2]! : k1;

          if (key <= k2) {
            const k3 = 3 < n ? keys[3]! : k1;

            if (key <= k3) {
              const k4 = 4 < n ? keys[4]! : k1;
              if (key <= k4) {
                values[last] = undefined as any;
                return minValue;
              }
            }
          }
        }
      }

      let i = 0;

      // last node with 4 children
      const limit = (n - 5) >> 2;

      // fast path
      while (i <= limit) {
        const base = (i << 2) + 1;

        let minChild = base;
        let minKey = keys[base]!;

        let ck = keys[base + 1]!;
        if (ck < minKey) {
          minKey = ck;
          minChild = base + 1;
        }

        ck = keys[base + 2]!;
        if (ck < minKey) {
          minKey = ck;
          minChild = base + 2;
        }

        ck = keys[base + 3]!;
        if (ck < minKey) {
          minKey = ck;
          minChild = base + 3;
        }

        if (minKey >= key) break;

        keys[i] = minKey;
        values[i] = values[minChild]!;

        i = minChild;
      }

      // slow tail
      while (true) {
        const base = (i << 2) + 1;
        if (base >= n) break;

        let minChild = base;
        let minKey = keys[base]!;

        let c = base + 1;
        let ck: number;

        if (c < n && (ck = keys[c]!) < minKey) {
          minKey = ck;
          minChild = c;
        }

        if (++c < n && (ck = keys[c]!) < minKey) {
          minKey = ck;
          minChild = c;
        }

        if (++c < n && (ck = keys[c]!) < minKey) {
          minKey = ck;
          minChild = c;
        }

        if (minKey >= key) break;

        keys[i] = minKey;
        values[i] = values[minChild]!;

        i = minChild;
      }

      keys[i] = key;
      values[i] = value;
    }

    values[last] = undefined as any;

    return minValue;
  }

  clear(): void {
    const n = this._size;
    this._size = 0;
    this.values.fill(<T>undefined, 0, n); // было: 0, this._size (баг!)
  }

  private grow(): void {
    const newCapacity = this.capacity * 2;
    const newKeys = new Uint32Array(newCapacity);
    newKeys.set(this.keys);
    this.keys = newKeys;
    this.values.length = newCapacity;
    this.capacity = newCapacity;
  }
}
