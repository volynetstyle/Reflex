import { beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  Both,
  Computing,
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
} from "../../src/internal";

/**
 * The general SpecMachine excludes writes from reactive callbacks. This small
 * reference observes only the source values and watcher output after the
 * scripted nested writes. It has no graph, dirty flags or validation cursor.
 */
function expectedTrace(writes: readonly number[]): number[] {
  return [0, writes.at(-1)!];
}

describe("nested validated dependency write / independent output oracle", () => {
  beforeEach(resetRuntimeContext);

  it.each([
    { order: "earlier edge", targetFirst: true, writes: [1] },
    { order: "later edge", targetFirst: false, writes: [1] },
    {
      order: "earlier edge, repeated writes",
      targetFirst: true,
      writes: [1, 2],
    },
    {
      order: "later edge, repeated writes",
      targetFirst: false,
      writes: [1, 2],
    },
  ])("retains the wake for $order", ({ targetFirst, writes }) => {
    const target = createProducer(0);
    const trigger = createProducer(0);
    let armed = false;
    const observed: number[] = [];
    const nested = createConsumer(() => {
      readProducer(trigger);
      if (armed) {
        armed = false;
        for (const value of writes) writeProducer(target, value);
      }
      return 0; // Nested computed's visible result remains unchanged.
    });
    const watcher = createWatcher(() => {
      const first = targetFirst ? readProducer(target) : readConsumer(nested);
      const second = targetFirst ? readConsumer(nested) : readProducer(target);
      observed.push(targetFirst ? first : second);
      void second;
    });

    runWatcher(watcher);
    armed = true;
    writeProducer(trigger, 1);

    // A host may encounter a stable validation pass before the retained wake
    // causes execution. Repeated drains must converge without duplicate runs.
    for (let attempt = 0; attempt < 4; attempt += 1) runWatcher(watcher);

    expect(observed).toEqual(expectedTrace(writes));
    expect(readProducer(target)).toBe(writes.at(-1));
    expect(watcher.state & (Both | Computing)).toBe(0);
  });

  it("preserves the nested write after validation throws and retries", () => {
    const target = createProducer(0);
    const trigger = createProducer(0);
    let armed = false;
    let throwOnce = true;
    const observed: number[] = [];
    const nested = createConsumer(() => {
      readProducer(trigger);
      if (armed) {
        armed = false;
        writeProducer(target, 1);
        if (throwOnce) {
          throwOnce = false;
          throw new Error("nested validation failure");
        }
      }
      return 0;
    });
    const watcher = createWatcher(() => {
      observed.push(readProducer(target) + readConsumer(nested));
    });

    runWatcher(watcher);
    armed = true;
    writeProducer(trigger, 1);
    expect(() => runWatcher(watcher)).toThrow("nested validation failure");
    expect(readProducer(target)).toBe(1);
    expect(watcher.state & Computing).toBe(0);

    for (let attempt = 0; attempt < 4; attempt += 1) runWatcher(watcher);
    expect(observed).toEqual(expectedTrace([1]));
    expect(watcher.state & (Both | Computing)).toBe(0);
  });

  it("matches the output oracle for generated nested writes and failure placement", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc
          .array(fc.integer({ min: -3, max: 3 }), {
            minLength: 1,
            maxLength: 4,
          })
          .filter((writes) => writes.some((value) => value !== 0)),
        fc.boolean(),
        (targetFirst, writes, failAfterWrite) => {
          resetRuntimeContext();
          const target = createProducer(0);
          const trigger = createProducer(0);
          const observed: number[] = [];
          let armed = false;
          let shouldThrow = failAfterWrite;
          const nested = createConsumer(() => {
            readProducer(trigger);
            if (armed) {
              armed = false;
              for (const value of writes) writeProducer(target, value);
              if (shouldThrow) {
                shouldThrow = false;
                throw new Error("generated validation failure");
              }
            }
            return 0;
          });
          const watcher = createWatcher(() => {
            const first = targetFirst
              ? readProducer(target)
              : readConsumer(nested);
            const second = targetFirst
              ? readConsumer(nested)
              : readProducer(target);
            observed.push(targetFirst ? first : second);
            void second;
          });

          runWatcher(watcher);
          armed = true;
          writeProducer(trigger, 1);
          if (failAfterWrite) {
            expect(() => runWatcher(watcher)).toThrow(
              "generated validation failure",
            );
          }
          for (let attempt = 0; attempt < 4; attempt++) runWatcher(watcher);

          expect(observed).toEqual(expectedTrace(writes));
          expect(readProducer(target)).toBe(writes.at(-1));
          expect(watcher.state & (Both | Computing)).toBe(0);
        },
      ),
      { seed: 0x3037, numRuns: 200 },
    );
  });
});
