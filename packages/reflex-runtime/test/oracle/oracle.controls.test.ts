import { describe, expect, it } from "vitest";
import * as source from "../../src/internal";
import { family } from "./families";
import {
  classifyTraceDifference,
  firstMismatch,
  interpret,
  type Node,
  type ObservationLevel,
  type RuntimeModule,
} from "./program";
import { judge, VERDICT_POLICIES } from "./verdict";

/**
 * Negative controls of the program oracle. An A/A run (self.aa-control) shows
 * that the engine reproduces; only an A/B run against a candidate that is
 * wrong in a known way shows that it can fail. Each control wraps the source
 * runtime so that it is wrong in exactly one observable class, and every
 * policy must reject it: no accepted difference class may swallow a wrong
 * value, error, cleanup, run or edge.
 */
const base = source as unknown as RuntimeModule;

function wrap(overrides: Partial<RuntimeModule>): RuntimeModule {
  return Object.create(base, {
    ...Object.fromEntries(
      Object.entries(overrides).map(([key, value]) => [key, { value }]),
    ),
    // A live binding of the module, read at every access.
    currentConsumer: { get: () => base.currentConsumer },
  }) as RuntimeModule;
}

const topLevel = () => base.currentConsumer === null;

const controls: ReadonlyArray<{
  name: string;
  candidate: () => RuntimeModule;
  /** Entry kinds of which the first mismatch must show one on a side. */
  entries: readonly string[];
  /** A family whose programs reach the class (default: default). */
  family?: string;
}> = [
  {
    name: "a wrong value",
    entries: ["read:"],
    candidate: () =>
      wrap({
        readConsumer(node: Node, mode?: number) {
          const value = base.readConsumer(node, mode);
          return topLevel() && typeof value === "number" ? value + 1 : value;
        },
      }),
  },
  {
    name: "a spurious error",
    entries: ["err:"],
    candidate: () => {
      let calls = 0;
      return wrap({
        readConsumer(node: Node, mode?: number) {
          if (topLevel() && ++calls === 1) throw new Error("control");
          return base.readConsumer(node, mode);
        },
      });
    },
  },
  {
    name: "a lost cleanup",
    entries: ["cl:", "snap:"],
    // The first default seeds generate no cleanup (see program.ts prng).
    family: "hub",
    candidate: () =>
      wrap({
        createWatcher(compute: () => unknown) {
          return base.createWatcher(() => {
            compute();
          });
        },
      }),
  },
  {
    name: "a skipped watcher run",
    // The watcher's validation pulls its computeds before `w:`.
    entries: ["w:", "c:", "cl:", "snap:"],
    candidate: () => {
      let calls = 0;
      return wrap({
        runWatcher(node: Node) {
          if (++calls % 3 !== 0) base.runWatcher(node);
        },
      });
    },
  },
  {
    name: "an extra edge (graph content, not order)",
    entries: ["snap:", "tail:"],
    candidate: () => {
      let first: Node | undefined;
      return wrap({
        createProducer(value: unknown) {
          const node = base.createProducer(value);
          first ??= node;
          return node;
        },
        createConsumer(compute: () => unknown) {
          return base.createConsumer(() => {
            if (first !== undefined) base.readProducer(first);
            return compute();
          });
        },
      });
    },
  },
];

const levels: readonly ObservationLevel[] = ["strict", "observable"];

describe("oracle negative controls", () => {
  for (const control of controls) {
    it(`rejects ${control.name} under every policy`, () => {
      const generate = family(control.family ?? "default").generate;
      let checked = 0;

      for (let seed = 1; seed <= 400 && checked < 5; seed++) {
        const program = generate(seed);
        const candidate = control.candidate();
        const reference = interpret(base, program, "strict");
        const actual = interpret(candidate, program, "strict");
        const mismatch = firstMismatch(reference, actual);
        if (mismatch === null) continue;
        checked++;

        expect(
          [mismatch.baseline, mismatch.candidate].some((side) =>
            control.entries.some((entry) => side?.startsWith(entry)),
          ),
          `seed ${seed}: ${mismatch.baseline} / ${mismatch.candidate}`,
        ).toBe(true);
        for (const level of levels)
          for (const policy of VERDICT_POLICIES)
            expect(
              judge(base, control.candidate(), program, level, policy).kind,
              `seed ${seed} ${level} ${policy}`,
            ).toBe("divergent");
      }

      // A control that never changes a trace controls nothing.
      expect(checked).toBe(5);
    });
  }

  it("accepts a permuted adjacency list only as list-order, and a dropped edge as semantic", () => {
    let trace: string[] | undefined;
    for (let seed = 1; trace === undefined; seed++) {
      const candidate = interpret(base, family("default").generate(seed));
      if (candidate.some((entry) => /in\[\d+,\d+/.test(entry)))
        trace = candidate;
    }
    const at = trace.findIndex((entry) => /in\[\d+,\d+/.test(entry));
    const edit = (replace: (list: string[]) => string[]) =>
      trace.map((entry, index) =>
        index !== at
          ? entry
          : entry.replace(
              /in\[([\d,]+)\]/,
              (_, list: string) => `in[${replace(list.split(",")).join(",")}]`,
            ),
      );

    expect(classifyTraceDifference(trace, trace)).toBe("identical");
    expect(
      classifyTraceDifference(
        trace,
        edit((list) => [...list].reverse()),
      ),
    ).toBe("list-order");
    expect(
      classifyTraceDifference(
        trace,
        edit((list) => list.slice(1)),
      ),
    ).toBe("semantic");
  });
});
