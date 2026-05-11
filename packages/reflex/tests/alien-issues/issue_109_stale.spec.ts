import { describe, expect, it } from "vitest";
import { computed, effect, setupAlienRuntime, signal } from "./alien-compat";

describe("alien-signals issue #109 stale link", () => {
  it("disposed effect should not run", () => {
    setupAlienRuntime();

    const s = signal(0);
    let dispose1!: () => void;
    let e1runs = 0;

    const a = computed(() => {
      if (s() === 1) dispose1();
      return s();
    });

    dispose1 = effect(() => {
      a();
      e1runs++;
    });
    effect(() => {
      a();
    });

    expect(e1runs).toBe(1);
    s(1);
    expect(e1runs).toBe(1);
  });
});
