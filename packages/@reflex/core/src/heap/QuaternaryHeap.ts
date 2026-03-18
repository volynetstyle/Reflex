/**
 * Минимальная куча: 4-арная (QuaternaryHeap<T>) + 8-арная (OctalHeap<T>).
 *
 * ── Применённые оптимизации ──────────────────────────────────────────────────
 *
 *  1. PACKED SMI-массив вместо Uint32Array.
 *     V8 помечает обычный Array<number> целых как PACKED_SMI_ELEMENTS —
 *     JIT обрабатывает SMI-операции быстрее, чем чтения из TypedArray
 *     (TypedArray всегда возвращает double, SMI — нет).
 *     Также убрано кодирование toKey(): для целых приоритетов оно не нужно,
 *     для float достаточно передавать число напрямую (V8 хранит float64 как
 *     HeapNumber, но без лишних ArrayBuffer-операций).
 *
 *  2. Branchless выбор минимального ребёнка.
 *     Вместо серии if/else — тернарные операторы, которые V8/JIT может
 *     скомпилировать в условные переходы без сброса конвейера:
 *
 *       const b01k = c0k < c1k ? c0k : c1k;
 *       const b01i = c0k < c1k ? base : base + 1;
 *       ...
 *       const mk = b01k < b23k ? b01k : b23k;
 *       const mc = b01k < b23k ? b01i : b23i;
 *
 *     4 загрузки → 3 сравнения → 0 непредсказуемых переходов.
 *
 *  3. grow() копирует данные и заполняет новые слоты нулями/null.
 *     Оригинальная версия молча выбрасывала все накопленные данные!
 *     Заполнение через .fill() держит массив в режиме PACKED, избегая
 *     holey-переходов (HOLEY_ELEMENTS медленнее PACKED_ELEMENTS в V8).
 *
 *  4. 8-арная куча (OctalHeap) для больших N.
 *     Высота ≈ ⅓·log₂n против ½·log₂n у 4-арной.
 *     8 последовательных uint32/smi нагрузок хорошо предсказываются
 *     аппаратным prefetcher'ом — выигрыш на N ≳ 50–100K.
 *
 * ── Арность и индексная арифметика ──────────────────────────────────────────
 *
 *   4-арная:  parent(i) = (i−1) >> 2,  дети: 4i+1 .. 4i+4
 *   8-арная:  parent(i) = (i−1) >> 3,  дети: 8i+1 .. 8i+8
 *
 * ── Fast-path insert ─────────────────────────────────────────────────────────
 *
 *   new_key ≥ keys[parent(tail)] → добавляем в хвост без просейки.
 *   В топологических планировщиках приоритеты монотонны → O(1) почти всегда.
 *
 * ── Fast-path popMin ─────────────────────────────────────────────────────────
 *
 *   После перемещения хвоста в корень: key ≤ min(дети глубины 1) → O(1).
 */

