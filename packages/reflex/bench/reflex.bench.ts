import {
  blackhole,
  type BenchHarness,
  type BenchVariant,
  HarnessMetrics,
  registerBenchFile,
  type WriteInput,
} from "./shared";

import { createScopedRuntime } from "../dist/esm/index";

class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly runtime = createScopedRuntime({ effectStrategy: "ranked" });

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    return this.runtime.signal(initial) as readonly [
      () => number,
      (value: WriteInput) => void,
    ];
  }

  memo(fn: () => number, _label?: string): () => number {
    return this.runtime.memo(fn);
  }

  effect(
    read: () => number,
    _meta?: { label?: string; priority?: number },
  ): () => void {
    return this.runtime.effect(() => {
      blackhole(read());
    });
  }

  batch<T>(fn: () => T): T {
    return this.runtime.batch(fn);
  }

  // Called explicitly by shared.ts after batch() in runStep — batch already
  // flushes on exit, so this is a no-op most of the time (queue empty).
  // Kept for correctness: non-batched scenarios call flush() directly.
  flush(): void {
    this.runtime.flush();
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
    this.runtime.dispose();
  }
}

const variants: readonly BenchVariant[] = [
  { label: "reflex-signals", createHarness: () => new ReflexHarness() },
];

registerBenchFile("reflex", variants);
