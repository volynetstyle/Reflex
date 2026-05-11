import { describe, expect, it } from "vitest";
import { computed, effect, setupAlienRuntime, signal } from "./alien-compat";

describe("alien-signals issue #109 shallow propagation", () => {
  it("walks stale link after sibling disposal", () => {
    setupAlienRuntime();

    const s = signal(0);
    let dispose1!: () => void;
    let e2Value = -1;

    const a = computed(() => {
      if (s() === 1) dispose1();
      return s();
    });

    dispose1 = effect(() => {
      a();
    });
    effect(() => {
      e2Value = a();
    });

    expect(e2Value).toBe(0);
    s(1);
    expect(e2Value).toBe(1);
  });

  it("walks stale link with 3 subscribers", () => {
    setupAlienRuntime();

    const s = signal(0);
    let dispose1!: () => void;
    let e2Value = -1;
    let e3Value = -1;

    const a = computed(() => {
      if (s() === 1) dispose1();
      return s();
    });

    dispose1 = effect(() => {
      a();
    });
    effect(() => {
      e2Value = a();
    });
    effect(() => {
      e3Value = a();
    });

    expect(e2Value).toBe(0);
    expect(e3Value).toBe(0);
    s(1);
    expect(e2Value).toBe(1);
    expect(e3Value).toBe(1);
  });
});
