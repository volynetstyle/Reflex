import { describe, it } from "vitest";
import { computed, effect, setupAlienRuntime, signal } from "./alien-compat";

describe("alien-signals issue #109 variant", () => {
  it("handles dep subscriber disposal during mixed stable/changing computeds", () => {
    setupAlienRuntime();

    const s = signal(0);
    let dispose!: () => void;
    const a = computed(() => (s(), 0));
    const a2 = computed(() => (s() && dispose(), s()));
    const b = computed(() => (a(), a2(), 0));

    dispose = effect(() => {
      b();
    });

    s(1);
  });
});
