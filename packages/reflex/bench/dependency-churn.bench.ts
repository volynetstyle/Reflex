import { bench, describe } from "vitest";
import { performance } from "node:perf_hooks";
import { memo, signal } from "../dist/esm/index.js";

const DEPS = 1_024;
const STEPS = 512;

type SignalCell = {
  get(): number;
  set(value: number): void;
};

type Scenario = {
  id: string;
  label: string;
  patterns: number[][];
};

const scenarios: Scenario[] = [
  {
    id: "rotate_1024",
    label: "Rotate 1024",
    patterns: Array.from({ length: DEPS }, (_, step) =>
      Array.from({ length: DEPS }, (__, index) => (index + step) % DEPS),
    ),
  },
  {
    id: "branch_swap_1024",
    label: "Branch Swap 1024",
    patterns: [
      Array.from({ length: DEPS }, (_, index) => index),
      Array.from({ length: DEPS }, (_, index) => index + DEPS),
    ],
  },
  {
    id: "mixed_churn_1024",
    label: "Mixed Churn 1024",
    patterns: Array.from({ length: DEPS }, (_, step) => {
      const retained = Math.floor(DEPS * 0.7);
      const churned = DEPS - retained;
      const stable = Array.from(
        { length: retained },
        (__, index) => (index + step) % retained,
      );
      const moving = Array.from(
        { length: churned },
        (__, index) => retained + ((step * churned + index) % DEPS),
      );

      return interleave(stable, moving, step);
    }),
  },
];

describe("dependency churn", () => {
  for (const scenario of scenarios) {
    bench(
      scenario.label,
      () => {
        measureScenario(scenario.patterns);
      },
      {
        iterations: 30,
        warmupIterations: 10,
      },
    );
  }
});

function measureScenario(patterns: number[][]): number {
  const selector = createSignalCell(0);
  const sources = Array.from({ length: DEPS * 2 }, (_, index) =>
    createSignalCell(index),
  );
  const total = memo(() => sumPattern(patterns[selector.get()]!, sources));
  let sink = 0;
  const start = performance.now();

  for (let step = 0; step < STEPS; step += 1) {
    selector.set(step % patterns.length);
    sink += total();
  }

  const elapsedMs = performance.now() - start;

  if (!Number.isFinite(sink)) {
    throw new Error("Benchmark produced a non-finite sink value.");
  }

  return elapsedMs;
}

function sumPattern(pattern: number[], sources: SignalCell[]): number {
  let total = 0;

  for (const sourceIndex of pattern) {
    total += sources[sourceIndex]!.get();
  }

  return total;
}

function createSignalCell(initial: number): SignalCell {
  const value = signal(initial);

  if (Array.isArray(value)) {
    const [get, set] = value;
    return { get, set };
  }

  return {
    get: value,
    set(next) {
      value(next);
    },
  };
}

function interleave(left: number[], right: number[], offset: number): number[] {
  const output: number[] = [];
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    if ((index + offset) % 3 === 0) {
      if (right[index] !== undefined) output.push(right[index]);
      if (left[index] !== undefined) output.push(left[index]);
    } else {
      if (left[index] !== undefined) output.push(left[index]);
      if (right[index] !== undefined) output.push(right[index]);
    }
  }

  return output;
}
