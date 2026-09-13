import { describe, expect, it } from "vitest";
import {
  setExpect,
  testSuite,
  type ReactiveFramework,
} from "reactive-framework-test-suite";
import { computed, createRuntime, effect, signal, untracked } from "../src";

setExpect(expect);

type EffectStrategy = "flush" | "sab" | "eager";

const correctnessCases = [
  2, 3, 5, 6, 14, 16, 21, 61, 64, 108, 141, 145, 158, 159, 190, 191, 194, 195,
  196, 198, 199, 200, 204, 205, 206, 208, 211, 217, 221, 223,
];

const executionCases = [9, 10, 157, 188, 189, 193, 197, 220];

const upstreamCases = new Map(
  testSuite.flatMap((section) =>
    Object.entries(section.cases)
      .map(([name, run]) => {
        const id = Number(name.match(/^#(\d+)/)?.[1]);
        return Number.isNaN(id) ? [] : [[id, run] as const];
      })
      .flat(),
  ),
);

function createFramework(effectStrategy: EffectStrategy): ReactiveFramework {
  let runtime: ReturnType<typeof createRuntime> | undefined;
  let batchDepth = 0;

  const requireRuntime = () => {
    if (runtime === undefined) {
      throw new Error("Upstream operation called outside framework.run()");
    }
    return runtime;
  };

  const flushIfReady = () => {
    if (batchDepth === 0) {
      requireRuntime().flush();
    }
  };

  return {
    name: `@volynets/reflex (${effectStrategy})`,

    signal<T>(initialValue: T) {
      const value = signal(initialValue);

      return {
        read: value,

        write(next: T) {
          value.set(next);
          flushIfReady();
        },
      };
    },

    computed<T>(fn: () => T) {
      return {
        read: computed(fn),
      };
    },

    effect,
    untracked,

    run(fn) {
      runtime = createRuntime({ effectStrategy });
      batchDepth = 0;

      try {
        fn();
        runtime.flush();
      } finally {
        runtime = undefined;
        batchDepth = 0;
      }
    },

    batch(fn) {
      const activeRuntime = requireRuntime();

      batchDepth++;

      try {
        activeRuntime.batch(fn);
      } finally {
        batchDepth--;

        if (batchDepth === 0) {
          activeRuntime.flush();
        }
      }
    },
  };
}

function registerCases(
  framework: ReactiveFramework,
  ids: readonly number[],
): void {
  for (const id of ids) {
    const run = upstreamCases.get(id);

    if (run === undefined) {
      throw new Error(`Missing upstream test #${id}`);
    }

    it(`#${id}`, () => {
      framework.run(() => run(framework));
    });
  }
}

describe.each<EffectStrategy>(["flush", "sab", "eager"])(
  "Upstream gates - %s mode",
  (effectStrategy) => {
    const framework = createFramework(effectStrategy);

    describe("correctness", () => {
      registerCases(framework, correctnessCases);
    });

    describe("Reflex execution guarantees", () => {
      registerCases(framework, executionCases);
    });
  },
);
