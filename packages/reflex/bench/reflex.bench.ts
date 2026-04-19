import {
  blackhole,
  type BenchHarness,
  type BenchVariant,
  HarnessMetrics,
  registerBenchFile,
  type WriteInput,
} from "./shared";

import { createRuntime, batch, flush, effect, memo, signal } from "../dist/esm";

createRuntime({ effectStrategy: "ranked" });

class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();

  constructor() {}

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
    return effect(read);
  }

  batch<T>(fn: () => T): T {
    return batch(fn);
  }

  // Called explicitly by shared.ts after batch() in runStep — batch already
  // flushes on exit, so this is a no-op most of the time (queue empty).
  // Kept for correctness: non-batched scenarios call flush() directly.
  flush(): void {
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

  dispose(): void {}
}

const variants: readonly BenchVariant[] = [
  { label: "reflex-signals", createHarness: () => new ReflexHarness() },
];

registerBenchFile("reflex", variants);
