import { describe, it } from "vitest";
import { computed, effect, setupAlienRuntime, signal } from "./alien-compat";

describe("alien-signals issue #109", () => {
  it("disposes an effect during computed update", () => {
    setupAlienRuntime();

    const s = signal(false);
    let dispose!: () => void;
    const a = computed(() => {
      if (s()) dispose();
      return 0;
    });
    const b = computed(() => a());

    dispose = effect(() => {
      b();
    });

    s(true);
  });
});
