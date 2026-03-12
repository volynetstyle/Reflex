import { bench, describe, expect } from "vitest";

// ─── core (без изменений) ─────────────────────────────────────────────────────

let CurrentReaction: Reactive<any> | undefined = undefined;
let CurrentGets: Reactive<any>[] | null = null;
let CurrentGetsIndex = 0;

let EffectQueue: Reactive<any>[] = [];
let stabilizeFn: ((node: Reactive<any>) => void) | undefined = undefined;
let stabilizationQueued = false;

export const CacheClean = 0;
export const CacheCheck = 1;
export const CacheDirty = 2;
export type CacheState =
  | typeof CacheClean
  | typeof CacheCheck
  | typeof CacheDirty;
type CacheNonClean = typeof CacheCheck | typeof CacheDirty;

function defaultEquality(a: any, b: any) {
  return a === b;
}

export class Reactive<T> {
  private _value: T;
  private fn?: () => T;
  private observers: Reactive<any>[] | null = null;
  private sources: Reactive<any>[] | null = null;
  private state: CacheState;
  private effect: boolean;
  cleanups: ((oldValue: T) => void)[] = [];
  equals = defaultEquality;

  constructor(fnOrValue: (() => T) | T, effect?: boolean) {
    if (typeof fnOrValue === "function") {
      this.fn = fnOrValue as () => T;
      this._value = undefined as any;
      this.effect = effect || false;
      this.state = CacheDirty;
      if (effect) {
        EffectQueue.push(this);
        stabilizeFn?.(this);
      }
    } else {
      this.fn = undefined;
      this._value = fnOrValue;
      this.state = CacheClean;
      this.effect = false;
    }
  }

  get(): T {
    if (CurrentReaction) {
      if (
        !CurrentGets &&
        CurrentReaction.sources &&
        CurrentReaction.sources[CurrentGetsIndex] == this
      ) {
        CurrentGetsIndex++;
      } else {
        if (!CurrentGets) CurrentGets = [this];
        else CurrentGets.push(this);
      }
    }
    if (this.fn) this.updateIfNecessary();
    return this._value;
  }

  set(fnOrValue: T | (() => T)): void {
    if (typeof fnOrValue === "function") {
      const fn = fnOrValue as () => T;
      if (fn !== this.fn) this.stale(CacheDirty);
      this.fn = fn;
    } else {
      if (this.fn) {
        this.removeParentObservers(0);
        this.sources = null;
        this.fn = undefined;
      }
      if (!this.equals(this._value, fnOrValue as T)) {
        if (this.observers) {
          for (let i = 0; i < this.observers.length; i++) {
            this.observers[i].stale(CacheDirty);
          }
        }
        this._value = fnOrValue as T;
      }
    }
  }

  private stale(state: CacheNonClean): void {
    if (this.state < state) {
      if (this.state === CacheClean && this.effect) {
        EffectQueue.push(this);
        stabilizeFn?.(this);
      }
      this.state = state;
      if (this.observers) {
        for (let i = 0; i < this.observers.length; i++) {
          this.observers[i].stale(CacheCheck);
        }
      }
    }
  }

  private update(): void {
    const oldValue = this._value;
    const prevReaction = CurrentReaction;
    const prevGets = CurrentGets;
    const prevIndex = CurrentGetsIndex;

    CurrentReaction = this;
    CurrentGets = null as any;
    CurrentGetsIndex = 0;

    try {
      if (this.cleanups.length) {
        this.cleanups.forEach((c) => c(this._value));
        this.cleanups = [];
      }
      this._value = this.fn!();

      if (CurrentGets) {
        this.removeParentObservers(CurrentGetsIndex);
        if (this.sources && CurrentGetsIndex > 0) {
          this.sources.length = CurrentGetsIndex + CurrentGets.length;
          for (let i = 0; i < CurrentGets.length; i++) {
            this.sources[CurrentGetsIndex + i] = CurrentGets[i];
          }
        } else {
          this.sources = CurrentGets;
        }
        for (let i = CurrentGetsIndex; i < this.sources.length; i++) {
          const source = this.sources[i];
          if (!source.observers) source.observers = [this];
          else source.observers.push(this);
        }
      } else if (this.sources && CurrentGetsIndex < this.sources.length) {
        this.removeParentObservers(CurrentGetsIndex);
        this.sources.length = CurrentGetsIndex;
      }
    } finally {
      CurrentGets = prevGets;
      CurrentReaction = prevReaction;
      CurrentGetsIndex = prevIndex;
    }

    if (!this.equals(oldValue, this._value) && this.observers) {
      for (let i = 0; i < this.observers.length; i++) {
        this.observers[i].state = CacheDirty;
      }
    }
    this.state = CacheClean;
  }

