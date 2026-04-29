import { describe, expect, it } from "vitest";
import { getActiveConsumer } from "@volynets/reflex-runtime";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";

describe("Reactive system - safety and robustness", () => {
  it("restores the active consumer after a thrown compute", () => {
    const rt = createRuntime();
    const [source] = signal(1);
    const boom = computed(() => {
      source();
      throw new Error("boom");
    });
    const stable = computed(() => source() + 1);

    expect(() => boom()).toThrow("boom");
    expect(getActiveConsumer()).toBe(null);
    expect(stable()).toBe(2);
    expect(getActiveConsumer()).toBe(null);
  });

  it("keeps other computeds usable after one compute throws", () => {
    createRuntime();
    const [source, setSource] = signal(1);
    const boom = computed(() => {
      if (source() === 2) {
        throw new Error("unstable");
      }

      return source();
    });
    const stable = computed(() => source() * 10);

    expect(boom()).toBe(1);
    expect(stable()).toBe(10);

    setSource(2);
    expect(() => boom()).toThrow("unstable");
    expect(stable()).toBe(20);
  });

  it("keeps unaffected effects schedulable after another effect throws during flush", () => {
    const rt = createRuntime();
    const [badSource, setBadSource] = signal(1);
    const [goodSource, setGoodSource] = signal(1);
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

    setBadSource(2);
    setGoodSource(2);

    expect(() => rt.flush()).toThrow("effect boom");
    expect(seen).toEqual([1, 2]);

    setGoodSource(3);
    rt.flush();

    expect(seen).toEqual([1, 2, 3]);
  });
});
