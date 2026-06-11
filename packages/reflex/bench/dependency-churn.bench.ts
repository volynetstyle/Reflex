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
    id: "static_1024",
    label: "Static 1024",
    patterns: [range(DEPS)],
  },
  {
    id: "rotate_1024",
    label: "Rotate 1024",
    patterns: rotatePatterns(DEPS),
  },
  {
    id: "alt_ab_1024",
    label: "Alt A/B 1024",
    patterns: [range(DEPS), range(DEPS).reverse()],
  },
  {
    id: "swap_small_1024",
    label: "Swap Small 1024",
    patterns: Array.from({ length: DEPS }, (_, step) => {
      const pattern = range(DEPS);
      const first = (step * 17) % DEPS;
      const second = (first + 1 + (step % 7)) % DEPS;
      [pattern[first], pattern[second]] = [pattern[second]!, pattern[first]!];

      return pattern;
    }),
  },
  {
    id: "prefix_suffix_chaotic_1024",
    label: "Prefix/Suffix Chaotic 1024",
    patterns: prefixSuffixChaoticPatterns(DEPS),
  },
  {
    id: "mixed_1024",
    label: "Mixed 1024",
    patterns: Array.from({ length: DEPS }, (_, step) => {
      const phaseLength = 8;
      const phase = Math.floor(step / phaseLength);

      return Array.from(
        { length: DEPS },
        (__, index) => (index + phase * 13) % DEPS,
      );
    }),
  },
  {
    id: "branch_half_1024",
    label: "Branch Half 1024",
    patterns: branchHalfPatterns(DEPS),
  },
  {
    id: "stable_then_drop_1024",
    label: "Stable Then Drop 1024",
    patterns: stableThenDropPatterns(DEPS),
  },
  {
    id: "oscillate_rotate_branch_1024",
    label: "Oscillate Rotate/Branch 1024",
    patterns: oscillateRotateBranchPatterns(DEPS),
  },
  {
    id: "oscillate_rotate_swap_1024",
    label: "Oscillate Rotate/Swap 1024",
    patterns: oscillateRotateSwapPatterns(DEPS),
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

function range(length: number, start = 0): number[] {
  return Array.from({ length }, (_, index) => start + index);
}

function rotatePatterns(deps: number): number[][] {
  return Array.from({ length: deps }, (_, step) =>
    Array.from({ length: deps }, (__, index) => (index + step) % deps),
  );
}

function prefixSuffixChaoticPatterns(deps: number): number[][] {
  return Array.from({ length: deps }, (_, step) => {
    const pivot = 1 + ((step * 37) % (deps - 1));
    const prefix = range(pivot).reverse();
    const suffix = range(deps - pivot, pivot);

    return step % 2 === 0
      ? interleave(prefix, suffix, step)
      : interleave(suffix.reverse(), prefix, step);
  });
}

function branchHalfPatterns(deps: number): number[][] {
  const half = Math.floor(deps / 2);

  return [
    [...range(half), ...range(deps - half, deps)],
    [...range(half), ...range(deps - half, deps + half)],
  ];
}

function stableThenDropPatterns(deps: number): number[][] {
  const stable = range(deps);
  const retained = Math.floor(deps * 0.7);
  const dropped = deps - retained;
  const partial = [
    ...range(retained),
    ...Array.from({ length: dropped }, (_, index) => index % retained),
  ];

  return Array.from({ length: deps }, (_, step) =>
    step < Math.floor(deps * 0.75) ? stable : partial,
  );
}

function oscillateRotateBranchPatterns(deps: number): number[][] {
  const half = Math.floor(deps / 2);

  return Array.from({ length: deps }, (_, step) => {
    if (step % 2 === 0) {
      return Array.from({ length: deps }, (__, index) => (index + step) % deps);
    }

    return [
      ...range(half),
      ...range(deps - half, deps + ((step % 4) + 1) * half),
    ];
  });
}

function oscillateRotateSwapPatterns(deps: number): number[][] {
  return Array.from({ length: deps }, (_, step) => {
    if (step % 2 === 0) {
      return Array.from({ length: deps }, (__, index) => (index + step) % deps);
    }

    const pattern = range(deps);

    for (let swap = 0; swap < 4; swap += 1) {
      const first = (step * 19 + swap * 23) % deps;
      const second = (first + 1 + swap) % deps;
      [pattern[first], pattern[second]] = [pattern[second]!, pattern[first]!];
    }

    return pattern;
  });
}