  private updateIfNecessary(): void {
    if (this.state === CacheCheck) {
      for (const source of this.sources!) {
        source.updateIfNecessary();
        if ((this.state as CacheState) === CacheDirty) break;
      }
    }
    if (this.state === CacheDirty) this.update();
    this.state = CacheClean;
  }

  private removeParentObservers(index: number): void {
    if (!this.sources) return;
    for (let i = index; i < this.sources.length; i++) {
      const source = this.sources[i];
      const swap = source.observers!.findIndex((v) => v === this);
      source.observers![swap] = source.observers![source.observers!.length - 1];
      source.observers!.pop();
    }
  }
}

export function stabilize(): void {
  for (let i = 0; i < EffectQueue.length; i++) EffectQueue[i].get();
  EffectQueue.length = 0;
}

export function autoStabilize(fn = deferredStabilize): void {
  stabilizeFn = fn;
}

function deferredStabilize(): void {
  if (!stabilizationQueued) {
    stabilizationQueued = true;
    queueMicrotask(() => {
      stabilizationQueued = false;
      stabilize();
    });
  }
}

// ─── Signal ───────────────────────────────────────────────────────────────────

class Signal<T> {
  private node: Reactive<T>;

  // Биндим методы в конструкторе — иначе this теряется при деструктуризации
  readonly get: () => T;
  readonly set: (value: T) => void;

  constructor(initialValue: T) {
    this.node = new Reactive<T>(initialValue);
    this.get = () => this.node.get();
    this.set = (value: T) => this.node.set(value);
  }
}

// ─── Computed ─────────────────────────────────────────────────────────────────

class Computed<T> {
  private node: Reactive<T>;

  readonly get: () => T;

  constructor(fn: () => T) {
    this.node = new Reactive<T>(fn);
    this.get = () => this.node.get();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const signal = <T>(initialValue: T) => {
  const s = new Signal(initialValue);
  return [s.get, s.set] as const;
};

export const computed = <T>(fn: () => T) => {
  const c = new Computed<T>(fn);
  return c.get;
};

// ── Validation helper ─────────────────────────────────────────────────────────
//
// Сравнивает actual (результат уже вычисленного узла) с expected.
// Не вызывает fn повторно — значение передаётся снаружи из цикла материализации,
// чтобы избежать проблемы "до первого чтения computed возвращает undefined".

function validate(label: string, actual: unknown, expected: number): void {
  if (actual === undefined || actual === null) {
    throw new Error(
      `[VALIDATION FAILED] ${label}\n` +
        `  node returned ${actual} — это не должно случиться если узел был прочитан до validate.\n` +
        `  Проверь что fn() вызывается до передачи значения в validate.`,
    );
  }
  if (actual !== expected) {
    throw new Error(
      `[VALIDATION FAILED] ${label}\n` +
        `  expected : ${expected}\n` +
        `  actual   : ${actual}\n` +
        `  diff     : ${(actual as number) - expected}`,
    );
  }
}

// ── Wide graphs ───────────────────────────────────────────────────────────────
//
// "Static 1000x5, 2 sources"
//   1000 листовых computed, каждый читает 5 deps.
//   2 независимых источника чередуются при обновлении.
//
// "Static 1000x5, 25 sources"
//   То же, но 25 источников.

describe("Wide graphs", () => {
  // ── Static 1000x5, 2 sources ────────────────────────────────────────────
  {
    const NODES = 1000;
    const DEPS_PER_NODE = 5;
    const SOURCES = 2;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));
    const nodes = Array.from({ length: NODES }, (_, i) => {
      return computed(() => {
        let s = 0;
        for (let d = 0; d < DEPS_PER_NODE; d++) {
          s += sources[(i + d) % SOURCES][0]();
        }
        return s;
      });
    });

    // прогрев — инициализируем оба источника явно
    sources[0][1](0);
    sources[1][1](0);
    for (const n of nodes) n(); // cold-start: инициализируем все узлы

    // ── Validation ────────────────────────────────────────────────────────
    // Читаем все узлы в массив — это и материализация, и сбор результатов.
    // validate получает готовое значение, а не fn(), чтобы не нарваться на
    // "undefined до первого вычисления".
    const testVals2 = [3, 7];
    for (let i = 0; i < SOURCES; i++) sources[i][1](testVals2[i]);
    const results2 = nodes.map((n) => n()); // материализуем + собираем
    for (let i = 0; i < NODES; i++) {
      const counts = new Array(SOURCES).fill(0);
      for (let d = 0; d < DEPS_PER_NODE; d++) counts[(i + d) % SOURCES]++;
      const expected = counts.reduce((acc, c, s) => acc + c * testVals2[s], 0);
      validate(`Wide/2src node[${i}]`, results2[i], expected);
    }
    // Restore warmup state
    sources[0][1](0);
    sources[1][1](0);
    for (const n of nodes) n();
    console.log("✓ Static 1000x5, 2 sources — validation passed");

    let tick = 0;
    bench("Static 1000x5, 2 sources", () => {
      sources[tick % SOURCES][1](tick);
      for (const n of nodes) n();
      tick++;
    });
  }

  // ── Static 1000x5, 25 sources ───────────────────────────────────────────
  {
    const NODES = 1000;
    const DEPS_PER_NODE = 5;
    const SOURCES = 25;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));
    const nodes = Array.from({ length: NODES }, (_, i) => {
      return computed(() => {
        let s = 0;
        for (let d = 0; d < DEPS_PER_NODE; d++) {
          s += sources[(i + d) % SOURCES][0]();
        }
        return s;
      });
    });

