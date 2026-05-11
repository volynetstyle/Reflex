import { describe, expect, it } from "vitest";
import {
  computed,
  effect,
  effectScope,
  setupAlienRuntime,
  signal,
} from "./alien-compat";

describe("alien-signals issue #105", () => {
  it("signal and computed should link to the same node in effectScope", () => {
    setupAlienRuntime();

    const a = signal(0);
    const source = signal(0);
    const b = computed(() => source());
    let triggers = 0;

    effect(() => {
      triggers += 1;
      effectScope(() => {
        effectScope(() => {
          a();
          b();
        });
      });
    });

    expect(triggers).toBe(1);
    a(a() + 1);
    expect(triggers).toBe(2);

    source(source() + 1);
    expect(triggers).toBe(3);
  });

  it("effect should respond to both signal and computed changes through scope", () => {
    setupAlienRuntime();

    const s = signal(0);
    const computedSource = signal(0);
    const c = computed(() => s() * 2 + computedSource());
    let triggers = 0;

    effect(() => {
      triggers += 1;
      effectScope(() => {
        s();
        c();
      });
    });

    expect(triggers).toBe(1);

    s(1);
    expect(triggers).toBe(2);

    computedSource(1);
    expect(triggers).toBe(3);
  });

  it("scope should respond to consecutive signal updates", () => {
    setupAlienRuntime();

    const s = signal(0);
    let triggers = 0;

    effect(() => {
      triggers += 1;
      effectScope(() => {
        s();
      });
    });

    expect(triggers).toBe(1);
    s(1);
    expect(triggers).toBe(2);
    s(2);
    expect(triggers).toBe(3);
  });

  it("computed in standalone scope should cache and clean up", () => {
    setupAlienRuntime();

    const s = signal(0);
    let computeCount = 0;

    const dispose = effectScope(() => {
      const c = computed(() => {
        computeCount++;
        return s();
      });
      expect(c()).toBe(0);
      expect(c()).toBe(0);
    });

    expect(computeCount).toBe(1);

    dispose();
  });
});
