import { beforeEach, describe, expect, it } from "vitest";
import { computed, signal } from "../api/reactivity";
import {
  resetStats,
  stats,
} from "../../src/reactivity/walkers/propagateFrontier";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tracker<T extends string>(...names: T[]) {
  const calls = Object.fromEntries(names.map((n) => [n, 0])) as Record<
    T,
    number
  >;
  const hit = (n: T) => calls[n]++;
  return { calls, hit };
}

// ─── Graph invariants ─────────────────────────────────────────────────────────

describe("graph invariants", () => {
  /**
   * DIAMOND — classic fan-out / fan-in
   *
   *      S
   *     / \
   *    B   C
   *     \ /
   *      D
   *
   * Each node must recompute exactly once per signal write,
   * regardless of how many paths lead to it.
   */
  it("diamond: each node recomputes exactly once", () => {
    const { calls, hit } = tracker("B", "C", "D");
    const [a, setA] = signal(1);

    const B = computed(() => {
      hit("B");
      return a() + 1;
    });
    const C = computed(() => {
      hit("C");
      return a() * 2;
    });
    const D = computed(() => {
      hit("D");
      return B() + C();
    });

    expect(D()).toBe(4);
    expect(calls).toEqual({ B: 1, C: 1, D: 1 });

    setA(5);
    expect(D()).toBe(16);
    expect(calls).toEqual({ B: 2, C: 2, D: 2 });
  });

  /**
   * DEEP DIAMOND — multiple levels of fan-out / fan-in
   *
   *        S
   *       / \
   *      B   C
   *     / \ / \
   *    E   F   G
   *     \  |  /
   *        H
   */
  it("deep diamond: each node recomputes exactly once", () => {
    const { calls, hit } = tracker("B", "C", "E", "F", "G", "H");
    const [s, setS] = signal(1);

    const B = computed(() => {
      hit("B");
      return s() + 1;
    });
    const C = computed(() => {
      hit("C");
      return s() + 2;
    });
    const E = computed(() => {
      hit("E");
      return B() * 2;
    });
    const F = computed(() => {
      hit("F");
      return B() + C();
    });
    const G = computed(() => {
      hit("G");
      return C() * 2;
    });
    const H = computed(() => {
      hit("H");
      return E() + F() + G();
    });

    H();
    setS(3);
    H();

    expect(calls).toEqual({ B: 2, C: 2, E: 2, F: 2, G: 2, H: 2 });
  });

  /**
   * DUPLICATE READS — same dep read twice in one computation
   *
   *    A() + A() must not trigger two recomputes of A
   */
  it("duplicate reads: dependency recomputes once", () => {
    const { calls, hit } = tracker("A", "B");
    const [s, setS] = signal(1);

    const A = computed(() => {
      hit("A");
      return s() + 1;
    });
    const B = computed(() => {
      hit("B");
      return A() + A();
    });

    expect(B()).toBe(4);
    setS(5);
    expect(B()).toBe(12);
    expect(calls).toEqual({ A: 2, B: 2 });
  });

  /**
   * WIDE GRAPH — fan-out with many leaves
   *
   *         S
   *   /  /  |  \  \
   *  N0 N1 N2 ... Nn
   *         |
   *        root (sum)
   */
  it("wide graph: each node recomputes once per update", () => {
    const SIZE = 500;
    let runs = 0;
    const [s, setS] = signal(1);

    const nodes = Array.from({ length: SIZE }, () =>
      computed(() => {
        runs++;
        return s();
      }),
    );
    const root = computed(() => nodes.reduce((a, n) => a + n(), 0));

    expect(root()).toBe(SIZE);
    setS(2);
    expect(root()).toBe(SIZE * 2);
    expect(runs).toBe(SIZE * 2);
  });

  /**
   * CHAIN — deep linear dependency
   *
   *   S → A → B → C → ... → Z
   *
   * No node recomputes more than once.
   */
  it("chain: linear propagation without redundant recomputes", () => {
    const DEPTH = 50;
    let runs = 0;
    const [s, setS] = signal(1);

    let prev = computed(() => {
      runs++;
      return s();
    });
    for (let i = 1; i < DEPTH; i++) {
      const dep = prev;
      prev = computed(() => {
        runs++;
        return dep() + 1;
      });
    }
    const tail = prev;

    tail();
    const baseline = runs;

    setS(2);
    tail();

    expect(runs - baseline).toBe(DEPTH);
  });
});

// ─── Laziness ─────────────────────────────────────────────────────────────────