    sources[0][1](0);
    for (const n of nodes) n();

    // ── Validation ────────────────────────────────────────────────────────
    const primes25 = [
      2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67,
      71, 73, 79, 83, 89, 97,
    ];
    for (let i = 0; i < SOURCES; i++) sources[i][1](primes25[i]);
    const results25 = nodes.map((n) => n()); // материализуем + собираем
    for (let i = 0; i < NODES; i++) {
      const counts = new Array(SOURCES).fill(0);
      for (let d = 0; d < DEPS_PER_NODE; d++) counts[(i + d) % SOURCES]++;
      const expected = counts.reduce((acc, c, s) => acc + c * primes25[s], 0);
      validate(`Wide/25src node[${i}]`, results25[i], expected);
    }
    // Restore
    for (let i = 0; i < SOURCES; i++) sources[i][1](0);
    for (const n of nodes) n();
    console.log("✓ Static 1000x5, 25 sources — validation passed");

    let tick = 0;
    bench("Static 1000x5, 25 sources", () => {
      sources[tick % SOURCES][1](tick);
      for (const n of nodes) n();
      tick++;
    });
  }
});

// ── Deep Graph ────────────────────────────────────────────────────────────────
//
// "Static 5x500, 3 sources"
//   5 независимых цепочек глубиной 500.
//   3 источника — каждая цепочка стартует от одного из них.

describe("Deep Graph", () => {
  {
    const CHAINS = 5;
    const DEPTH = 500;
    const SOURCES = 3;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));
    const ends: (() => unknown)[] = [];

    for (let c = 0; c < CHAINS; c++) {
      const src = sources[c % SOURCES][0];
      let prev = computed(() => src());
      for (let d = 1; d < DEPTH; d++) {
        const p = prev;
        prev = computed(() => p());
      }
      ends.push(prev);
    }

    // прогрев
    for (const s of sources) s[1](0);
    for (const e of ends) e();

    // ── Validation ────────────────────────────────────────────────────────
    // Каждая цепочка c транслирует source[c % SOURCES] через DEPTH слоёв.
    for (let i = 0; i < SOURCES; i++) sources[i][1](i + 1); // 1, 2, 3
    const endResults = ends.map((e) => e()); // материализуем + собираем
    for (let c = 0; c < CHAINS; c++) {
      validate(`Deep chain[${c}]`, endResults[c], (c % SOURCES) + 1);
    }
    // Restore
    for (const s of sources) s[1](0);
    for (const e of ends) e();
    console.log("✓ Static 5x500, 3 sources — validation passed");

    let tick = 0;
    bench("Static 5x500, 3 sources", () => {
      for (const s of sources) s[1](tick);
      for (const e of ends) e();
      tick++;
    });
  }
});

