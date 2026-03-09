import { describe, expect, it, vi } from "vitest";
import { computed, signal } from "../api/reactivity";

describe("graph invariants", () => {
  // ─── Correctness ───────────────────────────────────────────────────────────

  describe("correctness", () => {
    it("computed returns initial value", () => {
      const [x] = signal(10);
      const a = computed(() => x() * 2);
      expect(a()).toBe(20);
    });

    it("computed updates after signal write", () => {
      const [x, setX] = signal(1);
      const a = computed(() => x() + 1);
      setX(5);
      expect(a()).toBe(6);
    });

    it("computed through chain: a → b → c", () => {
      const [x, setX] = signal(10);
      const a = computed(() => x() + 1);
      const b = computed(() => a() + 1);
      const c = computed(() => b() + 1);
      expect(c()).toBe(13);
      setX(20);
      expect(c()).toBe(23);
    });

    it("diamond: D = B(a) + C(a), result correct after update", () => {
      const [a, setA] = signal(1);
      const B = computed(() => a() + 1); // 2
      const C = computed(() => a() * 2); // 2
      const D = computed(() => B() + C()); // 4
      expect(D()).toBe(4);
      setA(3);
      expect(D()).toBe(3 + 1 + 3 * 2); // 10
    });

    it("two independent signals, only one changes", () => {
      const [x, setX] = signal(10);
      const [y] = signal(5);
      const a = computed(() => x() + y());
      expect(a()).toBe(15);
      setX(20);
      expect(a()).toBe(25);
    });

    it("memoisation: same value write does not change computed", () => {
      const [x, setX] = signal(1);
      const a = computed(() => x());
      expect(a()).toBe(1);
      setX(1); // same value
      expect(a()).toBe(1);
    });
  });

  // ─── Memoisation (no unnecessary recomputes) ───────────────────────────────

  describe("memoisation", () => {
    it("does not recompute on repeated read without write", () => {
      const fn = vi.fn((x: number) => x * 2);
      const [x] = signal(5);
      const a = computed(() => fn(x()));

      a();
      a();
      a();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("recomputes exactly once per signal write", () => {
      const fn = vi.fn((x: number) => x);
      const [x, setX] = signal(1);
      const a = computed(() => fn(x()));

      a();
      expect(fn).toHaveBeenCalledTimes(1);

      setX(2);
      a();
      expect(fn).toHaveBeenCalledTimes(2);

      setX(3);
      a();
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("does not recompute when signal written with same value", () => {
      const fn = vi.fn((x: number) => x);
      const [x, setX] = signal(42);
      const a = computed(() => fn(x()));

      a();
      expect(fn).toHaveBeenCalledTimes(1);

      setX(42);
      a();
      expect(fn).toHaveBeenCalledTimes(1); // no recompute
    });

    it("chain: each node recomputes exactly once per upstream write", () => {
      const fnA = vi.fn((x: number) => x + 1);
      const fnB = vi.fn((x: number) => x + 1);
      const fnC = vi.fn((x: number) => x + 1);

      const [x, setX] = signal(0);
      const a = computed(() => fnA(x()));
      const b = computed(() => fnB(a()));
      const c = computed(() => fnC(b()));

      c();
      expect(fnA).toHaveBeenCalledTimes(1);
      expect(fnB).toHaveBeenCalledTimes(1);
      expect(fnC).toHaveBeenCalledTimes(1);

      setX(1);
      c();
      expect(fnA).toHaveBeenCalledTimes(2);
      expect(fnB).toHaveBeenCalledTimes(2);
      expect(fnC).toHaveBeenCalledTimes(2);
    });

    it("diamond: each branch recomputes once, consumer recomputes once", () => {
      const fnB = vi.fn((x: number) => x + 1);
      const fnC = vi.fn((x: number) => x * 0);
      const fnD = vi.fn((b: number, c: number) => b + c);

      const [a, setA] = signal(1);
      const B = computed(() => fnB(a()));
      const C = computed(() => fnC(a()));
      const D = computed(() => fnD(B(), C()));

      D();
      expect(fnB).toHaveBeenCalledTimes(1);
      expect(fnC).toHaveBeenCalledTimes(1);
      expect(fnD).toHaveBeenCalledTimes(1);

      setA(2);
      D();
      expect(fnB).toHaveBeenCalledTimes(2);
      expect(fnC).toHaveBeenCalledTimes(2);
      expect(fnD).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Selective recomputation ───────────────────────────────────────────────

  describe("selective recomputation", () => {
    it("only affected branch recomputes when one of two signals changes", () => {
      const fnA = vi.fn((x: number) => x);
      const fnB = vi.fn((y: number) => y);

      const [x, setX] = signal(10);
      const [y, setY] = signal(10);
      const a = computed(() => fnA(x()));
      const b = computed(() => fnB(y()));
      const c = computed(() => a() + b());

      c();
      expect(fnA).toHaveBeenCalledTimes(1);
      expect(fnB).toHaveBeenCalledTimes(1);

      setX(20);
      expect(c()).toBe(30);
      expect(fnA).toHaveBeenCalledTimes(2); // recomputed
      expect(fnB).toHaveBeenCalledTimes(1); // untouched

      setY(20);
      expect(c()).toBe(40);
      expect(fnA).toHaveBeenCalledTimes(2); // untouched
      expect(fnB).toHaveBeenCalledTimes(2); // recomputed
    });

    it("SAC: unchanged-value recompute does not propagate further", () => {
      // a всегда возвращает константу — downstream не должен пересчитываться
      const fnB = vi.fn(() => 42);
      const fnC = vi.fn((x: number) => x + 1);

      const [x, setX] = signal(1);
      const b = computed(fnB); // игнорирует x, всегда 42
      const _x = computed(() => x()); // читает x чтобы b не был изолирован
      const c = computed(() => fnC(b()));

      c();
      expect(fnB).toHaveBeenCalledTimes(1);
      expect(fnC).toHaveBeenCalledTimes(1);

      // b зависит от x косвенно — нет, b не читает x
      // Меняем сигнал который НЕ является dep b
      setX(2);
      _x(); // актуализируем _x

      // c читает b, b не изменился — c не должен пересчитываться
      c();
      expect(fnB).toHaveBeenCalledTimes(1);
      expect(fnC).toHaveBeenCalledTimes(1);
    });

    it("wide fan-out: only nodes downstream of changed signal recompute", () => {
      const [x, setX] = signal(1);
      const [y] = signal(1);

      const fns = Array.from({ length: 5 }, () => vi.fn((v: number) => v));

      // Первые 3 зависят от x, последние 2 — только от y
      const nodes = [
        computed(() => fns[0]!(x())),
        computed(() => fns[1]!(x())),
        computed(() => fns[2]!(x())),
        computed(() => fns[3]!(y())),
        computed(() => fns[4]!(y())),
      ];

      nodes.forEach((n) => n());
      fns.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));

      setX(2);
      nodes.forEach((n) => n());

      expect(fns[0]).toHaveBeenCalledTimes(2);
      expect(fns[1]).toHaveBeenCalledTimes(2);
      expect(fns[2]).toHaveBeenCalledTimes(2);
      expect(fns[3]).toHaveBeenCalledTimes(1); // y не менялся
      expect(fns[4]).toHaveBeenCalledTimes(1); // y не менялся
    });
  });

  // ─── Structural invariants ─────────────────────────────────────────────────

  describe("structural invariants", () => {
    it("lazy: computed does not run until read", () => {
      const fn = vi.fn(() => 1);
      computed(fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it("lazy: computed does not rerun after write until read", () => {
      const fn = vi.fn((x: number) => x);
      const [x, setX] = signal(1);
      const a = computed(() => fn(x()));

      a(); // первый read
      setX(2); // write без read
      setX(3); // ещё write без read

      expect(fn).toHaveBeenCalledTimes(1); // не пересчитался

      a(); // read
      expect(fn).toHaveBeenCalledTimes(2); // пересчитался один раз
    });

    it("multiple writes before read: only one recompute", () => {
      const fn = vi.fn((x: number) => x);
      const [x, setX] = signal(0);
      const a = computed(() => fn(x()));

      a();
      expect(fn).toHaveBeenCalledTimes(1);

      setX(1);
      setX(2);
      setX(3);

      a();
      expect(fn).toHaveBeenCalledTimes(2);
      expect(a()).toBe(3);
    });
  });
});
