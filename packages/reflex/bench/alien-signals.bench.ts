import {
  blackhole,
  type BenchHarness,
  type BenchVariant,
  HarnessMetrics,
  registerBenchFile,
  type WriteInput,
} from "./shared";

import * as AlienSignalsModule from "../../reflex-runtime/node_modules/alien-signals/esm/index.mjs";

type AlienSignal = {
  (): number;
  (value: number): void;
};

const {
  computed,
  effect,
  endBatch,
  signal,
  startBatch,
} = AlienSignalsModule as {
  computed(getter: () => number): () => number;
  effect(fn: () => void): () => void;
  endBatch(): void;
  signal(initial: number): AlienSignal;
  startBatch(): void;
};

class AlienHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly disposers: Array<() => void> = [];

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    this.metrics.recordSetupAllocation();

    const state = signal(initial);

    if (!this.metrics.enabled) {
      return [
        () => state(),
        (value) => {
          const next = typeof value === "function" ? value(state()) : value;
          state(next);
        },
      ] as const;
    }

    return [
      () => state(),
      (value) => {
        this.metrics.recordSchedulerOp();
        const next = typeof value === "function" ? value(state()) : value;
        state(next);
      },
    ] as const;
  }

  memo(fn: () => number, _label?: string): () => number {
    this.metrics.recordSetupAllocation();

    const accessor = this.metrics.enabled
      ? computed(() => {
          this.metrics.recordRecompute();
          return fn();
        })
      : computed(fn);

    return this.metrics.enabled
      ? () => {
          this.metrics.recordRefresh();
          return accessor();
        }
      : accessor;
  }

  effect(read: () => number, _meta?: { label?: string; priority?: number }): () => void {
    this.metrics.recordSetupAllocation();

    const dispose = this.metrics.enabled
      ? effect(() => {
          this.metrics.recordRecompute();
          this.metrics.recordEffectRun();
          blackhole(read());
        })
      : effect(() => {
          blackhole(read());
        });

    this.disposers.push(dispose);
    return dispose;
  }

  batch<T>(fn: () => T): T {
    if (!this.metrics.enabled) {
      startBatch();
      try {
        return fn();
      } finally {
        endBatch();
      }
    }

    this.metrics.recordSchedulerOp();
    startBatch();

    try {
      return fn();
    } finally {
      endBatch();
      this.metrics.recordSchedulerOp();
    }
  }

  flush(): void {
    startBatch();

    try {
     
    } finally {
      endBatch();
    }
  }

  resetRunMetrics(): void {
    this.metrics.resetRunMetrics();
  }

  beginStep(): void {
    this.metrics.beginStep();
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

const variants: readonly BenchVariant[] = [
  {
    label: "alien-signals",
    createHarness: () => new AlienHarness(),
  },
];

registerBenchFile("alien", variants);