// ── Square Graph ──────────────────────────────────────────────────────────────
//
// "Static 10x10, 2 sources, read 20%"
//   10 слоёв по 10 узлов. Каждый узел читает всех из предыдущего слоя.
//   2 источника в нулевом слое.
//   Читаем только 20% финального слоя (2 из 10 узлов).

describe("Square Graph", () => {
  {
    const LAYERS = 10;
    const WIDTH = 10;
    const SOURCES = 2;
    const READ_RATIO = 0.2;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));

    let layer: (() => unknown)[] = Array.from({ length: WIDTH }, (_, i) => {
      if (i < SOURCES) return sources[i][0];
      const s = sources[i % SOURCES][0];
      return computed(() => s());
    });

    for (let l = 1; l < LAYERS; l++) {
      const prev = layer;
      layer = Array.from({ length: WIDTH }, () => {
        return computed(() => {
          let s = 0;
          for (const p of prev) s += p() as number;
          return s;
        });
      });
    }

    const readCount = Math.max(1, Math.floor(WIDTH * READ_RATIO)); // 2
    const readers = layer.slice(0, readCount);

    // прогрев
    for (const s of sources) s[1](0);
    for (const r of readers) r();

    // ── Validation ────────────────────────────────────────────────────────
    // Layer 0: каждый из WIDTH узлов читает source[i % SOURCES].
    // Layer l: каждый узел = сумма всех WIDTH узлов предыдущего слоя.
    // ⟹ каждый узел финального слоя = layer0Sum * WIDTH^(LAYERS-1).
    const SRC_A = 3;
    const SRC_B = 7;
    sources[0][1](SRC_A);
    sources[1][1](SRC_B);
    const readerResults = readers.map((r) => r()); // материализуем + собираем

    const layer0Sum = Array.from({ length: WIDTH }, (_, i) =>
      i % SOURCES === 0 ? SRC_A : SRC_B,
    ).reduce((a, b) => a + b, 0);
    const expectedFinalNode = layer0Sum * Math.pow(WIDTH, LAYERS - 2);

    for (let ri = 0; ri < readCount; ri++) {
      validate(`Square reader[${ri}]`, readerResults[ri], expectedFinalNode);
    }
    // Restore
    for (const s of sources) s[1](0);
    for (const r of readers) r();
    console.log("✓ Static 10x10, 2 sources, read 20% — validation passed");

    let tick = 0;
    bench("Static 10x10, 2 sources, read 20%", () => {
      for (let i = 0; i < SOURCES; i++) sources[i][1](tick);
      for (const r of readers) r();
      tick++;
    });
  }
});

// ── Dynamic Graphs ────────────────────────────────────────────────────────────
//
// "25% Dynamic 100x15, 6 sources, read 20%"
// "25% Dynamic 100x15, 6 sources" (read 100%)

