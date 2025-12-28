export function packHandle(index: number, generation: number): bigint {
  return (BigInt(generation) << 32n) | BigInt(index >>> 0);
}

export function unpackHandle(h: bigint): [index: number, generation: number] {
  return [Number(h & 0xffffffffn), Number(h >> 32n)];
}

// Compact handle packing для малих індексів (<2^24)
export function packHandleCompact(index: number, generation: number): number {
  // 24 біти для index, 8 бітів для generation
  return (generation << 24) | (index & 0xFFFFFF);
}

export function unpackHandleCompact(h: number): [index: number, generation: number] {
  return [h & 0xFFFFFF, (h >>> 24) & 0xFF];
}

// Slot може бути або зайнятим (з даними + generation), або вільним (з next index)
type Slot<T> = 
  | { occupied: true; generation: number; value: T }
  | { occupied: false; next: number };

export class GenerationalArena<T> {
  /* ───────────── storage ───────────── */
  private slots: Slot<T>[];
  private freeHead: number;
  private size: number;

  /* ───────────── ctor ───────────── */
  constructor(initialCapacity: number = 16) {
    this.slots = [];
    this.freeHead = -1;
    this.size = 0;
    
    // Не вимагаємо power-of-two
    if (initialCapacity > 0) {
      this.slots.length = initialCapacity;
    }
  }

  /* ───────────── capacity ───────────── */
  private grow(): void {
    const oldCap = this.slots.length;
    // Подвоюємо, але не вимагаємо power-of-two
    const newCap = oldCap === 0 ? 16 : oldCap << 1;
    this.slots.length = newCap;
  }

  /* ───────────── allocation ───────────── */
  insert(value: T): [index: number, generation: number] {
    let index: number;
    let generation: number;

    if (this.freeHead !== -1) {
      // LIFO: беремо з голови free list (краща cache locality)
      index = this.freeHead;
      const slot = this.slots[index];
      
      if (slot && !slot.occupied) {
        this.freeHead = slot.next;
        generation = 1; // Нова генерація для переробленого слота
      } else {
        // Fallback (не повинно статися)
        this.freeHead = -1;
        index = this.size;
        generation = 1;
      }
    } else {
      // Алокуємо новий слот
      index = this.size;
      
      if (index >= this.slots.length) {
        this.grow();
      }
      
      generation = 1;
    }

    // Зберігаємо як occupied slot
    this.slots[index] = { occupied: true, generation, value };
    this.size++;

    return [index, generation];
  }

  /* ───────────── validation ───────────── */
  isValid(index: number, generation: number): boolean {
    if (index < 0 || index >= this.slots.length) return false;
    
    const slot = this.slots[index];
    if (!slot || !slot.occupied) return false;
    
    return slot.generation === generation;
  }

  /* ───────────── access ───────────── */
  get(index: number, generation: number): T | undefined {
    if (index < 0 || index >= this.slots.length) return undefined;
    
    const slot = this.slots[index];
    if (!slot || !slot.occupied) return undefined;
    if (slot.generation !== generation) return undefined;
    
    return slot.value;
  }

  /* ───────────── removal ───────────── */
  remove(index: number, generation: number): T | undefined {
    if (!this.isValid(index, generation)) return undefined;

    const slot = this.slots[index] as { occupied: true; generation: number; value: T };
    const value = slot.value;
    
    // LIFO: додаємо в голову free list
    const newGeneration = (slot.generation + 1) & 0xFFFFFFFF;
    this.slots[index] = { occupied: false, next: this.freeHead };
    this.freeHead = index;
    this.size--;

    return value;
  }

  /* ───────────── iteration (тільки occupied) ───────────── */
  *entries(): Generator<[index: number, generation: number, value: T]> {
    // O(capacity), але скануємо лише до реального розміру
    const len = this.slots.length;
    for (let i = 0; i < len; i++) {
      const slot = this.slots[i];
      if (slot && slot.occupied) {
        yield [i, slot.generation, slot.value];
      }
    }
  }

  *valuesIter(): Generator<T> {
    const len = this.slots.length;
    for (let i = 0; i < len; i++) {
      const slot = this.slots[i];
      if (slot && slot.occupied) {
        yield slot.value;
      }
    }
  }

  /* ───────────── shrink-to-fit ───────────── */
  shrinkToFit(): void {
    // Знаходимо останній occupied slot
    let lastOccupied = -1;
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const slot = this.slots[i];
      if (slot && slot.occupied) {
        lastOccupied = i;
        break;
      }
    }
    
    // Обрізаємо до мінімального потрібного розміру
    const newCap = lastOccupied + 1;
    if (newCap < this.slots.length) {
      this.slots.length = newCap;
      
      // Перебудовуємо free list (видаляємо посилання на обрізані індекси)
      this.freeHead = -1;
      for (let i = 0; i < newCap; i++) {
        const slot = this.slots[i];
        if (slot && !slot.occupied) {
          slot.next = this.freeHead;
          this.freeHead = i;
        }
      }
    }
  }

  /* ───────────── misc ───────────── */
  get length(): number {
    return this.size;
  }

  get capacity(): number {
    return this.slots.length;
  }

  clear(): void {
    this.slots.length = 0;
    this.freeHead = -1;
    this.size = 0;
  }
}
