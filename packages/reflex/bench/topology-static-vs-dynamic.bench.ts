import { afterAll, bench, describe } from "vitest";

import {
  batch,
  computed,
  createRuntime,
  effect,
  flush,
  signal,
} from "../src/unstable";

const DEPTH = 64;
const WARMUP_ITERATIONS = 1_000;
const ITERATIONS = 10_000;

type BenchCase = {
  step(): void;
  dispose(): void;
  read(): number;
};

let sink = 0;

function blackhole(value: number): void {
  sink = (Math.imul(sink, 100_019) + (value | 0)) | 0;
}

function createStaticTopologyCase(): BenchCase {
  createRuntime({ effectStrategy: "flush" });

  const [left, setLeft] = signal(0);
  let current = computed(() => left());

  for (let depth = 0; depth < DEPTH; depth++) {
    const previous = current;
    current = computed(() => previous() + 1);
  }

  const dispose = effect(() => {
    blackhole(current());
  });

  let next = 0;

  return {
    step() {
      batch(() => {
        setLeft(++next);
      });
      flush();
    },
    read() {
      return current();
    },
    dispose,
  };
}

function createDynamicTopologyCase(): BenchCase {
  createRuntime({ effectStrategy: "flush" });

  const [flag, setFlag] = signal(true);
  const [left, setLeft] = signal(0);
  const [right, setRight] = signal(0);
  let current = computed(() => (flag() ? left() : right()));

  for (let depth = 0; depth < DEPTH; depth++) {
    const previous = current;
    current = computed(() => previous() + 1);
  }

  const dispose = effect(() => {
    blackhole(current());
  });

  let next = 0;
  let branch = true;

  return {
    step() {
      branch = !branch;
      batch(() => {
        setFlag(branch);
        if (branch) setLeft(++next);
        else setRight(++next);
      });
      flush();
    },
    read() {
      return current();
    },
    dispose,
  };
}

function validateCase(label: string, factory: () => BenchCase): void {
  const instance = factory();

  try {
    for (let i = 0; i < 8; i++) {
      instance.step();

      const expected = i + 1 + DEPTH;
      const actual = instance.read();

      if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
      }
    }
  } finally {
    instance.dispose();
  }
}

function registerCase(label: string, factory: () => BenchCase): void {
  let instance: BenchCase | null = null;

  describe(label, () => {
    afterAll(() => {
      instance?.dispose();
      instance = null;
    });

    bench(
      "update + flush",
      () => {
        instance ??= factory();
        instance.step();
      },
      {
        warmupIterations: WARMUP_ITERATIONS,
        iterations: ITERATIONS,
      },
    );
  });
}

validateCase("static topology", createStaticTopologyCase);
validateCase("dynamic topology", createDynamicTopologyCase);

registerCase("topology | static dependency chain", createStaticTopologyCase);
registerCase("topology | dynamic branch dependency chain", createDynamicTopologyCase);