describe("Dynamic Graphs", () => {
  // ── 25% Dynamic 100x15, 6 sources, read 20% ────────────────────────────
  {
    const NODES = 100;
    const DEPS = 15;
    const SOURCES = 6;
    const DYNAMIC_RATIO = 0.25;
    const READ_RATIO = 0.2;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));
    const dynamicCount = Math.floor(NODES * DYNAMIC_RATIO); // 25

    const nodes = Array.from({ length: NODES }, (_, i) => {
      const isDynamic = i < dynamicCount;
      return computed(() => {
        let s = 0;
        if (isDynamic) {
          const v = sources[0][0]();
          if (v % 2 === 0) {
            for (let d = 0; d < DEPS; d++) s += sources[d % SOURCES][0]();
          } else {
            for (let d = DEPS - 1; d >= 0; d--) s += sources[d % SOURCES][0]();
          }
        } else {
          for (let d = 0; d < DEPS; d++) s += sources[(i + d) % SOURCES][0]();
        }
        return s;
      });
    });

    const readCount = Math.max(1, Math.floor(NODES * READ_RATIO)); // 20
    const readers = nodes.slice(0, readCount);

    // прогрев
    for (const s of sources) s[1](0);
    for (const r of readers) r();

    // ── Validation ────────────────────────────────────────────────────────
    const expectedForNode = (vals: number[], i: number): number => {
      const isDynamic = i < dynamicCount;
      let s = 0;
      if (isDynamic) {
        const v = vals[0];
        if (v % 2 === 0) {
          for (let d = 0; d < DEPS; d++) s += vals[d % SOURCES];
        } else {
          for (let d = DEPS - 1; d >= 0; d--) s += vals[d % SOURCES];
        }
      } else {
        for (let d = 0; d < DEPS; d++) s += vals[(i + d) % SOURCES];
      }
      return s;
    };

    // Even branch (source[0] чётный)
    const testValsEven = [2, 1, 3, 5, 7, 11];
    for (let i = 0; i < SOURCES; i++) sources[i][1](testValsEven[i]);
    const resultsEven = readers.map((r) => r()); // материализуем + собираем
    for (let ri = 0; ri < readCount; ri++) {
      validate(
        `Dyn/20% reader[${ri}] even`,
        resultsEven[ri],
        expectedForNode(testValsEven, ri),
      );
    }

    // Odd branch (source[0] нечётный) — проверяем что динамические deps меняются
    const testValsOdd = [3, 1, 3, 5, 7, 11];
    for (let i = 0; i < SOURCES; i++) sources[i][1](testValsOdd[i]);
    const resultsOdd = readers.map((r) => r()); // материализуем + собираем
    for (let ri = 0; ri < readCount; ri++) {
      validate(
        `Dyn/20% reader[${ri}] odd`,
        resultsOdd[ri],
        expectedForNode(testValsOdd, ri),
      );
    }

    // Restore
    for (const s of sources) s[1](0);
    for (const r of readers) r();
    console.log(
      "✓ 25% Dynamic 100x15, 6 sources, read 20% — validation passed (both branches)",
    );

    let tick = 0;
    bench("25% Dynamic 100x15, 6 sources, read 20%", () => {
      for (const s of sources) s[1](tick);
      for (const r of readers) r();
      tick++;
    });
  }

  // ── 25% Dynamic 100x15, 6 sources (read 100%) ──────────────────────────
  {
    const NODES = 100;
    const DEPS = 15;
    const SOURCES = 6;
    const DYNAMIC_RATIO = 0.25;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));
    const dynamicCount = Math.floor(NODES * DYNAMIC_RATIO);

    const nodes = Array.from({ length: NODES }, (_, i) => {
      const isDynamic = i < dynamicCount;
      return computed(() => {
        let s = 0;
        if (isDynamic) {
          const v = sources[0][0]();
          if (v % 2 === 0) {
            for (let d = 0; d < DEPS; d++) s += sources[d % SOURCES][0]();
          } else {
            for (let d = DEPS - 1; d >= 0; d--) s += sources[d % SOURCES][0]();
          }
        } else {
          for (let d = 0; d < DEPS; d++) s += sources[(i + d) % SOURCES][0]();
        }
        return s;
      });
    });

    // прогрев
    for (const s of sources) s[1](0);
    for (const n of nodes) n();

    // ── Validation ────────────────────────────────────────────────────────
    const testVals = [4, 2, 6, 10, 14, 22]; // source[0]=4 (even)
    for (let i = 0; i < SOURCES; i++) sources[i][1](testVals[i]);
    const nodeResults = nodes.map((n) => n()); // материализуем + собираем

    const expectedForNode = (i: number): number => {
      const isDynamic = i < dynamicCount;
      let s = 0;
      if (isDynamic) {
        const v = testVals[0];
        if (v % 2 === 0) {
          for (let d = 0; d < DEPS; d++) s += testVals[d % SOURCES];
        } else {
          for (let d = DEPS - 1; d >= 0; d--) s += testVals[d % SOURCES];
        }
      } else {
        for (let d = 0; d < DEPS; d++) s += testVals[(i + d) % SOURCES];
      }
      return s;
    };

    for (let i = 0; i < NODES; i++) {
      validate(`Dyn/100% node[${i}]`, nodeResults[i], expectedForNode(i));
    }
    // Restore
    for (const s of sources) s[1](0);
    for (const n of nodes) n();
    console.log(
      "✓ 25% Dynamic 100x15, 6 sources (read 100%) — validation passed",
    );

    let tick = 0;
    bench("25% Dynamic 100x15, 6 sources", () => {
      for (const s of sources) s[1](tick);
      for (const n of nodes) n();
      tick++;
    });
  }
});
