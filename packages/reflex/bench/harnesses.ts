import {
  type BenchHarness,
  type BenchSignal,
  type BenchVariant,
} from "./shared";

import { createRuntime, batch, flush, effect, memo, signal } from "../dist/esm";

export class ReflexHarness implements BenchHarness {
  private readonly disposers: Array<() => void> = [];

  constructor() {
    createRuntime({ effectStrategy: "flush" });
  }

  signal(initial: number, _label?: string): BenchSignal {
    return signal(initial);
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
