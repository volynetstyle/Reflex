import {
  blackhole,
  type BenchHarness,
  type BenchVariant,
  HarnessMetrics,
  registerBenchFile,
  type WriteInput,
} from "./shared";

import * as SolidSignalsModule from "../../@volynets/reflex-runtime/node_modules/@solidjs/signals/dist/prod.js";

const {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  getOwner,
  runWithOwner,
} = SolidSignalsModule as {
  createEffect(
    compute: () => number,
    effectFn: (value: number) => void,
  ): void;
  createMemo(compute: () => number): () => number;
  createRoot<T>(init: (dispose: () => void) => T): T;
  createSignal(
    initial: number,
  ): [read: () => number, write: (value: WriteInput) => number];
  flush(): void;
  getOwner(): unknown;
  runWithOwner<T>(owner: unknown, fn: () => T): T;
};

class SolidHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly owner: unknown;
  private readonly disposeRoot: () => void;

  constructor() {
    let capturedOwner: unknown;
    let capturedDispose = () => {};

    createRoot((dispose) => {
      capturedDispose = dispose;
      capturedOwner = getOwner();
      return undefined;
    });

    if (capturedOwner === undefined) {
      throw new Error("Solid owner was not created for benchmark harness");
    }

    this.owner = capturedOwner;
    this.disposeRoot = capturedDispose;
  }

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => number] {
    this.metrics.recordSetupAllocation();

    const pair = this.withOwner(() => createSignal(initial));
    const [read, write] = pair;

    return [
      read,
      (value) => {
        this.metrics.recordSchedulerOp();
        return write(value);
      },
    ] as const;
  }

  memo(fn: () => number, _label?: string): () => number {
    this.metrics.recordSetupAllocation();

    const accessor = this.withOwner(() =>
      createMemo(() => {
        this.metrics.recordRecompute();
        return fn();
      }),
    );

    return () => {
      this.metrics.recordRefresh();
      return accessor();
    };
  }

  effect(read: () => number, _meta?: { label?: string; priority?: number }): () => void {
    this.metrics.recordSetupAllocation();

    this.withOwner(() =>
      createEffect(
        () => {
          this.metrics.recordRecompute();
          return read();
        },
        (value) => {
          this.metrics.recordEffectRun();
          blackhole(value);
        },
      ),
    );

    return () => {};
  }

  batch<T>(fn: () => T): T {
    return fn();
  }

  flush(): void {
    this.metrics.recordSchedulerOp();
    flush();
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
    this.disposeRoot();
  }

  private withOwner<T>(fn: () => T): T {
    return runWithOwner(this.owner, fn);
  }
}

const variants: readonly BenchVariant[] = [
  {
    label: "solid-signals",
    createHarness: () => new SolidHarness(),
  },
];

registerBenchFile("solid", variants);
