export class BinaryHeap<T> {
  private priorities: number[];
  private values: T[];
  private length: number;

  constructor(initialCapacity = 16) {
    this.priorities = new Array(initialCapacity);
    this.values = new Array(initialCapacity);
    this.length = 0;
  }

  size(): number {
    return this.length;
  }

  isEmpty(): boolean {
    return this.length === 0;
  }

  insert(value: T, priority: number): void {
    let i = this.length;

    // grow manually (double capacity)
    if (i === this.priorities.length) {
      const newCap = i << 1;
      this.priorities.length = newCap;
      this.values.length = newCap;
    }

    this.length = i + 1;

    const priorities = this.priorities;
    const values = this.values;

    // hole algorithm
    while (i > 0) {
      const parent = (i - 1) >>> 1;
      const parentPriority = priorities[parent]!;

      if (parentPriority <= priority) break;

      priorities[i] = parentPriority;
      values[i] = values[parent]!;
      i = parent;
    }

    priorities[i] = priority;
    values[i] = value;
  }

  popMin(): T {
    const priorities = this.priorities;
    const values = this.values;

    const result = values[0]!;
    const lastIndex = --this.length;

    if (lastIndex === 0) {
      return result;
    }

    const lastPriority = priorities[lastIndex]!;
    const lastValue = values[lastIndex]!;

    let i = 0;
    const half = lastIndex >>> 1; // nodes with children

    while (i < half) {
      let left = (i << 1) + 1;
      let right = left + 1;

      let smallest = left;
      let smallestPriority = priorities[left]!;

      if (right < lastIndex) {
        const rightPriority = priorities[right]!;
        
        if (rightPriority < smallestPriority) {
          smallest = right;
          smallestPriority = rightPriority;
        }
      }

      if (smallestPriority >= lastPriority) break;

      priorities[i] = smallestPriority;
      values[i] = values[smallest]!;
      i = smallest;
    }

    priorities[i] = lastPriority;
    values[i] = lastValue;

    return result;
  }
}