import { describe, it } from "vitest";
import fc from "fast-check";
import { events, runTrace } from "./async.contract-harness";
import type { Seed, Strategy } from "./async.contract-harness";

describe("async history differential properties", () => {
  describe.each<Strategy>(["flush", "sab", "eager"])("%s scheduling", (strategy) => {
    it.each<Seed>(["absent", "value", "undefined"])(
      "%s: 4–6 event histories with shrinking",
      async (seed) => {
        const replayPath = process.env.REFLEX_ASYNC_PROPERTY_PATH;
        await fc.assert(fc.asyncProperty(
          fc.array(fc.constantFrom(...events), { minLength: 4, maxLength: 6 }),
          (trace) => runTrace(strategy, seed, trace),
        ), {
          seed: Number(process.env.REFLEX_ASYNC_PROPERTY_SEED ?? 0x4153594e),
          ...(replayPath === undefined ? {} : { path: replayPath }),
          numRuns: 160,
          examples: [
            [["refresh", "switch-and-late-settle", "equal-commit", "dispose"]],
            [["switch-and-late-settle", "reject-newest", "refresh", "equal-commit"]],
            [["refresh", "refresh", "reject-oldest", "resolve-newest", "change-left", "equal-commit"]],
            [["switch", "resolve-newest", "change-left", "refresh", "resolve-oldest", "resolve-newest"]],
          ],
        });
      }, 20_000,
    );
  });
});
