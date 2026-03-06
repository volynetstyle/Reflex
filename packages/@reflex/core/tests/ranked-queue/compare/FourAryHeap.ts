export class FourAryHeap<T> {
  private keys: number[] = [];
  private values: T[] = [];

  size(): number {
    return this.keys.length;
  }

  isEmpty(): boolean {
    return this.keys.length === 0;
  }

  peek(): T | undefined {
    return this.values[0];
  }

  insert(value: T, priority: number): void {
    const i = this.keys.length;

    this.keys.push(priority);
    this.values.push(value);

    this.siftUp(i);
  }

  popMin(): T | undefined {
    const n = this.keys.length;
    if (n === 0) return undefined;

    const minValue = this.values[0];

    const lastKey = this.keys.pop()!;
    const lastValue = this.values.pop()!;

    if (n > 1) {
      this.keys[0] = lastKey;
      this.values[0] = lastValue;
      this.siftDown(0);
    }

    return minValue;
  }

  clear(): void {
    this.keys.length = 0;
    this.values.length = 0;
  }

  private siftUp(i: number): void {
    const keys = this.keys;
    const values = this.values;

    const key = keys[i]!;
    const value = values[i]!;

    while (i > 0) {
      const parent = ((i - 1) / 4) | 0;

      if (key >= keys[parent]!) break;

      keys[i] = keys[parent]!;
      values[i] = values[parent]!;

      i = parent;
    }

    keys[i] = key;
    values[i] = value;
  }

  private siftDown(i: number): void {
    const keys = this.keys;
    const values = this.values;
    const n = keys.length;

    const key = keys[i]!;
    const value = values[i]!;

    while (true) {
      const base = 4 * i + 1;
      if (base >= n) break;

      let minChild = base;
      let minKey = keys[base]!;

      for (let k = 1; k < 4; k++) {
        const child = base + k;
        if (child >= n) break;

        const childKey = keys[child]!;
        if (childKey < minKey) {
          minKey = childKey;
          minChild = child;
        }
      }

      if (minKey >= key) break;

      keys[i] = minKey;
      values[i] = values[minChild]!;

      i = minChild;
    }

    keys[i] = key;
    values[i] = value;
  }
}