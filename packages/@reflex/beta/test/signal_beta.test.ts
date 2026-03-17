import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRuntime } from "../src";
import { ReactiveNodeKind, ReactiveNodeState } from "../src/core";

function setup() {
  const rt = createRuntime();

  const signal = <T>(initial: T) => {
    const s = rt.signal(initial);
    return [s.read.bind(s), s.write.bind(s)] as const;
  };

  const computed = <T>(fn: () => T, name = "") => {
    const c = rt.computed(fn);
    // для дебагу можна додати .name = name
    return c;
  };

  return { signal, computed, effect: rt.effect, rt };
}

function countIncoming(node: { firstIn: { nextIn: unknown } | null }) {
  let count = 0;
  for (let edge = node.firstIn; edge; edge = edge.nextIn as typeof edge) {
    count++;
  }
  return count;
}

describe("Reactive system — core invariants & behaviors", () => {
  let signal: ReturnType<typeof setup>["signal"];
  let computed: ReturnType<typeof setup>["computed"];
  let effect: ReturnType<typeof setup>["effect"];

  beforeEach(() => {
    ({ signal, computed, effect } = setup());
  });

  // ────────────────────────────────────────────────────────────────
  // 1. Базова коректність
  // ────────────────────────────────────────────────────────────────
  describe("Basic correctness", () => {
    it("no glitch: diamond always consistent", () => {
      const [x, setX] = signal(1);

      const b = computed(() => x() * 2);
      const c = computed(() => x() * 3);
      const d = computed(() => b() + c());

      setX(2);

      expect(d()).toBe(10); // не 2*1 + 3*2 и прочий кошмар
    });

    it("SAC chain: upstream recompute with same value must not cascade", () => {
      const fnB = vi.fn(() => {
        x();
        return 1; // всегда одно и то же
      });

      const fnC = vi.fn((v: number) => v + 1);
      const fnD = vi.fn((v: number) => v + 1);

      const [x, setX] = signal(0);

      const b = computed(fnB);
      const c = computed(() => fnC(b()));
      const d = computed(() => fnD(c()));

      // initial
      expect(d()).toBe(3);

      expect(fnB).toHaveBeenCalledTimes(1);
      expect(fnC).toHaveBeenCalledTimes(1);
      expect(fnD).toHaveBeenCalledTimes(1);

      // update: значение b не меняется
      setX(1);
      expect(d()).toBe(3);

      // B пересчитался (читает x)
      expect(fnB).toHaveBeenCalledTimes(2);

      // C и D НЕ должны пересчитываться
      expect(fnC).toHaveBeenCalledTimes(1);
      expect(fnD).toHaveBeenCalledTimes(1);
    });

    it("signal returns initial value", () => {
      const [x] = signal(42);
      expect(x()).toBe(42);
    });

    it("computed derives value from signal", () => {
      const [x] = signal(7);
      const double = computed(() => x() * 2);
      expect(double()).toBe(14);
    });

    it("computed updates after signal write", () => {
      const [count, setCount] = signal(1);
      const next = computed(() => count() + 1);
      setCount(10);
      expect(next()).toBe(11);
    });

    it("multiple writes → last value wins", () => {
      const [val, set] = signal(0);
      const view = computed(() => val());
      set(1);
      set(7);
      set(3);
      set(8);
      expect(view()).toBe(8);
    });

    it("runtime creates signal/computed nodes with explicit kinds", () => {
      const rt = createRuntime();
      const s = rt.signal(1);
      const c = rt.computed(() => s.read() * 2);

      expect(s.node.kind).toBe(ReactiveNodeKind.Signal);
      expect(c.node.kind).toBe(ReactiveNodeKind.Computed);
      expect(s.node.kind === ReactiveNodeKind.Signal).toBe(true);
      expect(c.node.kind === ReactiveNodeKind.Computed).toBe(true);
      expect(c.node.kind === ReactiveNodeKind.Effect).toBe(false);
    });

    it("memo computes immediately on creation", () => {
      const rt = createRuntime();
      const s = rt.signal(2);
      const spy = vi.fn(() => s.read() * 3);

      const m = rt.memo(spy);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(m.node.v).toBeGreaterThan(0);
      expect(m()).toBe(6);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 2. Мемоїзація та кількість обчислень
  // ────────────────────────────────────────────────────────────────
  describe("Memoization & recomputation count", () => {
    it("repeated read → no extra computation", () => {
      const spy = vi.fn((n: number) => n * 10);
      const [x] = signal(4);
      const tenX = computed(() => spy(x()));
      tenX();
      tenX();
      tenX();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("write same value → no recompute", () => {
      const spy = vi.fn((n) => n);
      const [s, set] = signal(100);
      const c = computed(() => spy(s()));
      c();
      set(100);
      c();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("chain A→B→C → each recomputes exactly once per change", () => {
      const aSpy = vi.fn((n) => n + 1);
      const bSpy = vi.fn((n) => n + 10);
      const cSpy = vi.fn((n) => n + 100);

      const [x, setX] = signal(0);
      const a = computed(() => aSpy(x()));
      const b = computed(() => bSpy(a()));
      const c = computed(() => cSpy(b()));

      c(); // 1 виклик кожного
      setX(5);
      c(); // ще 1 виклик кожного

      expect(aSpy).toHaveBeenCalledTimes(2);
      expect(bSpy).toHaveBeenCalledTimes(2);
      expect(cSpy).toHaveBeenCalledTimes(2);
    });

    it("diamond (B & C → D) → each node once per relevant change", () => {
      const bSpy = vi.fn((n) => n + 1);
      const cSpy = vi.fn((n) => n * 2);
      const dSpy = vi.fn((b, c) => b + c);

      const [x, setX] = signal(3);
      const b = computed(() => bSpy(x()));
      const c = computed(() => cSpy(x()));
      const d = computed(() => dSpy(b(), c()));

      d();
      setX(5);
      d();

      expect(bSpy).toHaveBeenCalledTimes(2);
      expect(cSpy).toHaveBeenCalledTimes(2);
      expect(dSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 3. Selective / Smart recomputation (SAC — same-as-current)
  // ────────────────────────────────────────────────────────────────
  describe("Smart recomputation (SAC)", () => {
    it("upstream changed but value same → downstream not recomputed", () => {
      const spyC = vi.fn((n) => n + 1);

      const [x, setX] = signal(1);
      const b = computed(() => {
        x();
        return 42;
      });
      const c = computed(() => spyC(b()));

      c();
      setX(999);
      c();

      expect(spyC).toHaveBeenCalledTimes(1);
    });

    it("diamond: both branches same value after change → sink not recomputed", () => {
      const [x, setX] = signal(1);

      const b = computed(() => {
        x();
        return 10;
      });
      const c = computed(() => {
        x();
        return 20;
      });
      const dSpy = vi.fn(() => b() + c());
      const d = computed(dSpy);

      d(); // 30
      setX(999);
      d(); // все ще 30 → dSpy викликався лише раз!

      expect(dSpy).toHaveBeenCalledTimes(1);
    });

    it("unrelated branch does not recompute", () => {
      const spyA = vi.fn((n) => n);
      const spyB = vi.fn((n) => n);

      const [x, setX] = signal(1);
      const [y] = signal(100);

      const a = computed(() => spyA(x()));
      const b = computed(() => spyB(y()));
      const sum = computed(() => a() + b());

      sum();
      setX(10);
      sum();

      expect(spyA).toHaveBeenCalledTimes(2);
      expect(spyB).toHaveBeenCalledTimes(1);
    });

    it("recompute updates v every time but t only on value change", () => {
      const rt = createRuntime();
      const x = rt.signal(1);
      const c = rt.computed(() => x.read() % 2);

      expect(c()).toBe(1);
      const firstComputedAt = c.node.v;
      const firstChangedAt = c.node.t;

      x.write(3);
      expect(c()).toBe(1);
      expect(c.node.v).toBeGreaterThan(firstComputedAt);
      expect(c.node.t).toBe(firstChangedAt);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 4. Динамічні залежності (умови, switch гілок)
  // ────────────────────────────────────────────────────────────────
  describe("Dynamic dependencies", () => {
    it("conditional branch switch → correct value & untrack old dep", () => {
      const spy = vi.fn();

      const [flag, toggle] = signal(true);
      const [a] = signal(100);
      const [b, setB] = signal(200);

      const c = computed(() => {
        spy();
        return flag() ? a() : b();
      });

      c(); // 100
      toggle(false); // → b
      c(); // 200

      spy.mockClear();
      setB(999);
      c(); // має перерахуватись
      expect(spy).toHaveBeenCalledTimes(1);
      expect(c()).toBe(999);
    });

    it("branch switch removes old dependency after stable recompute", () => {
      const rt = createRuntime();
      const flag = rt.signal(true);
      const a = rt.signal(1);
      const b = rt.signal(10);

      const spy = vi.fn(() => (flag.read() ? a.read() : b.read()));
      const c = rt.computed(spy);

      expect(c()).toBe(1);
      expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();

      flag.write(false);
      expect(c()).toBe(10);

      spy.mockClear();
      a.write(2);
      expect(c()).toBe(10);
      expect(spy).not.toHaveBeenCalled();

      b.write(20);
      expect(c()).toBe(20);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 5. Ледачі обчислення та стабільність
  // ────────────────────────────────────────────────────────────────
  describe("Laziness & stability", () => {
    it("computed not executed until first read", () => {
      const spy = vi.fn(() => 777);
      computed(spy);
      expect(spy).not.toHaveBeenCalled();
    });

    it("memo first read reuses eager value", () => {
      const rt = createRuntime();
      const x = rt.signal(5);
      const spy = vi.fn(() => x.read() * 2);
      const m = rt.memo(spy);

      expect(m()).toBe(10);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("write without read → no computation", () => {
      const spy = vi.fn((n) => n * 2);
      const [x, setX] = signal(1);
      computed(() => spy(x()));
      setX(10);
      setX(20);
      setX(30);
      expect(spy).not.toHaveBeenCalled();
    });

    it("write marks downstream invalid but does not recompute eagerly", () => {
      const rt = createRuntime();
      const x = rt.signal(1);
      const spy = vi.fn(() => x.read() * 2);
      const c = rt.computed(spy);

      expect(c()).toBe(2);
      spy.mockClear();

      x.write(2);
      expect(c.node.state & ReactiveNodeState.Invalid).toBeTruthy();
      expect(spy).not.toHaveBeenCalled();
    });

    it("clean read after settlement clears dirty flags", () => {
      const rt = createRuntime();
      const x = rt.signal(1);
      const c = rt.computed(() => x.read() * 2);

      x.write(2);
      expect(
        c.node.state & (ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete),
      ).toBeTruthy();

      expect(c()).toBe(4);
      expect(
        c.node.state & (ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete),
      ).toBeFalsy();
    });

    it("stable recompute keeps tracking flag and advances tracking epoch", () => {
      const rt = createRuntime();
      const x = rt.signal(1);
      const c = rt.computed(() => x.read() * 2);

      expect(c()).toBe(2);
      expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();
      const firstTrackEpoch = c.node.s;

      x.write(5);
      expect(c()).toBe(10);
      expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();
      expect(c.node.s).toBe(firstTrackEpoch + 1);
    });

    it("new dependency found during stable pass re-enables tracking", () => {
      const rt = createRuntime();
      const flag = rt.signal(true);
      const a = rt.signal(1);
      const b = rt.signal(2);

      const c = rt.computed(() => (flag.read() ? a.read() : b.read()));

      expect(c()).toBe(1);
      expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();
      const stableTrackEpoch = c.node.s;

      flag.write(false);
      expect(c()).toBe(2);
      expect(c.node.s).toBe(stableTrackEpoch + 1);
      expect(c.node.state & ReactiveNodeState.Tracking).toBe(0);

      b.write(3);
      expect(c()).toBe(3);
      expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();
    });
  });

  describe("Effects", () => {
    it("initial run", () => {
      const rt = createRuntime();
      const source = rt.signal(1);
      const spy = vi.fn(() => {
        source.read();
      });

      const effect = rt.effect(spy);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(effect.node.kind).toBe(ReactiveNodeKind.Effect);
      expect(effect.node.state & ReactiveNodeState.Invalid).toBeFalsy();
      expect(countIncoming(effect.node)).toBe(1);
    });

    it("re-run after signal write", () => {
      const rt = createRuntime();
      const source = rt.signal(1);
      const spy = vi.fn(() => {
        source.read();
      });

      rt.effect(spy);
      expect(spy).toHaveBeenCalledTimes(1);

      source.write(2);
      expect(spy).toHaveBeenCalledTimes(1);

      rt.flush();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("dedupe before flush", () => {
      const rt = createRuntime();
      const source = rt.signal(1);
      const spy = vi.fn(() => {
        source.read();
      });

      rt.effect(spy);
      spy.mockClear();

      source.write(2);
      source.write(3);
      source.write(4);

      rt.flush();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(source.read()).toBe(4);
    });

    it("cleanup before rerun", () => {
      const rt = createRuntime();
      const source = rt.signal(1);
      const cleanup = vi.fn();
      const spy = vi.fn(() => {
        source.read();
        return cleanup;
      });

      rt.effect(spy);
      expect(cleanup).not.toHaveBeenCalled();

      source.write(2);
      rt.flush();

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("cleanup on dispose", () => {
      const rt = createRuntime();
      const source = rt.signal(1);
      const cleanup = vi.fn();
      const spy = vi.fn(() => {
        source.read();
        return cleanup;
      });

      const effect = rt.effect(spy);

      effect.dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(effect.node.state & ReactiveNodeState.Disposed).toBeTruthy();
      expect(countIncoming(effect.node)).toBe(0);

      source.write(2);
      rt.flush();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("dynamic dependency switch", () => {
      const rt = createRuntime();
      const flag = rt.signal(true);
      const a = rt.signal(1);
      const b = rt.signal(10);
      const spy = vi.fn(() => {
        if (flag.read()) {
          a.read();
        } else {
          b.read();
        }
      });

      const effect = rt.effect(spy);

      expect(countIncoming(effect.node)).toBe(2);

      flag.write(false);
      rt.flush();
      expect(spy).toHaveBeenCalledTimes(2);
      expect(countIncoming(effect.node)).toBe(2);

      spy.mockClear();
      a.write(2);
      rt.flush();
      expect(spy).not.toHaveBeenCalled();

      b.write(20);
      rt.flush();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Safety & robustness", () => {
    it("restores active consumer after thrown compute", () => {
      const rt = createRuntime();
      const source = rt.signal(1);
      const boom = rt.computed(() => {
        source.read();
        throw new Error("boom");
      });
      const stable = rt.computed(() => source.read() + 1);

      expect(() => boom()).toThrow("boom");
      expect(rt.ctx.activeComputed).toBe(null);
      expect(stable()).toBe(2);
      expect(rt.ctx.activeComputed).toBe(null);
    });

    it("repeated reads do not duplicate dependency edges", () => {
      const rt = createRuntime();
      const source = rt.signal(1);
      const derived = rt.computed(() => source.read() * 2);

      expect(derived()).toBe(2);
      expect(derived()).toBe(2);
      expect(derived()).toBe(2);

      expect(countIncoming(derived.node)).toBe(1);
      expect(countIncoming(source.node)).toBe(0);
    });

    it("batchWrite applies duplicate writes in order and keeps the last value", () => {
      const rt = createRuntime();
      const source = rt.signal(1);
      const derived = rt.computed(() => source.read() * 10);

      expect(derived()).toBe(10);

      rt.batchWrite([
        [source, 2],
        [source, 7],
        [source, 9],
      ]);

      expect(source.read()).toBe(9);
      expect(derived()).toBe(90);
    });

    it("failed recompute keeps previous cached value", () => {
      const rt = createRuntime();
      const source = rt.signal(1);
      let shouldThrow = false;
      const derived = rt.computed(() => {
        const value = source.read() * 2;
        if (shouldThrow) throw new Error("unstable");
        return value;
      });

      expect(derived()).toBe(2);

      shouldThrow = true;
      source.write(2);
      expect(() => derived()).toThrow("unstable");
      expect(derived.node.value).toBe(2);
    });
  });
});
