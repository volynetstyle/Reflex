import { describe, expect, it } from "vitest";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";

/**
 * F15: a watcher invalidated transitively during its own validation or
 * execution must be delivered again, without forcing execution when the
 * observed computeds recompute to equal values.
 *
 * Delivery tests assert that a later change is observed and bound the number
 * of runs; equality-cutoff tests assert exact run counts, because there the
 * count is the semantics under test.
 */
const CAP = 50;
const strategies = ["flush", "sab", "eager"] as const;
type Strategy = (typeof strategies)[number];

function runtimeFor(strategy: Strategy) {
  return strategy === "flush"
    ? createRuntime()
    : createRuntime({ effectStrategy: strategy });
}

function settle(rt: ReturnType<typeof createRuntime>) {
  for (let i = 0; i < 5; i++) rt.flush();
}

describe.each(strategies)("reentrant write in the callback [%s]", (strategy) => {
  // Shared shape: the effect reads computed `c` over `s` and a direct `t`,
  // and writes back into `s` when it observes 1.
  function feedback(order: "c-first" | "t-first" = "c-first") {
    const rt = runtimeFor(strategy);
    const s = signal(0);
    const t = signal(0);
    const c = computed(() => s());
    let runs = 0;
    effect(() => {
      if (++runs > CAP) return;
      if (order === "t-first") t();
      const v = c();
      if (order === "c-first") t();
      if (v === 1) s.set(0);
    });
    return { rt, s, t, runs: () => runs };
  }

  it("keeps delivering direct and indirect changes after a write-back", () => {
    const g = feedback();
    g.s.set(1);
    settle(g.rt);
    const afterWriteBack = g.runs();
    g.t.set(1);
    settle(g.rt);
    expect(g.runs()).toBeGreaterThan(afterWriteBack);
    const afterDirect = g.runs();
    g.s.set(5);
    settle(g.rt);
    expect(g.runs()).toBeGreaterThan(afterDirect);
    expect(g.runs()).toBeLessThan(CAP);
  });

  it("keeps delivering when the direct dependency is read first", () => {
    const g = feedback("t-first");
    g.s.set(1);
    settle(g.rt);
    const before = g.runs();
    g.t.set(1);
    settle(g.rt);
    expect(g.runs()).toBeGreaterThan(before);
  });

  it("keeps delivering after a write during the creating run", () => {
    const rt = runtimeFor(strategy);
    const s = signal(1);
    const t = signal(0);
    const c = computed(() => s());
    let runs = 0;
    effect(() => {
      if (++runs > CAP) return;
      const v = c();
      t();
      if (v === 1) s.set(0);
    });
    settle(rt);
    const before = runs;
    t.set(1);
    settle(rt);
    expect(runs).toBeGreaterThan(before);
  });

  it("keeps delivering through a chain of computeds", () => {
    const rt = runtimeFor(strategy);
    const s = signal(0);
    const t = signal(0);
    const c1 = computed(() => s());
    const c2 = computed(() => c1() * 2);
    let runs = 0;
    effect(() => {
      if (++runs > CAP) return;
      const v = c2();
      t();
      if (v === 2) s.set(0);
    });
    s.set(1);
    settle(rt);
    const before = runs;
    t.set(1);
    settle(rt);
    expect(runs).toBeGreaterThan(before);
  });

  it("keeps delivering with only indirect dependencies", () => {
    const rt = runtimeFor(strategy);
    const s = signal(0);
    const c = computed(() => s());
    const seen: number[] = [];
    effect(() => {
      if (seen.length > CAP) return;
      const v = c();
      seen.push(v);
      if (v === 1) s.set(0);
    });
    s.set(1);
    settle(rt);
    s.set(7);
    settle(rt);
    expect(seen.at(-1)).toBe(7);
  });

  it("keeps delivering after a write-back inside a batch", () => {
    const g = feedback();
    g.rt.batch(() => g.s.set(1));
    settle(g.rt);
    const before = g.runs();
    g.rt.batch(() => g.t.set(1));
    settle(g.rt);
    expect(g.runs()).toBeGreaterThan(before);
  });

  it("observes a write made by a computed during the effect's own read", () => {
    const rt = runtimeFor(strategy);
    const target = signal(0);
    const trigger = signal(0);
    let armed = false;
    const nested = computed(() => {
      trigger();
      if (armed) {
        armed = false;
        target.set(1);
      }
      return 0;
    });
    const seen: number[] = [];
    effect(() => {
      seen.push(target());
      nested();
    });
    armed = true;
    trigger.set(1);
    settle(rt);
    expect(seen).toContain(1);
    target.set(9);
    settle(rt);
    expect(seen.at(-1)).toBe(9);
  });
});

