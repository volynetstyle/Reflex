import { describe, expect, it } from "vitest";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";

/**
 * A failed lifecycle step must leave the effect reachable: a later change to
 * any of its dependencies is still delivered (F16 for a throwing cleanup).
 */
const CAP = 50;
const strategies = ["flush", "sab", "eager"] as const;
type Strategy = (typeof strategies)[number];

function runtimeFor(strategy: Strategy) {
  return strategy === "flush"
    ? createRuntime()
    : createRuntime({ effectStrategy: strategy });
}

function attempt(fn: () => void): void {
  try {
    fn();
  } catch {
    // The failure itself is expected; reachability afterwards is under test.
  }
}

function settle(rt: ReturnType<typeof createRuntime>) {
  for (let i = 0; i < 6; i++) attempt(() => rt.flush());
}

describe.each(strategies)("recovery keeps effects reachable [%s]", (strategy) => {
  it("after the callback throws following a write-back", () => {
    const rt = runtimeFor(strategy);
    const s = signal(0);
    const t = signal(0);
    const c = computed(() => s());
    const seen: number[] = [];
    let boom = false;
    effect(() => {
      if (seen.length > CAP) return;
      const v = c();
      t();
      seen.push(v);
      if (boom) {
        boom = false;
        s.set(v + 1);
        throw new Error("callback");
      }
    });
    boom = true;
    attempt(() => t.set(1));
    settle(rt);
    attempt(() => s.set(42));
    settle(rt);
    expect(seen.at(-1)).toBe(42);
  });

  it("after a computed throws during validation", () => {
    const rt = runtimeFor(strategy);
    const s = signal(0);
    const t = signal(0);
    let fail = false;
    const c = computed(() => {
      const v = s();
      if (fail) {
        fail = false;
        throw new Error("validation");
      }
      return v;
    });
    const seen: number[] = [];
    effect(() => {
      if (seen.length > CAP) return;
      let v: number;
      try {
        v = c();
      } catch {
        v = -1;
      }
      t();
      seen.push(v);
    });
    fail = true;
    attempt(() => s.set(1));
    settle(rt);
    const before = seen.length;
    attempt(() => t.set(1));
    settle(rt);
    expect(seen.length).toBeGreaterThan(before);
    attempt(() => s.set(2));
    settle(rt);
    expect(seen.at(-1)).toBe(2);
  });

  it("after a computed throws during validation once it has written", () => {
    const rt = runtimeFor(strategy);
    const s2 = signal(0);
    const trig = signal(0);
    let armed = false;
    const c2 = computed(() => s2());
    const c0 = computed(() => {
      trig();
      if (armed) {
        armed = false;
        s2.set(s2() + 1);
        throw new Error("after-write");
      }
      return 0;
    });
    const seen: number[] = [];
    effect(() => {
      if (seen.length > CAP) return;
      seen.push(c2());
      try {
        c0();
      } catch {
        // observed by the effect
      }
    });
    armed = true;
    attempt(() => trig.set(1));
    settle(rt);
    expect(seen.at(-1)).toBe(1);
    attempt(() => s2.set(5));
    settle(rt);
    expect(seen.at(-1)).toBe(5);
  });

  it("after the cleanup writes through a dependency and throws", () => {
    const rt = runtimeFor(strategy);
    const s = signal(0);
    const t = signal(0);
    const c = computed(() => s());
    const seen: number[] = [];
    let armed = false;
    effect(() => {
      if (seen.length > CAP) return;
      const v = c();
      t();
      seen.push(v);
      return () => {
        if (armed) {
          armed = false;
          s.set(100);
          throw new Error("cleanup");
        }
      };
    });
    armed = true;
    attempt(() => t.set(1));
    settle(rt);
    const before = seen.length;
    attempt(() => s.set(7));
    settle(rt);
    expect(seen.length).toBeGreaterThan(before);
    expect(seen.at(-1)).toBe(7);
  });

  it("stops after disposing itself in a run that wrote back", () => {
    const rt = runtimeFor(strategy);
    const s = signal(0);
    const c = computed(() => s());
    let runs = 0;
    const stop: { current?: () => void } = {};
    stop.current = effect(() => {
      runs++;
      if (c() === 1) {
        s.set(2);
        stop.current?.();
      }
    });
    s.set(1);
    settle(rt);
    const before = runs;
    s.set(3);
    settle(rt);
    expect(runs).toBe(before);
  });
});