function nextPow2(n: number): number {
  if (n <= 1) return 1;
  --n;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// QuaternaryHeap<T> — 4-арная куча
// ─────────────────────────────────────────────────────────────────────────────

export class QuaternaryHeap<T> {
  // ОПТИМИЗАЦИЯ 1: обычный Array<number> вместо Uint32Array.
  // V8 помечает его как PACKED_SMI_ELEMENTS для целых приоритетов,
  // что даёт более быстрые JIT-пути, чем TypedArray (избегаем конверсии в double).
  private keys: number[];
  private values: (T | null)[];
  private _size: number = 0;
  private capacity: number;

  constructor(initialCapacity = 64) {
    const cap = nextPow2(initialCapacity);
    this.capacity = cap;
    // ОПТИМИЗАЦИЯ 3: fill(0) / fill(null) → PACKED_*, не HOLEY_*.
    this.keys = new Array<number>(cap).fill(0);
    this.values = new Array<T | null>(cap).fill(null);
  }

  size(): number { return this._size; }
  isEmpty(): boolean { return this._size === 0; }
  peek(): T | undefined { return this._size > 0 ? (this.values[0] as T) : undefined; }
  peekKey(): number | undefined { return this._size > 0 ? this.keys[0] : undefined; }

  insert(value: T, priority: number): void {
    if (this._size === this.capacity) this.grow();

    const key = priority;
    const keys = this.keys;
    const values = this.values;
    let i = this._size;

    // Fast-path: новый ключ ≥ ключу родителя → просейка не нужна.
    if (i > 0 && key >= keys[(i - 1) >> 2]!) {
      keys[i] = key;
      values[i] = value;
      this._size = i + 1;
      return;
    }

    this._size = i + 1;

    // Просейка вверх.
    while (i > 0) {
      const parent = (i - 1) >> 2;
      const pk = keys[parent]!;
      if (key >= pk) break;
      keys[i] = pk;
      values[i] = values[parent]!;
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }

  popMin(): T | undefined {
    if (this._size === 0) return undefined;

    const keys = this.keys;
    const values = this.values;
    const minVal = values[0] as T;
    const last = --this._size;

    if (last === 0) {
      values[0] = null;
      return minVal;
    }

    const key = keys[last]!;
    const value = values[last]!;
    values[last] = null; // GC-обнуление хвоста
    keys[0] = key;
    values[0] = value;

    const n = this._size;

    // Fast-path: ключ корня ≤ минимума детей глубины 1 (индексы 1..4).
    {
      let lo = n > 1 ? keys[1]! : 0x7fffffff;
      if (n > 2 && keys[2]! < lo) lo = keys[2]!;
      if (n > 3 && keys[3]! < lo) lo = keys[3]!;
      if (n > 4 && keys[4]! < lo) lo = keys[4]!;
      if (key <= lo) return minVal;
    }

    let i = 0;
    // limit: наибольший i, при котором все 4 ребёнка гарантированно в массиве.
    // base + 3 = 4i+4 < n  →  i < (n-1)/4  →  i ≤ (n-5)>>2
    const limit = (n - 5) >> 2;

    // ── Цикл 1: без проверки границ (полные уровни) ─────────────────────────
    while (i <= limit) {
      const base = (i << 2) + 1;

      // ОПТИМИЗАЦИЯ 2: branchless-выбор минимального ребёнка.
      // Тернарные операторы компилируются в cmov/csel без сброса конвейера.
      const c0k = keys[base]!;
      const c1k = keys[base + 1]!;
      const c2k = keys[base + 2]!;
      const c3k = keys[base + 3]!;

      const b01k = c0k < c1k ? c0k : c1k;
      const b01i = c0k < c1k ? base : base + 1;
      const b23k = c2k < c3k ? c2k : c3k;
      const b23i = c2k < c3k ? base + 2 : base + 3;

      const mk = b01k < b23k ? b01k : b23k;
      const mc = b01k < b23k ? b01i : b23i;

      if (key <= mk) break;

      keys[i] = mk;
      values[i] = values[mc]!;
      i = mc;
    }

    // ── Цикл 2: с проверкой границ (последний неполный уровень) ─────────────
    while (true) {
      const base = (i << 2) + 1;
      if (base >= n) break;

      // Загружаем только существующих детей; отсутствующих заменяем Infinity.
      const c0k = keys[base]!;
      const c1k = base + 1 < n ? keys[base + 1]! : Infinity;
      const c2k = base + 2 < n ? keys[base + 2]! : Infinity;
      const c3k = base + 3 < n ? keys[base + 3]! : Infinity;

      const b01k = c0k < c1k ? c0k : c1k;
      const b01i = c0k < c1k ? base : base + 1;
      const b23k = c2k < c3k ? c2k : c3k;
      const b23i = c2k < c3k ? base + 2 : base + 3;

      const mk = b01k < b23k ? b01k : b23k;
      const mc = b01k < b23k ? b01i : b23i;

      if (key <= mk) break;

      keys[i] = mk;
      values[i] = values[mc]!;
      i = mc;
    }

    keys[i] = key;
    values[i] = value;
    return minVal;
  }

  clear(): void {
    this.values.fill(null, 0, this._size);
    this._size = 0;
  }

  // ОПТИМИЗАЦИЯ 3: grow() теперь копирует данные (оригинал их терял!).
  // Новые слоты заполняются 0/null → PACKED_* режим сохраняется.
  private grow(): void {
    const nc = this.capacity << 1;

    const newKeys = new Array<number>(nc).fill(0);
    const newValues = new Array<T | null>(nc).fill(null);

    // Копируем существующие данные.
    for (let j = 0; j < this._size; j++) {
      newKeys[j] = this.keys[j]!;
      newValues[j] = this.values[j]!;
    }

    this.keys = newKeys;
    this.values = newValues;
    this.capacity = nc;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OctalHeap<T> — 8-арная куча (ОПТИМИЗАЦИЯ 4)
//
// Рекомендуется для N ≳ 50–100K.
// Высота ≈ ⅓·log₂n: на 33 % меньше уровней, чем у 4-арной.
// 8 последовательных SMI-загрузок укладываются в одну-две кэш-линии и
// хорошо предсказываются prefetcher'ом.
// ─────────────────────────────────────────────────────────────────────────────

export class OctalHeap<T> {
  private keys: number[];
  private values: (T | null)[];
  private _size: number = 0;
  private capacity: number;

  constructor(initialCapacity = 64) {
    const cap = nextPow2(initialCapacity);
    this.capacity = cap;
    this.keys = new Array<number>(cap).fill(0);
    this.values = new Array<T | null>(cap).fill(null);
  }

  size(): number { return this._size; }
  isEmpty(): boolean { return this._size === 0; }
  peek(): T | undefined { return this._size > 0 ? (this.values[0] as T) : undefined; }
  peekKey(): number | undefined { return this._size > 0 ? this.keys[0] : undefined; }

  insert(value: T, priority: number): void {
    if (this._size === this.capacity) this.grow();

    const key = priority;
    const keys = this.keys;
    const values = this.values;
    let i = this._size;

    // Fast-path: parent(i) = (i−1) >> 3
    if (i > 0 && key >= keys[(i - 1) >> 3]!) {
      keys[i] = key;
      values[i] = value;
      this._size = i + 1;
      return;
    }

    this._size = i + 1;

    while (i > 0) {
      const parent = (i - 1) >> 3;
      const pk = keys[parent]!;
      if (key >= pk) break;
      keys[i] = pk;
      values[i] = values[parent]!;
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }

  popMin(): T | undefined {
    if (this._size === 0) return undefined;

    const keys = this.keys;
    const values = this.values;
    const minVal = values[0] as T;
    const last = --this._size;

    if (last === 0) {
      values[0] = null;
      return minVal;
    }

    const key = keys[last]!;
    const value = values[last]!;
    values[last] = null;
    keys[0] = key;
    values[0] = value;

    const n = this._size;

    // Fast-path: проверяем минимум первых 8 детей (индексы 1..8).
    {
      let lo = n > 1 ? keys[1]! : 0x7fffffff;
      for (let c = 2; c <= 8 && c < n; c++) {
        const ck = keys[c]!;
        if (ck < lo) lo = ck;
      }
      if (key <= lo) return minVal;
    }

    let i = 0;
    // limit: наибольший i, при котором все 8 детей в массиве.
    // base + 7 = 8i+8 < n  →  i ≤ (n-9)>>3
    const limit = (n - 9) >> 3;

    // ── Цикл 1: без проверки границ ─────────────────────────────────────────
    while (i <= limit) {
      const base = (i << 3) + 1;

      // Branchless турнир из 8 → 4 → 2 → 1 через тернарные операторы.
      const c0 = keys[base]!,     c1 = keys[base + 1]!;
      const c2 = keys[base + 2]!, c3 = keys[base + 3]!;
      const c4 = keys[base + 4]!, c5 = keys[base + 5]!;
      const c6 = keys[base + 6]!, c7 = keys[base + 7]!;

      const k01 = c0 < c1 ? c0 : c1; const i01 = c0 < c1 ? base     : base + 1;
      const k23 = c2 < c3 ? c2 : c3; const i23 = c2 < c3 ? base + 2 : base + 3;
      const k45 = c4 < c5 ? c4 : c5; const i45 = c4 < c5 ? base + 4 : base + 5;
      const k67 = c6 < c7 ? c6 : c7; const i67 = c6 < c7 ? base + 6 : base + 7;

      const k03 = k01 < k23 ? k01 : k23; const i03 = k01 < k23 ? i01 : i23;
      const k47 = k45 < k67 ? k45 : k67; const i47 = k45 < k67 ? i45 : i67;

      const mk = k03 < k47 ? k03 : k47;
      const mc = k03 < k47 ? i03 : i47;

      if (key <= mk) break;

      keys[i] = mk;
      values[i] = values[mc]!;
      i = mc;
    }

    // ── Цикл 2: с проверкой границ ──────────────────────────────────────────
    while (true) {
      const base = (i << 3) + 1;
      if (base >= n) break;

      let mc = base;
      let mk = keys[base]!;

      for (let c = base + 1; c < base + 8 && c < n; c++) {
        const ck = keys[c]!;
        if (ck < mk) { mk = ck; mc = c; }
      }

      if (key <= mk) break;

      keys[i] = mk;
      values[i] = values[mc]!;
      i = mc;
    }

    keys[i] = key;
    values[i] = value;
    return minVal;
  }

  clear(): void {
    this.values.fill(null, 0, this._size);
    this._size = 0;
  }

  private grow(): void {
    const nc = this.capacity << 1;

    const newKeys = new Array<number>(nc).fill(0);
    const newValues = new Array<T | null>(nc).fill(null);

    for (let j = 0; j < this._size; j++) {
      newKeys[j] = this.keys[j]!;
      newValues[j] = this.values[j]!;
    }

    this.keys = newKeys;
    this.values = newValues;
    this.capacity = nc;
  }
}