describe.each(strategies)("reentrant write during validation [%s]", (strategy) => {
  // `c2` is read first and validated; recomputing `c0` later in the same
  // validation pass writes `s2`, invalidating the already validated `c2`.
  function validationWrite(observe: (s2: number) => number) {
    const rt = runtimeFor(strategy);
    const s2 = signal(0);
    const trig = signal(0);
    const t = signal(0);
    let armed = false;
    const c2 = computed(() => observe(s2()));
    const c0 = computed(() => {
      trig();
      if (armed) {
        armed = false;
        s2.set(s2() + 1);
      }
      return 0;
    });
    let runs = 0;
    const seen: number[] = [];
    effect(() => {
      if (++runs > CAP) return;
      seen.push(c2());
      c0();
      t();
    });
    settle(rt);
    return {
      rt,
      s2,
      t,
      seen,
      runs: () => runs,
      write: () => {
        armed = true;
        trig.set(1);
        settle(rt);
      },
    };
  }

  it("observes the changed earlier dependency", () => {
    const g = validationWrite((v) => v % 2);
    g.write();
    expect(g.seen.at(-1)).toBe(1);
  });

  it("keeps delivering direct and indirect changes afterwards", () => {
    const g = validationWrite((v) => v % 2);
    g.write();
    const before = g.runs();
    g.t.set(1);
    settle(g.rt);
    expect(g.runs()).toBeGreaterThan(before);
    g.s2.set(g.s2() + 1);
    settle(g.rt);
    expect(g.seen.at(-1)).toBe(g.s2() % 2);
  });

  it("does not execute when the invalidated computed is unchanged", () => {
    const g = validationWrite((v) => (v >= 0 ? 1 : 0));
    const before = g.runs();
    g.write();
    expect(g.runs()).toBe(before);
  });
});

describe.each(strategies)("equality cutoff and evidence [%s]", (strategy) => {
  it("does not rerun for a write-back that leaves the computed equal", () => {
    const rt = runtimeFor(strategy);
    const s = signal(0);
    const t = signal(0);
    const c = computed(() => s() >= 0);
    let runs = 0;
    let armed = false;
    let next = 0;
    effect(() => {
      runs++;
      c();
      t();
      if (armed) {
        armed = false;
        s.set(++next); // not read by the effect: only the path through `c`
      }
    });
    armed = true;
    t.set(1);
    settle(rt);
    expect(runs).toBe(2);
  });

  it("converges when the effect writes every run through a constant computed", () => {
    const rt = runtimeFor(strategy);
    const s = signal(1);
    const c = computed(() => s() > 0);
    let n = 1;
    let runs = 0;
    effect(() => {
      if (++runs > CAP) return;
      if (c()) s.set(++n);
    });
    settle(rt);
    s.set(100);
    settle(rt);
    expect(runs).toBe(1);
    s.set(-1);
    settle(rt);
    expect(runs).toBe(2);
  });

  it("does not rerun when a write-back leaves the observed parity unchanged", () => {
    const rt = runtimeFor(strategy);
    const s = signal(0);
    const c = computed(() => s() % 2);
    let runs = 0;
    effect(() => {
      if (++runs > CAP) return;
      if (c() === 1) s.set(s() + 1);
    });
    s.set(1);
    settle(rt);
    const before = runs;
    s.set(4);
    settle(rt);
    expect(runs).toBe(before);
  });

  it("executes once when a confirmed change meets a revalidation", () => {
    const rt = runtimeFor(strategy);
    const x = signal(0);
    const s2 = signal(0);
    const trig = signal(0);
    let armed = false;
    const cx = computed(() => x());
    const c2 = computed(() => s2() >= 0);
    const c0 = computed(() => {
      trig();
      if (armed) {
        armed = false;
        s2.set(s2() + 1);
      }
      return 0;
    });
    const seen: number[] = [];
    effect(() => {
      seen.push(cx());
      c2();
      c0();
    });
    rt.batch(() => {
      x.set(1);
      armed = true;
      trig.set(1);
    });
    settle(rt);
    expect(seen).toEqual([0, 1]);
  });
});

