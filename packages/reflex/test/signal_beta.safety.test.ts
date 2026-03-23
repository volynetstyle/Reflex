import { describe, expect, it } from "vitest";
import { computed, createRuntime, signal } from "./signal_beta.test_utils";

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
    expect(rt.ctx.activeComputed).toBe(null);
    expect(stable()).toBe(2);
    expect(rt.ctx.activeComputed).toBe(null);
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
});
