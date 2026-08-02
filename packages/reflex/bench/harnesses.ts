import {
  blackhole,
  type BenchHarness,
  type BenchVariant,
  HarnessMetrics,
  type WriteInput,
} from "./shared";

import { createRuntime, batch, flush, effect, memo, signal } from "../dist/esm";
import {
  readRuntimeProfileCounters,
  readSchedulerPolicyCounters,
  resetRuntimeProfileCounters,
  resetSchedulerPolicyCounters,
  setRuntimeProfilingEnabled,
  setSchedulerPolicyCountersEnabled,
} from "../dist/esm/debug/index.js";

export class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly disposers: Array<() => void> = [];

  constructor() {
    createRuntime({ effectStrategy: "flush" });
  }

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

  resetPolicyCounters(): void {
    resetSchedulerPolicyCounters();
  }

  setPolicyCountersEnabled(enabled: boolean): void {
    setSchedulerPolicyCountersEnabled(enabled);
  }

  readPolicyCounters() {
    return readSchedulerPolicyCounters();
  }

  resetRuntimeProfileCounters(): void {
    resetRuntimeProfileCounters();
  }

  setRuntimeProfilingEnabled(enabled: boolean): void {
    setRuntimeProfilingEnabled(enabled);
  }

  readRuntimeProfileCounters() {
    return readRuntimeProfileCounters();
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