describe.each(strategies)("dynamic topology [%s]", (strategy) => {
  it("follows a branch flip written into the confirmed prefix", () => {
    const rt = runtimeFor(strategy);
    const pick = signal(true);
    const a = signal(0);
    const b = signal(0);
    const c = computed(() => (pick() ? a() : b()));
    const seen: number[] = [];
    let armed = false;
    effect(() => {
      if (seen.length > CAP) return;
      seen.push(c());
      if (armed) {
        armed = false;
        pick.set(false);
        b.set(1);
      }
    });
    armed = true;
    a.set(5);
    settle(rt);
    expect(seen.at(-1)).toBe(1);
    b.set(2);
    settle(rt);
    expect(seen.at(-1)).toBe(2);
    const runs = seen.length;
    a.set(9);
    settle(rt);
    expect(seen.length).toBe(runs);
  });

  it("observes a write into a dependency first read during this run", () => {
    const rt = runtimeFor(strategy);
    const mode = signal(false);
    const s2 = signal(0);
    const c2 = computed(() => s2() * 10);
    const seen: number[] = [];
    effect(() => {
      if (seen.length > CAP) return;
      if (!mode()) return;
      const v = c2();
      seen.push(v);
      if (v === 0) s2.set(1);
    });
    mode.set(true);
    settle(rt);
    expect(seen.at(-1)).toBe(10);
    s2.set(3);
    settle(rt);
    expect(seen.at(-1)).toBe(30);
  });

  it("ignores a write into a dependency the run is dropping", () => {
    const rt = runtimeFor(strategy);
    const mode = signal(true);
    const a = signal(0);
    const t = signal(0);
    const c = computed(() => a());
    const seen: string[] = [];
    effect(() => {
      if (seen.length > CAP) return;
      if (mode()) {
        seen.push(`c${c()}`);
        return;
      }
      a.set(1000 + seen.length);
      seen.push(`t${t()}`);
    });
    mode.set(false);
    settle(rt);
    const runs = seen.length;
    a.set(-5);
    settle(rt);
    expect(seen.length).toBe(runs);
    t.set(1);
    settle(rt);
    expect(seen.at(-1)).toBe("t1");
    expect(seen.length).toBe(runs + 1);
  });

  it("follows a branch flip written by a computed during validation", () => {
    const rt = runtimeFor(strategy);
    const trig = signal(0);
    const pick = signal(true);
    const a = signal(0);
    const b = signal(0);
    let armed = false;
    const c1 = computed(() => (pick() ? a() : b()));
    const c0 = computed(() => {
      trig();
      if (armed) {
        armed = false;
        pick.set(false);
        b.set(7);
      }
      return 0;
    });
    const seen: number[] = [];
    effect(() => {
      if (seen.length > CAP) return;
      seen.push(c1());
      c0();
    });
    armed = true;
    trig.set(1);
    settle(rt);
    expect(seen.at(-1)).toBe(7);
    b.set(8);
    settle(rt);
    expect(seen.at(-1)).toBe(8);
  });
});

describe.each(strategies)("computed invalidated during its own evaluation [%s]", (strategy) => {
  // `c4` reads `s0`, then evaluates `c0`, whose evaluation writes `s0`.
  function selfInvalidating() {
    const rt = runtimeFor(strategy);
    const s0 = signal(0);
    const s1 = signal(0);
    const mode = signal(0);
    let armed = false;
    const c0 = computed(() => {
      const v = s1();
      if (armed) {
        armed = false;
        s0.set(10);
      }
      return v;
    });
    const c4 = computed(() => s0() + c0());
    const seen: number[] = [];
    return { rt, s0, s1, mode, c4, seen, arm: () => (armed = true) };
  }

  it("delivers when the write precedes the recompute (validation path)", () => {
    const g = selfInvalidating();
    effect(() => {
      g.seen.push(g.c4());
    });
    g.arm();
    g.s1.set(1);
    settle(g.rt);
    expect(g.seen.at(-1)).toBe(11);
  });

  it("delivers when a direct change forces execution", () => {
    const g = selfInvalidating();
    const t = signal(0);
    effect(() => {
      t();
      g.seen.push(g.c4());
    });
    g.arm();
    g.rt.batch(() => {
      t.set(1);
      g.s1.set(1);
    });
    settle(g.rt);
    expect(g.seen.at(-1)).toBe(11);
  });

  // F1 (open, owner decision): on its first evaluation the computed commits a
  // value computed before the write and stays clean, so neither the computed
  // nor the effect ever observes it. Remove `.fails` when F1 is resolved.
  it.fails("F1: observes the write on the computed's first evaluation", () => {
    const g = selfInvalidating();
    effect(() => {
      if (g.mode() === 0) return;
      g.seen.push(g.c4());
    });
    g.arm();
    g.mode.set(1);
    settle(g.rt);
    expect(g.seen.at(-1)).toBe(10);
  });
});
