import { describe, it } from "vitest";
import {
  computed,
  effect,
  effectScope,
  setupAlienRuntime,
  signal,
} from "./alien-compat";

describe("alien-signals issue #109 scope variant", () => {
  it("disposes an effectScope during computed update", () => {
    setupAlienRuntime();

    const s = signal(false);
    let disposeScope!: () => void;

    const a = computed(() => {
      if (s()) disposeScope();
      return 0;
    });
    const b = computed(() => a());

    disposeScope = effectScope(() => {
      effect(() => {
        b();
      });
    });

    s(true);
  });
});
