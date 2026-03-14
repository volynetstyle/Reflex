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

function createWideGraph(
  nodesCount: number,
  depsPerNode: number,
  sourceCount: number
) {
  const sources = Array.from({ length: sourceCount }, () => signal(0));
  const nodes = Array.from({ length: nodesCount }, (_, i) =>
    computed(() => {
      let sum = 0;
      for (let d = 0; d < depsPerNode; d++) {
        sum += sources[(i + d) % sourceCount][0]();
      }
      return sum;
    })
  );

  // warm-up
  sources.forEach(([, set]) => set(0));
  nodes.forEach(n => n());           // full cold start

  return { sources, nodes };
}

function createDeepChains(
  chainCount: number,
  depth: number,
  sourceCount: number
) {
  const sources = Array.from({ length: sourceCount }, () => signal(0));
  const ends: Array<() => number> = [];

  for (let c = 0; c < chainCount; c++) {
    let prev = sources[c % sourceCount][0];
    for (let d = 0; d < depth; d++) {
      const p = prev;
      prev = computed(() => p() as number);
    }
    ends.push(prev);
  }

  // warm-up
  sources.forEach(([, s]) => s(0));
  ends.forEach(e => e());

  return { sources, ends };
}

function createSquareFanIn(
  layers: number,
  width: number,
  sourceCount: number,
  readRatio = 0.25
) {
  const sources = Array.from({ length: sourceCount }, () => signal(0));

  let prevLayer = sources.map(s => s[0]);

  for (let l = 1; l < layers; l++) {
    const current = prevLayer;
    prevLayer = Array.from({ length: width }, () =>
      computed(() => {
        let sum = 0;
        for (const fn of current) sum += fn() as number;
        return sum;
      })
    );
  }

  const lastLayer = prevLayer;
  const readCount = Math.max(1, Math.round(width * readRatio));
  const readers = lastLayer.slice(0, readCount);

  // warm-up
  sources.forEach(([, s]) => s(0));
  readers.forEach(r => r());

  return { sources, readers, readCount };
}

function createDynamicGraph(
  nodeCount: number,
  deps: number,
  sourcesCount: number,
  dynamicRatio = 0.25,
  readRatio = 0.3
) {
  const sources = Array.from({ length: sourcesCount }, () => signal(0));
  const dynamicCount = Math.floor(nodeCount * dynamicRatio);

  const nodes = Array.from({ length: nodeCount }, (_, i) => {
    const isDynamic = i < dynamicCount;
    return computed(() => {
      let sum = 0;
      if (isDynamic) {
        const v = sources[0][0]();
        const forward = v % 2 === 0;
        for (let d = 0; d < deps; d++) {
          const idx = forward ? d : deps - 1 - d;
          sum += sources[idx % sourcesCount][0]();
        }
      } else {
        for (let d = 0; d < deps; d++) {
          sum += sources[(i + d) % sourcesCount][0]();
        }
      }
      return sum;
    });
  });

  // warm-up
  sources.forEach(([, s]) => s(0));
  nodes.forEach(n => n());

  const readCount = Math.max(1, Math.round(nodeCount * readRatio));
  const readers = nodes.slice(0, readCount);

  return { sources, readers, readCount, nodes };
}

// ── Benchmarks ─────────────────────────────────────────────────────────────

describe("Wide fan-out graphs", () => {
  bench("wide 1000 nodes × 5 deps, 2 sources, read ~10%", () => {
    const { sources, nodes } = createWideGraph(1000, 5, 2);
    let tick = 0;
    return () => {
      sources[tick % 2][1](tick);
      // реалистично — читаем ~10%
      for (let i = 0; i < nodes.length; i += 10) nodes[i]();
      tick++;
    };
  });

  bench("wide 1000 nodes × 5 deps, 25 sources, read ~8%", () => {
    const { sources, nodes } = createWideGraph(1000, 5, 25);
    let tick = 0;
    return () => {
      const srcIdx = tick % 25;
      sources[srcIdx][1](tick * 7 + srcIdx);
      for (let i = 0; i < nodes.length; i += 12) nodes[i]();
      tick++;
    };
  });
});

describe("Deep propagation chains", () => {
  bench("deep 12 chains × 400 depth, change 1 source → read ends", () => {
    const { sources, ends } = createDeepChains(12, 400, 4);
    let tick = 0;
    return () => {
      sources[1][1](tick);           // меняем только один источник
      ends.forEach(e => e());        // читаем все концы цепочек
      tick++;
    };
  });
});

describe("Fan-in / diamond graphs (many-to-one)", () => {
  bench("square 12×12 layers, 4 sources, read ~25% last layer", () => {
    const { sources, readers } = createSquareFanIn(12, 12, 4, 0.25);
    let tick = 0;
    return () => {
      sources.forEach(([, set], i) => set(tick + i * 11));
      readers.forEach(r => r());
      tick++;
    };
  });
});

describe("Mixed static + dynamic deps", () => {
  bench("dynamic 120 nodes, 25% dynamic, 15 deps, 8 sources, read ~30%", () => {
    const { sources, readers } = createDynamicGraph(120, 15, 8, 0.25, 0.30);
    let tick = 0;
    return () => {
      sources.forEach(([, set]) => set(tick));
      readers.forEach(r => r());
      tick++;
    };
  });

  // worst-case: читаем почти всё после каждого изменения
  bench("dynamic 120 nodes, 25% dynamic — worst case read 100%", () => {
    const { sources, nodes } = createDynamicGraph(120, 15, 8, 0.25, 1);
    let tick = 0;
    return () => {
      sources.forEach(([, set]) => set(tick));
      nodes.forEach(n => n());
      tick++;
    };
  });
});