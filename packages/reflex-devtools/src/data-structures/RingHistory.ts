export class RingHistory<T> {
  private buffer: (T | undefined)[];
  private mask: number;
  private start = 0;
  private count = 0;
  private total = 0;

  constructor(capacity = 1024) {
    capacity = nextPowerOfTwo(capacity);

    this.buffer = new Array(capacity);
    this.mask = capacity - 1;
  }

  get size(): number {
    return this.count;
  }

  get capacity(): number {
    return this.buffer.length;
  }

  get totalWritten(): number {
    return this.total;
  }

  push(value: T): void {
    const capacity = this.buffer.length;
    const l = this.count;

    if (l < capacity) {
      const index = (this.start + l) & this.mask;
      this.buffer[index] = value;
      this.count++;
    } else {
      this.buffer[this.start] = value;
      this.start = (this.start + 1) & this.mask;
    }

    this.total++;
  }

  at(index: number): T | undefined {
    if (index < 0) {
      index = this.count + index;
    }

    if (index < 0 || index >= this.count) {
      return undefined;
    }

    return this.buffer[(this.start + index) & this.mask];
  }

  latest(): T | undefined {
    return this.at(-1);
  }

  clear(): void {
    for (let i = 0; i < this.count; i++) {
      this.buffer[(this.start + i) & this.mask] = undefined;
    }

    this.start = 0;
    this.count = 0;
    this.total = 0;
  }

  toArray(): T[] {
    const l = this.count;
    const result = new Array<T>(l);

    for (let i = 0; i < l; i++) {
      result[i] = this.buffer[(this.start + i) & this.mask] as T;
    }

    return result;
  }

  forEach(callback: (value: T, index: number) => void): void {
    const l = this.count;

    for (let i = 0; i < l; i++) {
      callback(this.buffer[(this.start + i) & this.mask] as T, i);
    }
  }
}

function nextPowerOfTwo(value: number): number {
  value = Math.ceil(value);

  if (value <= 1) {
    return 1;
  }

  return 1 << (32 - Math.clz32(value - 1));
}
