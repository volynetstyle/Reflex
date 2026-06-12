import {
  blackhole,
  type BenchHarness,
  type BenchVariant,
  HarnessMetrics,
  type WriteInput,
} from "./shared";

import * as AlienSignalsModule from "../../reflex-runtime/node_modules/alien-signals/esm/index.mjs";
import { createRuntime, batch, flush, effect, memo, signal } from "../dist/esm";

createRuntime({ effectStrategy: "flush" });

export class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly disposers: Array<() => void> = [];

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    return signal(initial) as any;
  }

  memo(fn: () => number, _label?: string): () => number {
    return memo(fn);
  }

  effect(
    read: () => number,
    _meta?: { label?: string; priority?: number },
  ): () => void {
    const dispose = effect(read);
    this.disposers.push(dispose);
    return dispose;
  }

  batch<T>(fn: () => T): T {
    return batch(fn);
  }

  flush(): void {
    flush();
  }

  resetRunMetrics(): void {
    this.metrics.resetRunMetrics();
  }

  beginStep(now: number): void {
    this.metrics.beginStep(now);
  }

  endStep(wallTimeMs: number) {
    return this.metrics.endStep(wallTimeMs);
  }

  dispose(): void {
    for (let index = this.disposers.length - 1; index >= 0; --index) {
      this.disposers[index]!();
    }
    this.disposers.length = 0;
  }
}

type AlienSignal = {
  (): number;
  (value: number): void;
};

const {
  computed,
  effect: alienEffect,
  endBatch,
  signal: alienSignal,
  startBatch,
} = AlienSignalsModule as {
  computed(getter: () => number): () => number;
  effect(fn: () => void): () => void;
  endBatch(): void;
  signal(initial: number): AlienSignal;
  startBatch(): void;
};

export class AlienHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly disposers: Array<() => void> = [];

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    this.metrics.recordSetupAllocation();
    const state = alienSignal(initial);
    const read = (): number => state();
    const write = (value: WriteInput): void => {
      const next = typeof value === "function" ? value(state()) : value;
      state(next);
    };

    return [read, write] as const;
  }

  memo(fn: () => number, _label?: string): () => number {
    this.metrics.recordSetupAllocation();
    const accessor = computed(() => {
      this.metrics.recordRecompute();
      return fn();
    });

    return () => {
      this.metrics.recordRefresh();
      return accessor();
    };
  }

  effect(
    read: () => number,
    _meta?: { label?: string; priority?: number },
  ): () => void {
    this.metrics.recordSetupAllocation();
    const dispose = alienEffect(() => {
      this.metrics.recordRecompute();
      this.metrics.recordEffectRun();
      blackhole(read());
    });

    this.disposers.push(dispose);
    return dispose;
  }

  batch<T>(fn: () => T): T {
    startBatch();
    try {
      return fn();
    } finally {
      endBatch();
    }
  }

  flush(): void {}

  resetRunMetrics(): void {
    this.metrics.resetRunMetrics();
  }

  beginStep(now: number): void {
    this.metrics.beginStep(now);
  }

  endStep(wallTimeMs: number) {
    return this.metrics.endStep(wallTimeMs);
  }

  dispose(): void {
    for (let index = this.disposers.length - 1; index >= 0; --index) {
      this.disposers[index]!();
    }
    this.disposers.length = 0;
  }
}

export const reflexVariant: BenchVariant = {
  label: "reflex-signals",
  createHarness: () => new ReflexHarness(),
};

export const alienVariant: BenchVariant = {
  label: "alien-signals",
  createHarness: () => new AlienHarness(),
};
