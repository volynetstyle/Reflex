export class FourAryHeap<T> {
  private keys: Float64Array;
  private values: T[];
  private _size: number = 0;
  private capacity: number;

  constructor(initialCapacity = 64) {
    this.capacity = initialCapacity;
    this.keys = new Float64Array(initialCapacity);
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

  insert(value: T, priority: number): void {
    if (this._size === this.capacity) this.grow();

    const keys = this.keys;
    const values = this.values;
    let i = this._size++;

    // siftUp inlined
    while (i > 0) {
      const parent = (i - 1) >> 2;
      const pk = keys[parent]!;
      if (priority >= pk) break;
      keys[i] = pk;
      values[i] = values[parent]!;
      i = parent;
    }

    keys[i] = priority;
    values[i] = value;
  }

  popMin(): T | undefined {
    if (this._size === 0) return undefined;

    const minValue = this.values[0];
    const last = --this._size;

    if (last > 0) {
      this.keys[0] = this.keys[last]!;
      this.values[0] = this.values[last]!;

      let i = 0;

      const keys = this.keys;
      const values = this.values;
      const n = this._size;

      const key = keys[i]!;
      const value = values[i]!;

      // Быстрый путь: пока все 4 ребёнка гарантированно существуют
      // последний узел с 4 детьми: base+3 < n  →  i < (n - 2) >> 2
      const limit = (n - 2) >> 2;

      while (i < limit) {
        const base = (i << 2) + 1;

        let minChild = base;
        let minKey = keys[base]!;
        let ck: number;

        if ((ck = keys[base + 1]!) < minKey) {
          minKey = ck;
          minChild = base + 1;
        }
        if ((ck = keys[base + 2]!) < minKey) {
          minKey = ck;
          minChild = base + 2;
        }
        if ((ck = keys[base + 3]!) < minKey) {
          minKey = ck;
          minChild = base + 3;
        }

        if (minKey >= key) break;

        keys[i] = minKey;
        values[i] = values[minChild]!;
        i = minChild;
      }

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

    // Help GC — don't hold reference in unused slot
    this.values[last] = <T>undefined;

    return minValue;
  }

  clear(): void {
    const n = this._size;
    this._size = 0;
    this.values.fill(<T>undefined, 0, n); // было: 0, this._size (баг!)
  }

  private grow(): void {
    const newCapacity = this.capacity * 2;
    const newKeys = new Float64Array(newCapacity);
    newKeys.set(this.keys);
    this.keys = newKeys;
    this.values.length = newCapacity;
    this.capacity = newCapacity;
  }
}