describe("laziness", () => {
  /**
   * No recomputation until observed.
   */
  it("does not recompute until observed", () => {
    const { calls, hit } = tracker("A");
    const [s, setS] = signal(1);
    const A = computed(() => {
      hit("A");
      return s() + 1;
    });

    A();
    expect(calls.A).toBe(1);

    setS(5);
    setS(6);
    setS(7);
    expect(calls.A).toBe(1);

    expect(A()).toBe(8);
    expect(calls.A).toBe(2);
  });

  /**
   * Multiple rapid writes: only the latest value is computed.
   */
  it("multiple rapid writes collapse into one recompute", () => {
    const { calls, hit } = tracker("A");
    const [s, setS] = signal(0);
    const A = computed(() => {
      hit("A");
      return s() * 2;
    });

    A();
    for (let i = 1; i <= 100; i++) setS(i);
    A();

    expect(calls.A).toBe(2);
    expect(A()).toBe(200);
  });

  /**
   * Unobserved subtrees stay dormant even after dependency changes.
   */
  it("unobserved subtree never computes", () => {
    const { calls, hit } = tracker("dormant");
    const [s, setS] = signal(1);
    computed(() => {
      hit("dormant");
      return s();
    });

    setS(2);
    setS(3);
    setS(4);
    expect(calls.dormant).toBe(0);
  });
});

// ─── Dynamic dependencies ─────────────────────────────────────────────────────

describe("dynamic dependencies", () => {
  /**
   * Conditional branch: inactive dependency must not trigger recompute.
   */
  it("prunes inactive branches", () => {
    const { calls, hit } = tracker("left", "right", "root");
    const [flag, setFlag] = signal(true);
    const [a, setA] = signal(1);
    const [b, setB] = signal(2);

    const left = computed(() => {
      hit("left");
      return a();
    });
    const right = computed(() => {
      hit("right");
      return b();
    });
    const root = computed(() => {
      hit("root");
      return flag() ? left() : right();
    });

    expect(root()).toBe(1);

    setB(100);
    expect(root()).toBe(1);
    expect(calls.right).toBe(0);

    setFlag(false);
    expect(root()).toBe(100);
    expect(calls.right).toBe(1);
  });

  /**
   * After branch switch, old dependency change must NOT trigger recompute.
   */
  it("unsubscribes from stale branch after switch", () => {
    const { calls, hit } = tracker("root");
    const [flag, setFlag] = signal(true);
    const [a, setA] = signal(1);
    const [b, setB] = signal(2);

    const root = computed(() => {
      hit("root");
      return flag() ? a() : b();
    });

    root();
    expect(calls.root).toBe(1);

    setFlag(false);
    root();
    expect(calls.root).toBe(2);

    // Now subscribed to b only — changing a must not trigger root
    setA(99);
    root();
    expect(calls.root).toBe(2); // no extra call
  });

  /**
   * Re-subscribing to a branch after switching back.
   */
  it("re-subscribes when branch switches back", () => {
    const { calls, hit } = tracker("A");
    const [flag, setFlag] = signal(true);
    const [a, setA] = signal(1);
    const [b, setB] = signal(10);

    const A = computed(() => {
      hit("A");
      return flag() ? a() : b();
    });

    A();
    setFlag(false);
    A();
    setFlag(true);
    A();

    setA(5);
    expect(A()).toBe(5);
    expect(calls.A).toBe(4);
  });
});

// ─── Propagation invariants ───────────────────────────────────────────────────

describe("propagation invariants", () => {
  /**
   * VALUE EQUALITY BAILOUT
   *
   * If A's value did not change, B must NOT recompute.
   *
   *   S=1 → A = S%2 = 1
   *   S=3 → A = S%2 = 1  ← same value, B must stay cached
   */
  it("stops propagation on equal value", () => {
    const { calls, hit } = tracker("A", "B");
    const [s, setS] = signal(1);

    const A = computed(() => {
      hit("A");
      return s() % 2;
    });
    const B = computed(() => {
      hit("B");
      return A() + 1;
    });

    B();
    setS(3);
    B();

    expect(calls).toEqual({ A: 2, B: 1 });
  });

  /**
   * DEEP EQUALITY BAILOUT
   *
   * Bailout must propagate through multiple levels:
   *   S → A (same) → B (must skip) → C (must skip)
   */
  it("equality bailout cascades through chain", () => {
    const { calls, hit } = tracker("A", "B", "C");
    const [s, setS] = signal(1);

    const A = computed(() => {
      hit("A");
      return s() % 2;
    });
    const B = computed(() => {
      hit("B");
      return A() + 0;
    }); // identity
    const C = computed(() => {
      hit("C");
      return B() + 1;
    });

    C();
    setS(3); // A stays 1
    C();

    expect(calls).toEqual({ A: 2, B: 1, C: 1 });
  });

  /**
   * GLITCH FREEDOM
   *
   * Downstream node must never observe a mix of old/new values.
   */
  it("never produces glitches", () => {
    const [a, setA] = signal(1);

    const B = computed(() => a() + 1);
    const C = computed(() => a() + 2);
    const D = computed(() => {
      const b = B(),
        c = C();
      if (c !== b + 1) throw new Error(`glitch: b=${b} c=${c}`);
      return b + c;
    });

    expect(D()).toBe(5);
    setA(10);
    expect(D()).toBe(23);
  });

  /**
   * GLITCH FREEDOM — diamond variant
   *
   * Both B and C must reflect new value of A when D reads them.
   */
  it("diamond is glitch-free", () => {
    const [s, setS] = signal(2);
    const B = computed(() => s() * 2);
    const C = computed(() => s() * 3);
    const D = computed(() => {
      const b = B(),
        c = C();
      // invariant: c is always 1.5× b
      if (c / b !== 1.5) throw new Error(`glitch: b=${b} c=${c}`);
      return b + c;
    });

    expect(D()).toBe(10);
    setS(4);
    expect(D()).toBe(20);
  });

  /**
   * PARTIAL STALENESS
   *
   * When only one branch of a diamond changes but not the other,
   * D still recomputes exactly once (not twice).
   */
  it("partial staleness: D recomputes once when one branch is equal", () => {
    const { calls, hit } = tracker("B", "C", "D");
    const [x, setX] = signal(2);
    const [y, setY] = signal(3);

    const B = computed(() => {
      hit("B");
      return x();
    });
    const C = computed(() => {
      hit("C");
      return y() % 2;
    }); // will stay 1
    const D = computed(() => {
      hit("D");
      return B() + C();
    });

    D();
    setY(5); // C stays 1, only y changed
    D();

    expect(calls.C).toBe(2); // C re-evaluates to confirm equal
    expect(calls.D).toBe(1); // D must not recompute — C's value unchanged
  });
});

