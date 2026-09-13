import { describe, expect, it } from "vitest";
import { currentConsumer } from "@volynets/reflex-runtime";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";

describe("Reactive system - safety and robustness", () => {
  it("restores the active consumer after a thrown compute", () => {
    const rt = createRuntime();
    const source = signal(1);
    const boom = computed(() => {
      source();
      throw new Error("boom");
    });
    const stable = computed(() => source() + 1);

    expect(() => boom()).toThrow("boom");
    expect(currentConsumer).toBe(null);
    expect(stable()).toBe(2);
    expect(currentConsumer).toBe(null);
  });

  it("keeps other computeds usable after one compute throws", () => {
    createRuntime();
    const source = signal(1);
    const boom = computed(() => {
      if (source() === 2) {
        throw new Error("unstable");
      }

      return source();
    });
    const stable = computed(() => source() * 10);

    expect(boom()).toBe(1);
    expect(stable()).toBe(10);

    source.set(2);
    expect(() => boom()).toThrow("unstable");
    expect(stable()).toBe(20);
  });

  it("keeps unaffected effects schedulable after another effect throws during flush", () => {
    const rt = createRuntime();
    const badSource = signal(1);
    const goodSource = signal(1);
    const seen: number[] = [];

    effect(() => {
      if (badSource() === 2) {
        throw new Error("effect boom");
      }
    });

    effect(() => {
      seen.push(goodSource());
    });

    expect(seen).toEqual([1]);

    badSource.set(2);
    goodSource.set(2);

    expect(() => rt.flush()).toThrow("effect boom");
    expect(seen).toEqual([1, 2]);

    goodSource.set(3);
    rt.flush();

    expect(seen).toEqual([1, 2, 3]);
  });

  it("rolls back a watcher whose initial effect run throws", () => {
    const rt = createRuntime();
    const source = signal(0);
    let runs = 0;

    expect(() =>
      effect(() => {
        source();
        runs += 1;
        throw new Error("initial effect failed");
      }),
    ).toThrow("initial effect failed");

    source.set(1);
    rt.flush();
    expect(runs).toBe(1);
  });

  it("reschedules an effect after its cleanup throws", () => {
    const rt = createRuntime();
    const source = signal(0);
    let runs = 0;
    let throwCleanup = true;

    effect(() => {
      source();
      runs += 1;
      return () => {
        if (throwCleanup) throw new Error("cleanup failed");
      };
    });

    source.set(1);
    expect(() => rt.flush()).toThrow("cleanup failed");

    throwCleanup = false;
    source.set(2);
    rt.flush();
    expect(runs).toBe(2);
  });
});
