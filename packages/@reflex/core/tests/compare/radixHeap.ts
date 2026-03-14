const K = 33;

function bucketIndex(key: number, lastMin: number): number {
  const diff = (key ^ lastMin) >>> 0;
  return diff === 0 ? 0 : 32 - Math.clz32(diff);
}

function ctz(x: number): number {
  return 31 - Math.clz32(x & -x);
}

export class RadixHeap<T> {
  private bucketKeys: number[][];
  private bucketValues: T[][];

  private bucketMask = 0;

  private lastMin = 0;
  private _size = 0;

  constructor() {
    this.bucketKeys = new Array(K);
    this.bucketValues = new Array(K);

    for (let i = 0; i < K; i++) {
      this.bucketKeys[i] = [];
      this.bucketValues[i] = [];
    }
  }

  size(): number {
    return this._size;
  }
  isEmpty(): boolean {
    return this._size === 0;
  }

  insert(value: T, priority: number): void {
    const key = priority >>> 0;

    if (key < this.lastMin) throw new RangeError("priority < lastMin");

    const bi = bucketIndex(key, this.lastMin);

    if (bi === 0) {
      const b0 = this.bucketValues[0];

      if (b0.length === 0) this.bucketMask |= 1;

      b0.push(value);
    } else {
      const bk = this.bucketKeys[bi];
      const bv = this.bucketValues[bi];

      if (bk.length === 0) this.bucketMask |= 1 << bi;

      bk.push(key);
      bv.push(value);
    }

    this._size++;
  }

  peek(): T | undefined {
    if (this._size === 0) return undefined;

    const k = ctz(this.bucketMask);

    if (k === 0) return this.bucketValues[0][this.bucketValues[0].length - 1];

    const bk = this.bucketKeys[k];
    const bv = this.bucketValues[k];

    let minKey = bk[0];
    let minIdx = 0;

    for (let i = 1; i < bk.length; i++) {
      if (bk[i] < minKey) {
        minKey = bk[i];
        minIdx = i;
      }
    }

    return bv[minIdx];
  }

  popMin(): T | undefined {
    if (this._size === 0) return undefined;
    this._size--;

    const bucketValues = this.bucketValues;
    const bucketKeys = this.bucketKeys;

    if (bucketValues[0].length > 0) {
      const v = bucketValues[0].pop() as T;

      if (bucketValues[0].length === 0) this.bucketMask &= ~1;

      return v;
    }

    const k = ctz(this.bucketMask);

    const bk = bucketKeys[k];
    const bv = bucketValues[k];

    let newMin = bk[0];
    let newMinIdx = 0;

    for (let i = 1; i < bk.length; i++) {
      if (bk[i] < newMin) {
        newMin = bk[i];
        newMinIdx = i;
      }
    }

    this.lastMin = newMin;

    const minVal = bv[newMinIdx];

    const last = bk.length - 1;

    if (newMinIdx !== last) {
      bk[newMinIdx] = bk[last];
      bv[newMinIdx] = bv[last];
    }

    bk.length = last;
    bv.length = last;

    if (bk.length === 0) this.bucketMask &= ~(1 << k);

    for (let i = 0; i < bk.length; i++) {
      const key = bk[i];
      const val = bv[i];

      const bi = bucketIndex(key, newMin);

      if (bi === 0) {
        bucketValues[0].push(val);
      } else {
        bucketKeys[bi].push(key);
        bucketValues[bi].push(val);
      }

      this.bucketMask |= 1 << bi;
    }

    bk.length = 0;
    bv.length = 0;

    return minVal;
  }

  clear(): void {
    for (let i = 0; i < K; i++) {
      this.bucketKeys[i].length = 0;
      this.bucketValues[i].length = 0;
    }

    this.bucketMask = 0;
    this._size = 0;
    this.lastMin = 0;
  }
}
