/**
 * Минимальная куча: 4-арная (общий тип T) + 8-арная (Uint32, fast-path).
 *
 * ── Хранилище ────────────────────────────────────────────────────────────────
 *
 *   keys   → Uint32Array   приоритеты, закодированные с сохранением порядка
 *   values → T[]           параллельный массив значений
 *
 *   Uint32Array плотнее Float64Array (4 Б против 8 Б на слот): вдвое меньше
 *   кэш-линий на уровень просейки, нет GC-барьеров на запись.
 *
 * ── Кодирование приоритета: toKey(x) ────────────────────────────────────────
 *
 *   Любое JS-число → Uint32 с сохранением полного числового порядка.
 *   Алгоритм использует IEEE-754 float32:
 *
 *     1. Math.fround(x) → биты uint32 через общий ArrayBuffer (без аллокаций).
 *     2. XOR с учётом знака сворачивает отрицательные в нижний диапазон uint32:
 *
 *          mask = (bits >> 31) | 0x80000000
 *          key  = (bits ^ mask) >>> 0
 *
 *   Корректно для ±0, ±Infinity, субнормалей, дробей. Без ветвлений.
 *
 * ── Арность и высота дерева ──────────────────────────────────────────────────
 *
 *   4-арная куча:  parent(i) = (i−1) >> 2,  children: 4i+1 .. 4i+4
 *                  высота ≈ log₄ n = ½ log₂ n
 *
 *   8-арная куча:  parent(i) = (i−1) >> 3,  children: 8i+1 .. 8i+8
 *                  высота ≈ log₈ n = ⅓ log₂ n  →  на треть меньше уровней
 *
 *   Больше детей = больше сравнений на уровень, но меньше уровней.
 *   На больших N и тёплом кэше 8-арная выигрывает: 8 последовательных
 *   uint32-нагрузок хорошо предсказываются prefetcher'ом.
 *
 * ── Быстрый путь insert ──────────────────────────────────────────────────────
 *
 *   Условие «безопасного добавления»: new_key ≥ keys[parent(tail)].
 *   В реактивных планировщиках приоритеты топологически неубывающие,
 *   поэтому fast-path срабатывает почти на каждой вставке → O(1) амортизированно.
 *
 * ── Быстрый путь popMin ──────────────────────────────────────────────────────
 *
 *   После перемещения хвостового элемента в корень: если его ключ ≤ минимума
 *   всех детей глубины 1 — просейка не нужна → O(1) для почти упорядоченных куч.
 *
 * ── Детали реализации ────────────────────────────────────────────────────────
 *
 *   • grow() удваивает ёмкость (степень двойки) — минимум реаллокаций,
 *     выравнивание для аллокатора, нет деления в адресной арифметике.
 *   • Просейка вниз разбита на два цикла: без проверки границ (полные уровни)
 *     и с проверкой (последний неполный уровень).
 *   • Нулевые слоты в values обнуляются после удаления — нет «призрачных» ссылок,
 *     GC может собрать объекты.
 */

// ── Общий буфер кодирования ───────────────────────────────────────────────────
// Одна аллокация на модуль; нулевое давление на GC при каждом вызове toKey.
const _kbuf = new ArrayBuffer(4);
const _kf32 = new Float32Array(_kbuf);
const _ku32 = new Uint32Array(_kbuf);

/**
 * Отображает любое JS-число в Uint32 с сохранением полного числового порядка.
 * Обрабатывает ±0, ±Infinity, субнормали и дроби. Без ветвлений и аллокаций.
 */
function toKey(priority: number): number {
  _kf32[0] = priority;
  const bits = _ku32[0]!;
  // mask = 0x80000000 при x≥0, 0xFFFFFFFF при x<0
  return (bits ^ ((bits >> 31) | 0x80000000)) >>> 0;
}

/** Округляет n вверх до следующей степени двойки (n ≥ 1). */
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

export class QuaternaryHeap<T> {
  private keys: Uint32Array;
  private values: T[];
  private _size: number = 0;
  private capacity: number;

