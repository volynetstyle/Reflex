import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRuntime } from "../src";

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

  return { signal, computed, rt };
}

describe("Reactive system — core invariants & behaviors", () => {
  let signal: ReturnType<typeof setup>["signal"];
  let computed: ReturnType<typeof setup>["computed"];

  beforeEach(() => {
    ({ signal, computed } = setup());
  });

  // ────────────────────────────────────────────────────────────────
  // 1. Базова коректність
  // ────────────────────────────────────────────────────────────────
  describe("Basic correctness", () => {
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

    it("write without read → no computation", () => {
      const spy = vi.fn((n) => n * 2);
      const [x, setX] = signal(1);
      computed(() => spy(x()));
      setX(10);
      setX(20);
      setX(30);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
