import { describe, expect, it } from "vitest";
import {
  createProducer,
  createWatcher,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime";
import type { EffectStrategy } from "@volynets/reflex-scheduler";
import { createRendererRuntime } from "../src/runtime/options";

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

describe.each(["eager", "sab", "flush"] as const)(
  "%s DOM scheduler stress",
  (strategy: EffectStrategy) => {
    it("matches a latest-value model through repeated nested batches", async () => {
      const runtime = createRendererRuntime({ effectStrategy: strategy });
      const size = 64;
      const sources = runtime.run(() =>
        Array.from({ length: size }, () => createProducer(0)),
      );
      const observed = Array<number>(size).fill(0);
      const runs = Array<number>(size).fill(0);
      const expected = Array<number>(size).fill(0);
      const expectedRuns = Array<number>(size).fill(1);
      const watchers = runtime.run(() =>
        sources.map((source, index) =>
          createWatcher(() => {
            observed[index] = readProducer(source);
            runs[index]!++;
          }),
        ),
      );
      runtime.run(() => watchers.forEach(runWatcher));
      const next = random(0x89abcdef);
      let serial = 0;

      for (let round = 0; round < 160; round++) {
        const touched = new Set<number>();
        const before = observed.slice();
        runtime.batch(() => {
          runtime.batch(() => {
            for (let write = 0; write < 24; write++) {
              const index = next() % size;
              const value = ++serial;
              writeProducer(sources[index]!, value);
              expected[index] = value;
              touched.add(index);
            }
          });
          if (strategy !== "flush") {
            expect(observed).toEqual(before);
          }
        });
        for (const index of touched) expectedRuns[index]!++;

        if (strategy === "flush") {
          expect(observed).toEqual(before);
          if (round % 9 === 0) runtime.flush();
          else await Promise.resolve();
        }

        const context = `strategy=${strategy} round=${round}`;
        expect(observed, context).toEqual(expected);
        expect(runs, context).toEqual(expectedRuns);
      }
    });

    it("drains a long reentrant invalidation chain", async () => {
      const runtime = createRendererRuntime({ effectStrategy: strategy });
      const size = 128;
      const sources = runtime.run(() =>
        Array.from({ length: size }, () => createProducer(0)),
      );
      const observed = Array<number>(size).fill(0);
      const watchers = runtime.run(() =>
        sources.map((source, index) =>
          createWatcher(() => {
            const value = readProducer(source);
            observed[index] = value;
            if (value > 0 && index + 1 < size) {
              writeProducer(sources[index + 1]!, value + 1);
            }
          }),
        ),
      );
      runtime.run(() => watchers.forEach(runWatcher));

      runtime.batch(() => writeProducer(sources[0]!, 1));
      if (strategy === "flush") await Promise.resolve();
      expect(observed).toEqual(Array.from({ length: size }, (_, index) => index + 1));
    });
  },
);
