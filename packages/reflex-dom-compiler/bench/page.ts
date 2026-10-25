/**
 * Runs inside the benchmark page. Bundled with reflex-dom built from source in
 * production mode; scenario modules arrive as function bodies so each "cold"
 * sample can evaluate a fresh copy (fresh, unprepared templates).
 */
import * as dom from "@volynets/reflex-dom";
import { render } from "@volynets/reflex-dom";
import * as jsxRuntime from "@volynets/reflex-dom/jsx-runtime";
import * as compilerRuntime from "../src/runtime";

const MODULES: Record<string, unknown> = {
  "@volynets/reflex-dom": dom,
  "@volynets/reflex-dom/jsx-runtime": jsxRuntime,
  "@volynets/reflex-dom-compiler/runtime": compilerRuntime,
};

/** A scenario entry: renders one For row per key into the container. */
type App = (container: Element, keys: readonly number[]) => () => void;

function evaluate(body: string): App {
  const exports: Record<string, unknown> = {};
  new Function("__require", "__exports", body)((name: string) => MODULES[name], exports);
  return exports.default as App;
}

const keysCache = new Map<number, number[]>();
/** Row keys, built outside every timed section. */
function keysFor(count: number): number[] {
  let keys = keysCache.get(count);
  if (keys === undefined) {
    keys = Array.from({ length: count }, (_, index) => index);
    keysCache.set(count, keys);
  }
  return keys;
}

export interface BenchInput {
  scenarios: { name: string; nodes: number; variants: Record<string, string> }[];
  counts: number[];
  samples: number;
  coldBatch: number;
  memoryCount: number;
  memoryRounds: number;
}

export interface Measurement {
  scenario: string;
  variant: string;
  metric: string;
  count: number;
  /** Median microseconds per mounted instance. */
  usPerInstance: number;
  samples: number[];
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1]!;
};

function containers(n: number): HTMLElement[] {
  return Array.from({ length: n }, () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    return container;
  });
}

function clear(list: HTMLElement[], disposers: (() => void)[]) {
  for (const dispose of disposers) dispose();
  for (const container of list) container.remove();
}

/** Mount `count` instances per render, `batch` renders per timed block. */
function timeMount(app: App, count: number, withDispose: boolean): number {
  const batch = Math.max(1, Math.round(4000 / count));
  const targets = containers(batch);
  const disposers: (() => void)[] = [];
  const keys = keysFor(count);

  const start = performance.now();
  for (let b = 0; b < batch; b++) disposers.push(app(targets[b]!, keys));
  if (withDispose) for (const dispose of disposers) dispose();
  const elapsed = performance.now() - start;

  clear(targets, withDispose ? [] : disposers);
  return (elapsed * 1000) / (batch * count);
}

/** First mount of freshly evaluated modules: includes template preparation. */
function timeCold(body: string, batch: number): number {
  const apps = Array.from({ length: batch }, () => evaluate(body));
  const targets = containers(batch);
  const disposers: (() => void)[] = [];
  const start = performance.now();
  const one = keysFor(1);
  for (let i = 0; i < batch; i++) disposers.push(apps[i]!(targets[i]!, one));
  const elapsed = performance.now() - start;
  clear(targets, disposers);
  return (elapsed * 1000) / batch;
}

declare const gc: (() => void) | undefined;

function heap(): number | null {
  const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
  if (typeof gc !== "function" || memory === undefined) return null;
  gc();
  gc();
  return memory.usedJSHeapSize;
}

function shuffle<T>(values: T[]): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}

export function run(input: BenchInput) {
  const results: Measurement[] = [];
  const apps = new Map<string, App>();
  const variants = Object.keys(input.scenarios[0]!.variants);

  for (const scenario of input.scenarios) {
    for (const variant of variants) {
      const app = evaluate(scenario.variants[variant]!);
      apps.set(`${scenario.name}/${variant}`, app);
      for (let i = 0; i < 3; i++) timeMount(app, 100, true); // warm up
    }
  }

  const record = (scenario: string, variant: string, metric: string, count: number, samples: number[]) =>
    results.push({ scenario, variant, metric, count, usPerInstance: median(samples), samples });

  for (const scenario of input.scenarios) {
    // Variants interleave within every sample to spread drift evenly.
    const cold = new Map<string, number[]>(variants.map((v) => [v, []]));
    for (let s = 0; s < input.samples; s++) {
      for (const variant of shuffle([...variants])) {
        cold.get(variant)!.push(timeCold(scenario.variants[variant]!, input.coldBatch));
      }
    }
    for (const variant of variants) record(scenario.name, variant, "cold", 1, cold.get(variant)!);

    for (const metric of ["mount", "mount+dispose"] as const) {
      for (const count of input.counts) {
        const samples = new Map<string, number[]>(variants.map((v) => [v, []]));
        for (let s = 0; s < input.samples; s++) {
          for (const variant of shuffle([...variants])) {
            samples.get(variant)!.push(
              timeMount(apps.get(`${scenario.name}/${variant}`)!, count, metric === "mount+dispose"),
            );
          }
        }
        for (const variant of variants) record(scenario.name, variant, metric, count, samples.get(variant)!);
      }
    }
  }

  const resolution = (() => {
    let min = Infinity;
    for (let i = 0; i < 1000; i++) {
      const a = performance.now();
      let b = performance.now();
      while (b === a) b = performance.now();
      min = Math.min(min, b - a);
    }
    return min * 1000;
  })();

  return { results, timerResolutionUs: resolution, userAgent: navigator.userAgent };
}

/**
 * Retained heap in a fresh page (Chromium with --expose-gc only): median over
 * rounds of the heap delta while `count` instances are mounted, and of what
 * remains after dispose.
 */
export function memory(body: string, count: number, rounds: number) {
  if (heap() === null) return null;
  const app = evaluate(body);
  timeMount(app, 100, true); // prepare templates and warm the code paths
  const keys = keysFor(count); // allocated before the first measurement
  const retained: number[] = [];
  const residual: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const before = heap()!;
    const [target] = containers(1);
    const dispose = app(target!, keys);
    const mounted = heap()!;
    dispose();
    target!.remove();
    const after = heap()!;
    retained.push((mounted - before) / count);
    residual.push(after - before);
  }
  return { retainedBytesPerInstance: median(retained), residualBytes: median(residual), residualByRound: residual };
}

/**
 * Attribution probe for residual heap growth: nodes built by plain DOM code,
 * mounted and disposed through `render` as Node renderables. Returns the heap
 * growth per round (bytes).
 */
export function memoryProbe(count: number, rounds: number, throughRender: boolean) {
  if (heap() === null) return null;
  const build = () => {
    const root = document.createElement("div");
    for (let i = 0; i < 10; i++) {
      const child = document.createElement("span");
      child.textContent = "x";
      root.append(child);
    }
    return root;
  };
  const growth: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const before = heap()!;
    const [target] = containers(1);
    let list: Node[] | null = Array.from({ length: count }, build);
    if (throughRender) render(list as never, target!)();
    else {
      target!.append(...list);
      target!.textContent = "";
    }
    list = null;
    target!.remove();
    growth.push(heap()! - before);
  }
  return growth;
}

(globalThis as { __bench?: unknown }).__bench = { run, memory, memoryProbe };