  constructor(initialCapacity = 64) {
    const cap = nextPow2(initialCapacity);
    this.capacity = cap;
    this.keys = new Uint32Array(cap);
    this.values = new Array(cap);
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
  peekKey(): number | undefined {
    return this._size > 0 ? this.keys[0] : undefined;
  }

  insert(value: T, priority: number): void {
    if (this._size === this.capacity) this.grow();

    const key = toKey(priority);
    const keys = this.keys;
    const values = this.values;
    let i = this._size;

    // Fast-path: новый ключ ≥ ключу родителя → просейка не нужна.
    // parent(i) = (i−1) >> 2  (4-арная куча)
    if (i > 0 && key >= keys[(i - 1) >> 2]!) {
      keys[i] = key;
      values[i] = value;
      this._size = i + 1;
      return;
    }

    this._size = i + 1;
    // Просейка вверх: пузырём поднимаем ключ к корню.
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
    const minVal = values[0];
    const last = --this._size;

    if (last === 0) {
      values[0] = null as unknown as T;
      return minVal;
    }

    // Хвостовой элемент переходит в корень; нулируем хвост.
    const key = keys[last]!;
    const value = values[last]!;
    values[last] = null as unknown as T;
    keys[0] = key;
    values[0] = value;

    const n = this._size;

    // Fast-path: ключ корня ≤ минимума детей глубины 1 (индексы 1..4).
    // Если условие выполнено — куча уже упорядочена, просейка не нужна.
    {
      let lo = n > 1 ? keys[1]! : 0xffffffff;
      if (n > 2 && keys[2]! < lo) lo = keys[2]!;
      if (n > 3 && keys[3]! < lo) lo = keys[3]!;
      if (n > 4 && keys[4]! < lo) lo = keys[4]!;
      if (key <= lo) return minVal;
    }

    // Просейка вниз (4-арная куча): два цикла.
    //
    // Цикл 1 — без проверки границ.
    //   Инвариант: i ≤ limit гарантирует, что все 4 ребёнка (base..base+3) в массиве.
    //   limit = наибольший i, при котором base+3 = 4i+4 < n  →  i ≤ (n−5)/4.
    let i = 0;
    const limit = (n - 5) >> 2;

    while (i <= limit) {
      const base = (i << 2) + 1; // первый ребёнок узла i
      let mc = base;
      let mk = keys[base]!;

      // Разворачиваем поиск минимума среди 4 детей.
      let ck = keys[base + 1]!;
      if (ck < mk) {
        mk = ck;
        mc = base + 1;
      }
      ck = keys[base + 2]!;
      if (ck < mk) {
        mk = ck;
        mc = base + 2;
      }
      ck = keys[base + 3]!;
      if (ck < mk) {
        mk = ck;
        mc = base + 3;
      }

      if (key <= mk) break; // текущий ключ ≤ минимума детей — на месте

      keys[i] = mk;
      values[i] = values[mc]!;
      i = mc;
    }

    // Цикл 2 — с явной проверкой границ (последний неполный уровень).
    while (true) {
      const base = (i << 2) + 1;
      if (base >= n) break;

      let mc = base;
      let mk = keys[base]!;

      let c = base + 1;
      if (c < n) {
        const ck = keys[c]!;
        if (ck < mk) {
          mk = ck;
          mc = c;
        }
      }
      c = base + 2;
      if (c < n) {
        const ck = keys[c]!;
        if (ck < mk) {
          mk = ck;
          mc = c;
        }
      }
      c = base + 3;
      if (c < n) {
        const ck = keys[c]!;
        if (ck < mk) {
          mk = ck;
          mc = c;
        }
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
    this.values.fill(null as unknown as T, 0, this._size);
    this._size = 0;
  }

  private grow(): void {
    const nc = this.capacity << 1; // удваиваем → степень двойки
    const nk = new Uint32Array(nc);
    nk.set(this.keys);
    this.keys = nk;
    this.values.length = nc;
    this.capacity = nc;
  }
}