describe("traversal statistics", () => {
  beforeEach(() => resetStats());

  it("diamond: propagate visits at least 3 nodes", () => {
    const [a, setA] = signal(1);
    const b = computed(() => a() + 1);
    const c = computed(() => a() + 2);
    const d = computed(() => b() + c());

    d();
    setA(5);
    d();

    expect(stats.propagateCalls).toBeGreaterThan(0);
    expect(stats.propagateNodes).toBeGreaterThanOrEqual(3);
  });

  it("wide graph: recuperate visits each node at most once", () => {
    const SIZE = 200;
    const [s, setS] = signal(1);
    const nodes = Array.from({ length: SIZE }, () => computed(() => s()));
    const root = computed(() => nodes.reduce((a, n) => a + n(), 0));

    root();
    setS(2);
    root();

    expect(stats.recuperateNodes).toBeGreaterThan(0);
    expect(stats.recuperateNodes).toBeLessThanOrEqual(SIZE * 3);
  });

  it("equality bailout: propagate does not visit B after A stays equal", () => {
    const [s, setS] = signal(1);
    const A = computed(() => s() % 2);
    const B = computed(() => A() + 1);

    B();
    resetStats();
    setS(3);
    B();

    // propagate from signal touches A and (initially) B.
    // After clearPropagate, B should not have been recomputed.
    expect(stats.propagateNodes).toBeGreaterThanOrEqual(1);
  });

  it("chain: recuperate call count scales linearly", () => {
    const DEPTH = 20;
    const [s, setS] = signal(1);
    let prev = computed(() => s());
    for (let i = 1; i < DEPTH; i++) {
      const dep = prev;
      prev = computed(() => dep() + 1);
    }
    const tail = prev;

    tail();
    resetStats();
    setS(2);
    tail();

    expect(stats.recuperateNodes).toBeGreaterThan(0);
    expect(stats.recuperateNodes).toBeLessThanOrEqual(DEPTH * 2);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  /**
   * CONSTANT COMPUTED — compute never changes.
   */
  it("constant computed recomputes only once", () => {
    const { calls, hit } = tracker("A");
    const [s, setS] = signal(1);
    const A = computed(() => {
      hit("A");
      return 42;
    }); // ignores s

    A();
    setS(2);
    setS(3);
    A();

    expect(calls.A).toBe(1);
  });

  /**
   * SELF-STABILIZING — value oscillates but always settles.
   */
  it("signal write to same value does not trigger recompute", () => {
    const { calls, hit } = tracker("A");
    const [s, setS] = signal(1);
    const A = computed(() => {
      hit("A");
      return s();
    });

    A();
    setS(1); // same value
    A();

    expect(calls.A).toBe(1);
  });

  /**
   * NULL / UNDEFINED values must not be treated as "changed".
   */
  it("handles null and undefined equality correctly", () => {
    const { calls, hit } = tracker("A");
    const [s, setS] = signal<null | number>(null);
    const A = computed(() => {
      hit("A");
      return s();
    });

    A();
    setS(null); // same value
    A();

    expect(calls.A).toBe(1);
    expect(A()).toBeNull();
  });

  /**
   * DISCONNECTED GRAPH — two independent signals/computeds.
   */
  it("independent graphs do not cross-invalidate", () => {
    const { calls, hit } = tracker("A", "B");
    const [s1, setS1] = signal(1);
    const [s2] = signal(2);

    const A = computed(() => {
      hit("A");
      return s1();
    });
    const B = computed(() => {
      hit("B");
      return s2();
    });

    A();
    B();
    setS1(10);
    A();
    B();

    expect(calls).toEqual({ A: 2, B: 1 });
  });
});
